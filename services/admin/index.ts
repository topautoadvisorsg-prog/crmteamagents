import express from "express";
import path from "path";
import { redis, getExecutionState, removeIdempotency, ExecutionState, STREAMS, GROUPS, pushToStream } from "../../infrastructure/redis";
import { clickhouse } from "../../infrastructure/clickhouse";
import { listAllProspects, getProspectSummary, updateProspectStatus } from "../prospect-store";
import { listAllZips, resetZip, getTerritorySummary, markZipSearched } from "../territory";
import { getDailyUsage, getMonthlyUsage, getAllTimeUsage, getDailyHistory } from "../token-tracker";
import { getActivityFeed } from "../activity-feed";
import { getDailyStats, getSkillStats } from "../stats";
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent, setAgentStatus, getDefaultAgentTemplate } from "../agent-config";
import ingestionRouter from "../ingestion";
import executeRouter from "../execute";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

// ── Single server — all routers on Railway's one PORT ──
app.use(ingestionRouter);
app.use(executeRouter);

// ── Admin API auth — simple static token, skip for health check and SPA ──
// Set ADMIN_TOKEN env var to enable auth. If not set, admin is open (dev mode).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
app.use("/api", (req, res, next) => {
  // Health check and /api/intake routes skip admin auth
  if (req.path === "/metrics" && req.method === "GET") return next(); // allow sidebar health dot
  if (ADMIN_TOKEN && req.path !== "/health") {
    const provided = req.headers["x-admin-token"] as string || req.headers["authorization"]?.replace("Bearer ", "") || "";
    if (provided !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized — set x-admin-token header" });
    }
  }
  next();
});

// ── Utility: race any promise against a timeout so Redis can never hang the UI ──
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Serve built UI static files (production)
const UI_DIST = path.join(__dirname, "../../ui/dist");
app.use(express.static(UI_DIST));

const PORT = process.env.PORT || process.env.ADMIN_PORT || 3001;

// ──────────────────────────────────────────────────────────────────────────────
// HEALTH / METRICS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/metrics
 * System health snapshot — queue depth, PEL count, worker info
 */
