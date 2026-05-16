/**
 * Scheduler — Runs the Lead Sourcer on a Configurable Interval
 *
 * On boot: waits 5 seconds, then runs the sourcer for ALL active agents.
 * On interval: repeats every SEARCH_INTERVAL_MINUTES (default: 30).
 *
 * Respects agent status — only "active" agents get sourced.
 * Prevents overlapping runs — if a run is already in progress, skips the tick.
 */

import { listAgents, createAgent } from "../agent-config";
import { runSourcerForAgent } from "../lead-sourcer";
import { pushActivity } from "../activity-feed";
import { redis } from "../../infrastructure/redis";

const SCHEDULER_KEY = "scheduler:last_run";
const SCHEDULER_RUNNING_KEY = "scheduler:running";

const INTERVAL_MINUTES = parseInt(process.env.SEARCH_INTERVAL_MINUTES ?? "30", 10);
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;
const STARTUP_DELAY_MS = 5000;

let schedulerRunning = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ────────────────────────────────────────────────────────────────────────────
// Core run function
// ────────────────────────────────────────────────────────────────────────────

async function runSchedulerTick(): Promise<void> {
  if (schedulerRunning) {
    console.log("[Scheduler] Tick skipped — previous run still in progress");
    return;
  }

  schedulerRunning = true;

  // Set a Redis lock so multiple instances don't double-source
  const lockAcquired = await redis
    .set(SCHEDULER_RUNNING_KEY, "1", "EX", INTERVAL_MINUTES * 60 + 120, "NX")
    .catch(() => null);

  if (!lockAcquired) {
    console.log("[Scheduler] Redis lock held by another instance — skipping tick");
    schedulerRunning = false;
    return;
  }

  try {
    const now = new Date().toISOString();
    console.log(`[Scheduler] Starting sourcer pass at ${now}`);

    await pushActivity({
      level: "info",
      category: "system",
      message: `Scheduler tick started — running lead sourcer for all active agents`,
      meta: { intervalMinutes: INTERVAL_MINUTES, triggeredAt: now },
    });

    const agents = await listAgents();
    const activeAgents = agents.filter(a => a.status === "active");

    if (activeAgents.length === 0) {
      console.log("[Scheduler] No active agents — nothing to source");
      await pushActivity({
        level: "warn",
        category: "system",
        message: "Scheduler tick: no active agents found. Activate an agent in the Agents tab to start sourcing.",
        meta: { totalAgents: agents.length },
      });
    } else {
      console.log(`[Scheduler] Running sourcer for ${activeAgents.length} active agent(s)`);

      for (const agent of activeAgents) {
        try {
          await runSourcerForAgent(agent);
        } catch (err: any) {
          console.error(`[Scheduler] Sourcer error for agent "${agent.name}":`, err.message);
          await pushActivity({
            level: "error",
            category: "system",
            message: `Lead sourcer failed for agent "${agent.name}": ${err.message}`,
            meta: { agentId: agent.id, agentName: agent.name, error: err.message },
          });
        }
      }
    }

    // Record last successful run
    await redis.set(SCHEDULER_KEY, now, "EX", 86400 * 7).catch(() => {});

    console.log(`[Scheduler] Pass complete. Next run in ${INTERVAL_MINUTES} minutes.`);

    await pushActivity({
      level: "info",
      category: "system",
      message: `Scheduler pass complete — next run in ${INTERVAL_MINUTES} minute${INTERVAL_MINUTES !== 1 ? "s" : ""}`,
      meta: { nextRunAt: new Date(Date.now() + INTERVAL_MS).toISOString() },
    });

  } catch (err: any) {
    console.error("[Scheduler] Unhandled error in scheduler tick:", err.message);
  } finally {
    schedulerRunning = false;
    await redis.del(SCHEDULER_RUNNING_KEY).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Status — readable by admin API
// ────────────────────────────────────────────────────────────────────────────

export async function getSchedulerStatus(): Promise<{
  running: boolean;
  lastRun: string | null;
  nextRunAt: string;
  intervalMinutes: number;
}> {
  const lastRun = await redis.get(SCHEDULER_KEY).catch(() => null);
  const nextRunAt = lastRun
    ? new Date(new Date(lastRun).getTime() + INTERVAL_MS).toISOString()
    : new Date(Date.now() + STARTUP_DELAY_MS).toISOString();

  return {
    running: schedulerRunning,
    lastRun,
    nextRunAt,
    intervalMinutes: INTERVAL_MINUTES,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Manual trigger — callable from admin API
// ────────────────────────────────────────────────────────────────────────────

export async function triggerSourcerNow(): Promise<{ triggered: boolean; reason?: string }> {
  if (schedulerRunning) {
    return { triggered: false, reason: "Sourcer is already running" };
  }
  // Fire async, don't await — returns immediately to caller
  setImmediate(() => runSchedulerTick().catch(console.error));
  return { triggered: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Start the scheduler (called on app boot)
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Seed default agent on first boot (if none exist)
// Creates a construction-company sourcer targeting major metros
// ────────────────────────────────────────────────────────────────────────────

const SEED_KEY = "scheduler:agents_seeded";

async function seedDefaultAgentIfNeeded(): Promise<void> {
  const alreadySeeded = await redis.get(SEED_KEY).catch(() => null);
  if (alreadySeeded) return;

  const agents = await listAgents().catch(() => []);
  if (agents.length > 0) {
    await redis.set(SEED_KEY, "1").catch(() => {});
    return;
  }

  console.log("[Scheduler] No agents found — seeding default construction sourcer agent");

  await createAgent({
    name: "Construction Co. — No Website Sourcer",
    description: "Finds construction companies across the US that have no website. Targets general contractors, roofers, painters, electricians, and plumbers. Sources leads via Google Places (or demo mode).",
    status: "active",
    icp: {
      industries: ["construction", "roofing", "plumbing", "electrical", "painting", "hvac", "general contractor"],
      keywords: ["general contractor", "roofer", "plumber", "electrician", "painter", "remodeling", "home improvement"],
      negativeKeywords: ["commercial", "franchise", "chain"],
      businessType: "residential contractor",
      minEmployees: 1,
      maxEmployees: 50,
    },
    territory: {
      targetZips: [
        // South Florida
        "33101", "33125", "33135", "33142", "33155", "33165", "33175",
        "33010", "33012", "33018", "33024", "33027", "33030",
        // Texas metros
        "75001", "75019", "75034", "75050", "75063", "75080",
        "77001", "77025", "77042", "77055", "77080", "77095",
        // Georgia
        "30002", "30032", "30058", "30080", "30120", "30152",
        // North Carolina
        "28201", "28269", "28277", "28304", "28403",
        // Ohio
        "43001", "43023", "43068", "43085", "43110",
      ],
      targetCities: ["Miami", "Houston", "Dallas", "Atlanta", "Charlotte", "Columbus"],
      targetStates: ["FL", "TX", "GA", "NC", "OH"],
      cooldownDays: 90,
      radiusMiles: 10,
    },
    outreach: {
      channel: "email",
      emailTemplate: `Subject: Quick question about your online presence

Hi {name},

I came across {company} and noticed you might not have a website yet.

In today's market, most homeowners search online before calling anyone — if you're not there, you're losing jobs to competitors who are.

We build fast, affordable websites specifically for contractors. Clients typically see more calls within 30 days.

Would you be open to a quick 10-minute call this week?

Best,
[Your Name]
Smart Click Agency`,
      smsTemplate: "Hi {name}, I noticed {company} doesn't have a website yet. We build contractor sites that get calls fast. Interested in a quick chat? Reply YES.",
      maxOutreachPerDay: 30,
      followUpDays: 5,
      requireWarmLead: false,
    },
    qualification: {
      minConfidenceScore: 0.6,
      autoRegister: true,
      autoOutreach: false, // register first, human reviews before sending
    },
  });

  await redis.set(SEED_KEY, "1").catch(() => {});

  await pushActivity({
    level: "success",
    category: "system",
    message: "Default agent seeded: Construction Co. — No Website Sourcer (active, 40 target ZIPs across FL/TX/GA/NC/OH)",
    meta: { seeded: true },
  }).catch(() => {});

  console.log("[Scheduler] Default agent seeded and set to active.");
}

export function startScheduler(): void {
  console.log(
    `[Scheduler] Starting — interval: ${INTERVAL_MINUTES}min, first run in ${STARTUP_DELAY_MS / 1000}s`
  );

  // Seed default agent before first run
  seedDefaultAgentIfNeeded().catch(err => {
    console.warn("[Scheduler] Agent seed failed (non-fatal):", err.message);
  });

  // First run after startup delay
  setTimeout(() => {
    runSchedulerTick().catch(err => {
      console.error("[Scheduler] Initial run failed:", err.message);
    });
  }, STARTUP_DELAY_MS);

  // Recurring interval
  schedulerTimer = setInterval(() => {
    runSchedulerTick().catch(err => {
      console.error("[Scheduler] Interval run failed:", err.message);
    });
  }, INTERVAL_MS);

  // Don't block Node.js process exit
  schedulerTimer.unref();
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Scheduler] Stopped.");
  }
}
