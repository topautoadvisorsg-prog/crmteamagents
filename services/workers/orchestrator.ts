import { redis, STREAMS, GROUPS, pushToStream, acknowledgeMessage, reserveIdempotency, removeIdempotency, updateExecutionState, ExecutionState } from "../../infrastructure/redis";
import { PolicyEngine } from "../policy-engine";
import { LLMClassifier } from "../llm-classifier";
import { ExecutionGate } from "../execution-gate";
import { SKILL_REGISTRY } from "../skill-router/registry";
import { BusinessEvent, ExecutionContext, LLMClassification, PolicyDecision } from "../../types";
import { logToClickHouse } from "../../infrastructure/clickhouse";
import { pushActivity } from "../activity-feed";
import { incr, trackSkillRun } from "../stats";
import crypto from "crypto";

const policyEngine   = new PolicyEngine();
const llmClassifier  = new LLMClassifier();
const executionGate  = new ExecutionGate();

// ──────────────────────────────────────────────────────────────────────────────
// WORKER HEARTBEAT
// Writes a Redis key every 30s so the UI can show worker alive/offline.
// ──────────────────────────────────────────────────────────────────────────────
function startHeartbeat(workerId: string) {
  const key = `worker:heartbeat:${workerId}`;
  const ping = () =>
    redis.set(key, JSON.stringify({
      workerId,
      lastSeen: new Date().toISOString(),
      pid: process.pid,
    }), "EX", 60).catch(() => {}); // TTL 60s — if missed 2× beats it's dead

  ping();
  return setInterval(ping, 30_000);
}

// ──────────────────────────────────────────────────────────────────────────────
// TRACE HISTORY
// ──────────────────────────────────────────────────────────────────────────────
async function getTraceHistory(trace_id: string): Promise<BusinessEvent[]> {
  const historyRaw = await redis.lrange(`history:${trace_id}`, 0, -1);
  return historyRaw.map(h => JSON.parse(h));
}

