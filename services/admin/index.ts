import express from "express";
import path from "path";
import { redis, getExecutionState, updateExecutionState, removeIdempotency, ExecutionState, STREAMS, GROUPS } from "../../infrastructure/redis";
import { clickhouse } from "../../infrastructure/clickhouse";
import { listAllProspects, getProspectSummary } from "../prospect-store";
import { listAllZips, resetZip, getTerritorySummary, markZipSearched } from "../territory";
import { getDailyUsage, getMonthlyUsage, getAllTimeUsage, getDailyHistory } from "../token-tracker";
import { getActivityFeed } from "../activity-feed";
import { getDailyStats, getSkillStats } from "../stats";

const app = express();
app.use(express.json());

// Serve built UI static files (production)
const UI_DIST = path.join(__dirname, "../../ui/dist");
app.use(express.static(UI_DIST));

const PORT = process.env.ADMIN_PORT || 3001;

// ──────────────────────────────────────────────────────────────────────────────
// HEALTH / METRICS
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/metrics
 * System health snapshot — queue depth, PEL count, worker info
 */
app.get("/api/metrics", async (_req, res) => {
  try {
    // Queue depth
    const streamLen = await redis.xlen(STREAMS.EVENTS).catch(() => 0);

    // PEL (stuck messages)
    let pelCount = 0;
    try {
      const pending = await redis.xpending(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "-", "+", 100) as any[];
      pelCount = Array.isArray(pending) ? pending.length : 0;
    } catch {}

    // Consumer group info
    let consumers: any[] = [];
    try {
      consumers = await redis.xinfo("CONSUMERS", STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP) as any[];
    } catch {}

    // Recent executions count (last 24h) from Redis keys
    const execKeys = await redis.keys("exec:state:*").catch(() => [] as string[]);

    // Prospect summary
    const prospectSummary = await getProspectSummary().catch(() => ({
      total: 0, new: 0, outreached: 0, responded: 0, converted: 0, do_not_outreach: 0,
    }));

    // Territory summary
    const territorySummary = await getTerritorySummary().catch(() => ({
      totalTracked: 0, exhausted: 0, available: 0, totalProspectsFound: 0,
    }));

    // Worker heartbeats
    const workerKeys = await redis.keys("worker:heartbeat:*").catch(() => [] as string[]);

    // Today's usage
    const todayUsage = await getDailyUsage().catch(() => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUSD: 0 }));

    // Today's stats
    const dailyStats = await getDailyStats().catch(() => ({
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
// SPA fallback — serve index.html for all non-API routes
// ──────────────────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
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