app.get("/api/metrics", async (_req, res) => {
  try {
    const T = 4_500; // 4.5s timeout — always respond before Railway's 30s healthcheck

    // Queue depth
    const streamLen = await withTimeout(redis.xlen(STREAMS.EVENTS), T, 0).catch(() => 0);

    // PEL (stuck messages)
    let pelCount = 0;
    try {
      const pending = await withTimeout(
        redis.xpending(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "-", "+", 100) as Promise<any[]>,
        T, []
      );
      pelCount = Array.isArray(pending) ? pending.length : 0;
    } catch {}

    // Consumer group info
    let consumers: any[] = [];
    try {
      consumers = await withTimeout(
        redis.xinfo("CONSUMERS", STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP) as Promise<any[]>,
        T, []
      );
    } catch {}

    // Recent executions count from Redis keys
    const execKeys = await withTimeout(redis.keys("exec:state:*"), T, [] as string[]).catch(() => [] as string[]);

    // Prospect summary
    const prospectSummary = await withTimeout(
      getProspectSummary(),
      T,
      { total: 0, new: 0, outreached: 0, responded: 0, converted: 0, do_not_outreach: 0 }
    ).catch(() => ({ total: 0, new: 0, outreached: 0, responded: 0, converted: 0, do_not_outreach: 0 }));

    // Territory summary
    const territorySummary = await withTimeout(
      getTerritorySummary(),
      T,
      { totalTracked: 0, exhausted: 0, available: 0, totalProspectsFound: 0 }
    ).catch(() => ({ totalTracked: 0, exhausted: 0, available: 0, totalProspectsFound: 0 }));

    // Worker heartbeats
    const workerKeys = await withTimeout(redis.keys("worker:heartbeat:*"), T, [] as string[]).catch(() => [] as string[]);

    // Today's usage
    const todayUsage = await withTimeout(
      getDailyUsage(),
      T,
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUSD: 0 }
    ).catch(() => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUSD: 0 }));

    // Today's stats
    const dailyStats = await withTimeout(
      getDailyStats(),
      T,
      { executions: 0, policy_blocked: 0, skill_success: 0, skill_fail: 0, prospects_found: 0, emails_sent: 0, sms_sent: 0, calls_booked: 0 }
    ).catch(() => ({
      executions: 0, policy_blocked: 0, skill_success: 0, skill_fail: 0,
      prospects_found: 0, emails_sent: 0, sms_sent: 0, calls_booked: 0,
    }));

    // System health: healthy if workers alive + PEL not overloaded
    const isHealthy = workerKeys.length > 0 && pelCount < 10;
    const health = workerKeys.length === 0 ? "offline" : pelCount >= 10 ? "degraded" : "healthy";

    res.json({
      health,
      queue: {
        depth: streamLen,
        pelCount,
        consumerCount: consumers.length,
      },
      workers: {
        count: workerKeys.length,
        alive: workerKeys.length > 0,
      },
      executions: {
        tracked: execKeys.length,
      },
      today: dailyStats,
      prospects: prospectSummary,
      territory: territorySummary,
      usage: todayUsage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch metrics", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// EXECUTION MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/status/:trace_id
 */
app.get("/api/status/:trace_id", async (req, res) => {
  const { trace_id } = req.params;
  const state = await getExecutionState(trace_id).catch(() => null);
  res.json({ trace_id, state });
});

/**
 * GET /api/executions
 * Recent execution traces from ClickHouse (falls back to Redis keys)
 */
app.get("/api/executions", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 200);
  try {
    if (!clickhouse) throw new Error("ClickHouse not configured");
    const rows = await clickhouse.query({
      query: `
        SELECT
          trace_id,
          tenant_id,
          skill,
          status,
          policy_decision,
          policy_reason,
          timestamp
        FROM agent_traces
        ORDER BY timestamp DESC
        LIMIT {limit:UInt32}
      `,
      query_params: { limit },
      format: "JSONEachRow",
    });
    const data = await rows.json();
    res.json({ data, total: (data as any[]).length });
  } catch (_chError) {
    // ClickHouse not available — return recent Redis execution states
    try {
      const keys = await redis.keys("exec:state:*");
      const pipeline = redis.pipeline();
      for (const k of keys.slice(0, limit)) pipeline.get(k);
      const results = await pipeline.exec();
      const data = (results ?? [])
        .filter(([err, v]) => !err && v)
        .map(([, v]) => {
          try { return JSON.parse(v as string); } catch { return null; }
        })
        .filter(Boolean);
      res.json({ data, total: data.length, source: "redis" });
    } catch {
      res.json({ data: [], total: 0 });
    }
  }
});

/**
 * GET /api/pending
 * Messages stuck in PEL
 */