async function addToTraceHistory(trace_id: string, event: BusinessEvent) {
  await redis.rpush(`history:${trace_id}`, JSON.stringify(event));
  await redis.expire(`history:${trace_id}`, 3600);
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN EVENT PROCESSOR
// ──────────────────────────────────────────────────────────────────────────────
async function processEvent(event: BusinessEvent) {
  const { trace_id } = event.metadata;
  const startTime = Date.now();

  await incr("executions");

  try {
    await addToTraceHistory(trace_id, event);
    const history = await getTraceHistory(trace_id);

    const context: ExecutionContext = {
      trace_id,
      history,
      current_state: history.reduce((state, e) => ({ ...state, ...e.payload }), {}),
      loop_depth: history.filter(e => e.type === "action_completed").length,
      llm_calls_count: history.filter(e => e.type === "action_requested").length,
    };

    if (event.type === "lead_ingested" || event.type === "action_completed") {

      // ── POLICY CHECK ──────────────────────────────────────────────────────
      const policyDecision = await policyEngine.evaluate(context);

      if (!policyDecision.allow) {
        await incr("policy_blocked");
        await pushActivity({
          level: "warn",
          category: "policy",
          message: `Policy blocked: ${policyDecision.reason}`,
          meta: { trace_id, reason: policyDecision.reason },
        });
        await logStep(trace_id, "policy_engine", "fail", Date.now() - startTime, policyDecision.reason, { tenant_id: event.metadata.tenant_id });
        return;
      }

      // ── LLM CLASSIFICATION ────────────────────────────────────────────────
      let classification: LLMClassification;
      try {
        classification = await llmClassifier.classify(context);
        await pushActivity({
          level: "info",
          category: "skill",
          message: `Classified intent: ${classification.intent} → ${classification.action} (${Math.round(classification.confidence * 100)}% confidence)`,
          meta: { trace_id, intent: classification.intent, action: classification.action, confidence: classification.confidence },
        });
      } catch (err: any) {
        await pushActivity({
          level: "error",
          category: "system",
          message: `LLM classification failed: ${err.message}`,
          meta: { trace_id },
        });
        console.error(`[Orchestrator] LLM Classification failed: ${err.message}`);
        return;
      }

      // ── EXECUTION GATE ────────────────────────────────────────────────────
      const skill = SKILL_REGISTRY[classification.action];
      const gateResult = await executionGate.validate(context, classification, policyDecision, skill);

      if (!gateResult.allowed) {
        await pushActivity({
          level: "warn",
          category: "skill",
          message: `Execution gate blocked: ${gateResult.reason}`,
          meta: { trace_id, skill: classification.action },
        });
        await logStep(trace_id, "execution_gate", "fail", Date.now() - startTime, gateResult.reason, { skill: classification.action, tenant_id: event.metadata.tenant_id });
        return;
      }

      // ── IDEMPOTENCY LOCK ──────────────────────────────────────────────────
      const actionHash = crypto
        .createHash("sha256")
        .update(`${classification.action}:${context.current_state.id}:${JSON.stringify(classification)}`)
        .digest("hex");

      const locked = await reserveIdempotency(actionHash);
      if (!locked) {
        await logStep(trace_id, "idempotency_lock", "fail", Date.now() - startTime, "Duplicate or in-progress action detected");
        return;
      }

      // ── SKILL EXECUTION ───────────────────────────────────────────────────
      await pushActivity({
        level: "info",
        category: "skill",
        message: `Running skill: ${classification.action}`,
        meta: { trace_id, skill: classification.action },
      });

      try {
        const result = await executeWithRetry(skill, context.current_state, skill!.retries);

        await updateExecutionState(actionHash, ExecutionState.COMPLETED);
        await incr("skill_success");
        await trackSkillRun(classification.action, true);

        // Skill-specific counters
        if (classification.action === "send_email") await incr("emails_sent");
        if (classification.action === "send_sms")   await incr("sms_sent");
        if (classification.action === "book_call")  await incr("calls_booked");
        if (classification.action === "register_prospect") await incr("prospects_found");

        await pushActivity({
          level: "success",
          category: "skill",
          message: `Skill completed: ${classification.action}`,
          meta: { trace_id, skill: classification.action, latencyMs: Date.now() - startTime },
        });

        const completionEvent: BusinessEvent = {
          metadata: {
            ...event.metadata,
            span_id: crypto.randomUUID(),
            parent_span_id: event.metadata.span_id,
            timestamp: new Date().toISOString(),
          },
          type: "action_completed",
          payload: { action: classification.action, result },
        };

        await pushToStream(STREAMS.EVENTS, completionEvent);
        await logStep(trace_id, "skill_execution", "ok", Date.now() - startTime, undefined, { skill: classification.action, tenant_id: event.metadata.tenant_id });

      } catch (skillError: any) {
        await updateExecutionState(actionHash, ExecutionState.FAILED);
        await incr("skill_fail");
        await trackSkillRun(classification.action, false);

        await pushActivity({
          level: "error",
          category: "skill",
          message: `Skill failed: ${classification.action} — ${skillError.message}`,
          meta: { trace_id, skill: classification.action, error: skillError.message },
        });

        console.error(`[Orchestrator] Skill execution failed after retries: ${skillError.message}`);
        await logStep(trace_id, "skill_execution", "fail", Date.now() - startTime, skillError.message, { skill: classification.action, tenant_id: event.metadata.tenant_id });
      }
    }

  } catch (error: any) {
    console.error(`[Orchestrator] Error processing event: ${error.message}`);
    await pushActivity({
      level: "error",
      category: "system",
      message: `Orchestrator error: ${error.message}`,
      meta: { trace_id },
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// LOG STEP
// ──────────────────────────────────────────────────────────────────────────────
async function logStep(
  trace_id: string,
  step: string,
  status: "ok" | "fail",
  latency: number,
  error?: string,
  extra?: Record<string, any>
) {
  const log = {
    trace_id,
    span_id: crypto.randomUUID(),
    step,
    status,
    latency_ms: latency,
    error,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  await pushToStream(STREAMS.LOGS, log);
  await logToClickHouse(log);

  // Write exec:state:* so the admin UI can find recent traces
  await redis.set(
    `exec:state:${trace_id}`,
    JSON.stringify({
      trace_id,
      skill: extra?.skill ?? step,
      status: status === "ok" ? "completed" : "failed",
      policy_decision: status === "ok" ? "allow" : "block",
      policy_reason: error ?? undefined,
      timestamp: log.timestamp,
      tenant_id: extra?.tenant_id ?? undefined,
    }),
    "EX",
    86400 * 7  // keep 7 days
  ).catch(() => {});
}

// ──────────────────────────────────────────────────────────────────────────────
// RETRY WRAPPER
// ──────────────────────────────────────────────────────────────────────────────
async function executeWithRetry(skill: any, input: any, maxRetries: number): Promise<any> {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await skill.execute(input);
    } catch (error) {
      lastError = error;
      const delay = Math.pow(2, i) * 1000;
      console.warn(`[Retry] Skill ${skill.name} failed (attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ──────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR ENTRY POINT
// ──────────────────────────────────────────────────────────────────────────────
export async function startOrchestrator(workerId: string = `worker-${crypto.randomUUID().slice(0, 8)}`) {
  console.log(`Orchestrator [${workerId}] started — listening for events`);

  // Start heartbeat
  startHeartbeat(workerId);

  await pushActivity({
    level: "info",
    category: "system",
    message: `Worker ${workerId} started`,
    meta: { workerId, pid: process.pid },
  });

  while (true) {
    try {
      // BLOCK 5000 (not 0) — prevents infinite hang when Redis connection drops
      const results = await (redis as any).xreadgroup(
        "GROUP", GROUPS.MAIN_WORKER_GROUP, workerId,
        "BLOCK", 5000,
        "COUNT", 1,
        "STREAMS", STREAMS.EVENTS, ">"
      ) as Array<[string, Array<[string, string[]]>]> | null;

      if (results) {
        const [, messages] = results[0]!;
        for (const [id, [_, data]] of messages) {
          const event = JSON.parse(data);
          await processEvent(event);
          await acknowledgeMessage(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, id);
        }
      }
    } catch (error: any) {
      console.error(`[Orchestrator] Loop error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
