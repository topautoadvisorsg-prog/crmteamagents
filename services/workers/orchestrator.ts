import { redis, STREAMS, GROUPS, pushToStream, acknowledgeMessage, reserveIdempotency, removeIdempotency, updateExecutionState, ExecutionState } from "../../infrastructure/redis";
import { PolicyEngine } from "../policy-engine";
import { LLMClassifier } from "../llm-classifier";
import { ExecutionGate } from "../execution-gate";
import { SKILL_REGISTRY } from "../skill-router/registry";
import { BusinessEvent, ExecutionContext, LLMClassification, PolicyDecision } from "../../types";
import { logToClickHouse } from "../../infrastructure/clickhouse";
import crypto from "crypto";

const policyEngine = new PolicyEngine();
const llmClassifier = new LLMClassifier();
const executionGate = new ExecutionGate();

async function getTraceHistory(trace_id: string): Promise<BusinessEvent[]> {
  // In a real implementation, we'd use Redis XREAD or a secondary index
  // For this demo, we'll simulate fetching history for the trace
  // Actually, let's use a Redis Set or Hash to track trace events
  const historyRaw = await redis.lrange(`history:${trace_id}`, 0, -1);
  return historyRaw.map(h => JSON.parse(h));
}

async function addToTraceHistory(trace_id: string, event: BusinessEvent) {
  await redis.rpush(`history:${trace_id}`, JSON.stringify(event));
  await redis.expire(`history:${trace_id}`, 3600); // 1 hour TTL
}

async function processEvent(event: BusinessEvent) {
  const { trace_id } = event.metadata;
  const startTime = Date.now();

  try {
    // 1. Update history
    await addToTraceHistory(trace_id, event);
    const history = await getTraceHistory(trace_id);

    // 2. Build Context
    const context: ExecutionContext = {
      trace_id,
      history,
      current_state: history.reduce((state, e) => ({ ...state, ...e.payload }), {}),
      loop_depth: history.filter(e => e.type === "action_completed").length,
      llm_calls_count: history.filter(e => e.type === "action_requested").length,
    };

    // 3. Optional LLM Classification (only if we need a new action)
    // For this engine, we classify if the last event was ingestion or completion
    if (event.type === "lead_ingested" || event.type === "action_completed") {
      
      // RUN POLICY BEFORE LLM
      const policyDecision = await policyEngine.evaluate(context);

      if (!policyDecision.allow) {
        console.warn(`[Orchestrator] Policy BLOCKED: ${policyDecision.reason}`);
        await logStep(trace_id, "policy_engine", "fail", Date.now() - startTime, policyDecision.reason);
        return;
      }

      let classification: LLMClassification;
      try {
        classification = await llmClassifier.classify(context);
      } catch (err: any) {
        console.error(`[Orchestrator] LLM Classification failed: ${err.message}`);
        return;
      }

      // EXECUTION GATE
      const skill = SKILL_REGISTRY[classification.action];
      const gateResult = await executionGate.validate(context, classification, policyDecision, skill);

      if (!gateResult.allowed) {
        console.warn(`[Orchestrator] Execution BLOCKED: ${gateResult.reason}`);
        await logStep(trace_id, "execution_gate", "fail", Date.now() - startTime, gateResult.reason);
        return;
      }

      // ATOMIC PRE-EXECUTION LOCK
      const actionHash = crypto
        .createHash("sha256")
        .update(`${classification.action}:${context.current_state.id}:${JSON.stringify(classification)}`)
        .digest("hex");

      const locked = await reserveIdempotency(actionHash);
      if (!locked) {
        console.warn(`[Orchestrator] Execution BLOCKED: Idempotency lock already held or completed.`);
        await logStep(trace_id, "idempotency_lock", "fail", Date.now() - startTime, "Duplicate or in-progress action detected");
        return;
      }

      // EXECUTE SKILL
      console.log(`[Orchestrator] Executing skill: ${classification.action}`);
      try {
        const result = await executeWithRetry(skill, context.current_state, skill!.retries);
        
        // IDEMPOTENCY COMMIT (Mark as COMPLETED)
        await updateExecutionState(actionHash, ExecutionState.COMPLETED);

        // LOG COMPLETION
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
        await logStep(trace_id, "skill_execution", "ok", Date.now() - startTime);

      } catch (skillError: any) {
        console.error(`[Orchestrator] Skill execution failed after retries: ${skillError.message}`);
        
        // UPDATE STATE TO FAILED (allows manual audit/retry)
        await updateExecutionState(actionHash, ExecutionState.FAILED);
        
        await logStep(trace_id, "skill_execution", "fail", Date.now() - startTime, skillError.message);
      }
    }

  } catch (error: any) {
    console.error(`[Orchestrator] Error processing event: ${error.message}`);
  }
}

async function logStep(trace_id: string, step: string, status: "ok" | "fail", latency: number, error?: string) {
  const log = {
    trace_id,
    span_id: crypto.randomUUID(),
    step,
    status,
    latency_ms: latency,
    error,
    timestamp: new Date().toISOString(),
  };
  await pushToStream(STREAMS.LOGS, log);
  await logToClickHouse(log);
  console.log(`[OBSERVABILITY] ${JSON.stringify(log)}`);
}

export async function startOrchestrator(workerId: string = `worker-${crypto.randomUUID()}`) {
  console.log(`Orchestrator Service [${workerId}] started, listening for events...`);
  
  while (true) {
    try {
      // Pull from Redis Stream using Consumer Group
      const results = await (redis as any).xreadgroup(
        "GROUP", GROUPS.MAIN_WORKER_GROUP, workerId,
        "BLOCK", 0,
        "COUNT", 1,
        "STREAMS", STREAMS.EVENTS, ">"
      ) as Array<[string, Array<[string, string[]]>]> | null;

      if (results) {
        const [, messages] = results[0]!;
        for (const [id, [_, data]] of messages) {
          const event = JSON.parse(data);
          
          await processEvent(event);
          
          // Acknowledge message after successful processing
          await acknowledgeMessage(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, id);
        }
      }
    } catch (error: any) {
      console.error(`[Orchestrator] Loop error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

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