app.get("/api/pending", async (_req, res) => {
  try {
    const pending = await redis.xpending(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "-", "+", 100);
    res.json({ pending, count: Array.isArray(pending) ? pending.length : 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending messages", detail: String(error) });
  }
});

/**
 * POST /api/retry/:action_hash
 * Reset idempotency to allow re-execution
 */
app.post("/api/retry/:action_hash", async (req, res) => {
  const { action_hash } = req.params;
  const currentState = await getExecutionState(action_hash).catch(() => null);

  if (!currentState) {
    return res.status(404).json({ error: "Action not found" });
  }
  if (currentState === ExecutionState.IN_PROGRESS) {
    return res.status(400).json({ error: "Cannot retry an in-progress action" });
  }

  await removeIdempotency(action_hash);
  res.json({ success: true, message: "Idempotency key removed — system will allow re-execution." });
});

// ──────────────────────────────────────────────────────────────────────────────
// PROSPECT POOL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/prospects
 * All prospects in the Redis store
 */
app.get("/api/prospects", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = (req.query.search as string || "").toLowerCase();
    let prospects = await listAllProspects();

    if (status && status !== "all") {
      prospects = prospects.filter(p => p.status === status);
    }
    if (search) {
      prospects = prospects.filter(p =>
        p.name?.toLowerCase().includes(search) ||
        p.phone?.includes(search) ||
        p.email?.toLowerCase().includes(search) ||
        p.company?.toLowerCase().includes(search)
      );
    }

    res.json({ data: prospects, total: prospects.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch prospects", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// TERRITORY / ZIP CODE MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/territory
 * All tracked ZIP codes with status
 */
app.get("/api/territory", async (_req, res) => {
  try {
    const zips = await listAllZips();
    const summary = await getTerritorySummary();
    res.json({ data: zips, summary });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch territory data", detail: String(error) });
  }
});

/**
 * POST /api/territory/zip
 * Manually mark a ZIP as searched (for testing or manual logging)
 */
app.post("/api/territory/zip", async (req, res) => {
  const { zip, city, state, prospectsFound, cooldownDays } = req.body;
  if (!zip) return res.status(400).json({ error: "zip is required" });

  try {
    const record = await markZipSearched({ zip, city, state, prospectsFound, cooldownDays });
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: "Failed to mark ZIP", detail: String(error) });
  }
});

/**
 * POST /api/territory/zip/:zip/reset
 * Reset cooldown — make ZIP available again immediately
 */
app.post("/api/territory/zip/:zip/reset", async (req, res) => {
  const { zip } = req.params;
  try {
    const ok = await resetZip(zip);
    if (!ok) return res.status(404).json({ error: "ZIP not found in territory store" });
    res.json({ success: true, zip, message: "Cooldown reset — ZIP is now available." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset ZIP", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// WORKER STATUS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/workers
 * Active workers based on heartbeat keys (TTL 60s — dead if missed)
 */
app.get("/api/workers", async (_req, res) => {
  try {
    const keys = await redis.keys("worker:heartbeat:*");
    if (!keys.length) return res.json({ workers: [], count: 0, healthy: false });

    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.get(k);
    const results = await pipeline.exec();

    const workers = (results ?? [])
      .map(([, v]) => { try { return v ? JSON.parse(v as string) : null; } catch { return null; } })
      .filter(Boolean);

    res.json({ workers, count: workers.length, healthy: workers.length > 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch workers", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// ACTIVITY FEED
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/activity — last N events from the live feed */
app.get("/api/activity", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 200);
  try {
    const events = await getActivityFeed(limit);
    res.json({ events, count: events.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch activity", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// TOKEN USAGE & COST
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/usage — Anthropic API token usage + cost estimate */
app.get("/api/usage", async (_req, res) => {
  try {
    const [today, month, allTime, history] = await Promise.all([
      getDailyUsage(),
      getMonthlyUsage(),
      getAllTimeUsage(),
      getDailyHistory(),
    ]);
    res.json({ today, month, allTime, history });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch usage", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// ANALYTICS — throughput + skill breakdown
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/analytics — daily stats + skill breakdown */
app.get("/api/analytics", async (_req, res) => {
  try {
    const [daily, skills] = await Promise.all([getDailyStats(), getSkillStats()]);
    const successRate = (daily.skill_success + daily.skill_fail) > 0
      ? Math.round((daily.skill_success / (daily.skill_success + daily.skill_fail)) * 100)
      : 0;
    res.json({ daily, skills, successRate });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PROSPECT CSV EXPORT
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/prospects/export.csv */
app.get("/api/prospects/export.csv", async (_req, res) => {
  try {
    const prospects = await listAllProspects();
    const header = "id,name,company,phone,email,source,agentId,status,notes,createdAt,updatedAt";
    const rows = prospects.map(p =>
      [p.id, p.name, p.company, p.phone, p.email, p.source, p.agentId, p.status, p.notes, p.createdAt, p.updatedAt]
        .map(v => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`) )
        .join(",")
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="prospects-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send([header, ...rows].join("\n"));
  } catch (error) {
    res.status(500).json({ error: "Failed to export", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// AGENT CONFIGURATION CRUD
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/agents — list all agent configs */
app.get("/api/agents", async (_req, res) => {
  try {
    const agents = await listAgents();
    res.json({ data: agents, total: agents.length });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agents", detail: String(error) });
  }
});

/** GET /api/agents/template — default blank agent */
app.get("/api/agents/template", (_req, res) => {
  res.json(getDefaultAgentTemplate());
});

/** GET /api/agents/:id */
app.get("/api/agents/:id", async (req, res) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agent", detail: String(error) });
  }
});

/** POST /api/agents — create new agent */
app.post("/api/agents", async (req, res) => {
  try {
    const template = getDefaultAgentTemplate();
    const agent = await createAgent({ ...template, ...req.body });
    res.status(201).json(agent);
  } catch (error) {
    res.status(500).json({ error: "Failed to create agent", detail: String(error) });
  }
});

/** PUT /api/agents/:id — full update */
app.put("/api/agents/:id", async (req, res) => {
  try {
    const agent = await updateAgent(req.params.id, req.body);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: "Failed to update agent", detail: String(error) });
  }
});

/** POST /api/agents/:id/status — toggle active/paused/draft */
app.post("/api/agents/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["active", "paused", "draft"].includes(status)) {
    return res.status(400).json({ error: "status must be active | paused | draft" });
  }
  try {
    const agent = await setAgentStatus(req.params.id, status);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: "Failed to update status", detail: String(error) });
  }
});

/** DELETE /api/agents/:id */
app.delete("/api/agents/:id", async (req, res) => {
  try {
    const ok = await deleteAgent(req.params.id);
    if (!ok) return res.status(404).json({ error: "Agent not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete agent", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// PROSPECT MANAGEMENT — status updates, notes, delete
// ──────────────────────────────────────────────────────────────────────────────

/** PATCH /api/prospects/:id — update status and/or notes */
app.patch("/api/prospects/:id", async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ["new", "outreached", "responded", "converted", "do_not_outreach"];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    // Find prospect by ID
    const raw = await redis.get(`prospect:id:${id}`);
    if (!raw) return res.status(404).json({ error: "Prospect not found" });
    const prospect = JSON.parse(raw);

    const updated = await updateProspectStatus({
      prospectId: id,
      phone: prospect.phone,
      email: prospect.email,
      status: status || prospect.status,
      notes: notes ?? prospect.notes,
    });

    if (!updated) return res.status(404).json({ error: "Prospect not found in store" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update prospect", detail: String(error) });
  }
});

/** DELETE /api/prospects/:id */
app.delete("/api/prospects/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const raw = await redis.get(`prospect:id:${id}`);
    if (!raw) return res.status(404).json({ error: "Prospect not found" });
    const p = JSON.parse(raw);

    const pipeline = redis.pipeline();
    pipeline.del(`prospect:id:${id}`);
    if (p.phone) pipeline.del(`prospect:phone:${p.phone.replace(/\D/g, "")}`);
    if (p.email) pipeline.del(`prospect:email:${p.email.trim().toLowerCase()}`);
    await pipeline.exec();

    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete prospect", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// TEST LEAD — fire a synthetic lead through the full pipeline for testing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/test-lead
 * Fires a synthetic lead directly into the Redis stream — bypasses ingestion auth.
 * Use this to test the full pipeline without needing curl or Postman.
 */
app.post("/api/test-lead", async (req, res) => {
  try {
    const {
      name = "Test Lead",
      phone = "",
      email = "",
      company = "Test Company",
      zip = "33101",
      city = "Miami",
      state = "FL",
      no_website = true,
      industry = "General Contractor",
      tenantId = "smartklix-test",
    } = req.body;

    if (!phone && !email) {
      return res.status(400).json({ error: "Provide at least phone or email" });
    }

    const trace_id = uuidv4();
    const span_id = uuidv4();

    const event = {
      metadata: {
        trace_id,
        span_id,
        timestamp: new Date().toISOString(),
        source: "admin_test",
        tenant_id: tenantId,
      },
      type: "lead_ingested",
      payload: {
        id: uuidv4(),
        name,
        phone: phone || null,
        email: email || null,
        company,
        zip,
        city,
        state,
        no_website,   // ← tells classifier which SOP template to pick
        industry,     // ← used in outreach copy personalization
        idempotency_key: `test-${trace_id}`,
        schema_version: "1.0",
      },
    };

    await pushToStream(STREAMS.EVENTS, event);

    res.status(202).json({
      status: "accepted",
      trace_id,
      message: "Test lead fired — watch Activity Feed and Executions for processing.",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fire test lead", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS — integration health check, env visibility
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/settings — returns which integrations are configured and their status */
app.get("/api/settings", async (_req, res) => {
  // Check Redis connectivity
  let redisStatus = "disconnected";
  try {
    await withTimeout(redis.ping(), 3000, null);
    redisStatus = "connected";
  } catch {}

  // Check ClickHouse
  let clickhouseStatus = "not_configured";
  if (process.env.CLICKHOUSE_HOST) {
    clickhouseStatus = clickhouse ? "connected" : "error";
  }

  const integrations = {
    redis: { configured: !!process.env.REDIS_URL, status: redisStatus },
    anthropic: { configured: !!process.env.ANTHROPIC_API_KEY, status: process.env.ANTHROPIC_API_KEY ? "configured" : "missing" },
    resend: { configured: !!process.env.RESEND_API_KEY, status: process.env.RESEND_API_KEY ? "configured" : "simulation_mode" },
    twilio: {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      status: (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? "configured" : "simulation_mode",
    },
    firecrawl: { configured: !!process.env.FIRECRAWL_API_KEY, status: process.env.FIRECRAWL_API_KEY ? "configured" : "simulation_mode" },
    calendly: { configured: !!process.env.CALENDLY_API_KEY, status: process.env.CALENDLY_API_KEY ? "configured" : "simulation_mode" },
    clickhouse: { configured: !!process.env.CLICKHOUSE_HOST, status: clickhouseStatus },
    crm: {
      configured: !!(process.env.CRM_BASE_URL && process.env.AGENT_INTERNAL_TOKEN),
      status: (process.env.CRM_BASE_URL && process.env.AGENT_INTERNAL_TOKEN) ? "configured" : "not_configured",
      url: process.env.CRM_BASE_URL || null,
    },
    googlePlaces: {
      configured: !!process.env.GOOGLE_PLACES_API_KEY,
      status: process.env.GOOGLE_PLACES_API_KEY ? "configured" : "demo_mode",
      note: process.env.GOOGLE_PLACES_API_KEY ? "Live Google Places search active" : "Using demo mode — add GOOGLE_PLACES_API_KEY for real leads",
    },
  };

  const policies = {
    weekendOutreachDisabled: process.env.DISABLE_WEEKEND_POLICY !== "true",
    maxLoopDepth: 5,
    llmCallsPerTrace: 1,
    prospectTTLDays: 90,
    tokenCostInputPerM: parseFloat(process.env.TOKEN_COST_INPUT_PER_M || "0.80"),
    tokenCostOutputPerM: parseFloat(process.env.TOKEN_COST_OUTPUT_PER_M || "4.00"),
    resendFromEmail: process.env.RESEND_FROM_EMAIL || "noreply@resend.dev (default)",
    adminAuthEnabled: !!process.env.ADMIN_TOKEN,
    searchIntervalMinutes: parseInt(process.env.SEARCH_INTERVAL_MINUTES ?? "30", 10),
    leadSourcerMode: process.env.GOOGLE_PLACES_API_KEY ? "google_places" : "demo",
  };

  res.json({ integrations, policies, timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────────────────────
// LEAD SOURCER — status + manual trigger
// ──────────────────────────────────────────────────────────────────────────────

/** GET /api/sourcer/status — scheduler state, last run, next run */
app.get("/api/sourcer/status", async (_req, res) => {
  try {
    const { getSchedulerStatus } = await import("../scheduler");
    const status = await getSchedulerStatus();
    res.json({
      ...status,
      mode: process.env.GOOGLE_PLACES_API_KEY ? "google_places" : "demo",
      googlePlacesConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sourcer status", detail: String(error) });
  }
});

/** POST /api/sourcer/trigger — manually kick off a sourcer pass right now */
app.post("/api/sourcer/trigger", async (_req, res) => {
  try {
    const { triggerSourcerNow } = await import("../scheduler");
    const result = await triggerSourcerNow();
    if (!result.triggered) {
      return res.status(409).json({ error: result.reason });
    }
    res.json({
      triggered: true,
      message: "Lead sourcer pass triggered — watch Activity Feed for results",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger sourcer", detail: String(error) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK — required by Railway
// ──────────────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────────────────────────────────────
// SPA fallback — serve index.html for all non-API routes
// Express 5 requires {*path} instead of * for wildcard routes
// ──────────────────────────────────────────────────────────────────────────────
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(UI_DIST, "index.html"), (err) => {
    if (err) res.status(200).send("<h1>SmartKlix Agent Control</h1><p>UI not built yet. Run: cd ui && npm run build</p>");
  });
});

app.listen(PORT, () => {
  console.log(`Admin Control Plane running on port ${PORT}`);
});
