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

const SEED_KEY = "scheduler:agents_seeded_v2"; // bump version to re-seed with updated defaults

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
    name: "Smart Click — Construction No-Website Sourcer",
    description: "Finds residential construction companies with no website across Colorado, Florida, Texas, Georgia, and NC. These are our ideal clients — discoverable online, active businesses, but no web presence.",
    status: "active",
    icp: {
      industries: [
        "General Contractor",
        "Roofing / Roofer",
        "Painter / Painting",
        "Electrician",
        "Plumber / Plumbing",
        "HVAC",
        "Remodeling / Renovation",
        "Concrete / Foundation",
        "Siding / Gutters",
      ],
      keywords: ["contractor", "construction", "roofing", "remodeling", "home improvement"],
      negativeKeywords: ["franchise", "chain", "national", "commercial"],
      businessType: "residential",
    },
    territory: {
      targetZips: [
        // Colorado — Denver metro (start here per user request)
        "80202","80203","80204","80205","80206","80207","80209","80210",
        "80211","80212","80214","80216","80218","80219","80220","80221",
        "80222","80223","80224","80226","80227","80228","80229","80230",
        // Colorado Springs
        "80901","80903","80904","80905","80906","80907","80908","80909",
        "80910","80911","80915","80916","80917","80918","80919","80920",
        // Aurora CO
        "80010","80011","80012","80013","80014","80015","80016","80017",
        // Miami FL
        "33101","33125","33127","33135","33142","33155","33165","33172",
        "33175","33176","33177","33178","33183","33184","33185","33186",
        // Fort Lauderdale FL
        "33301","33309","33311","33312","33313","33317","33319","33321",
        // Houston TX
        "77001","77006","77008","77018","77022","77025","77036","77040",
        "77055","77063","77071","77080","77081","77082","77083","77084",
        // Dallas TX
        "75201","75204","75206","75208","75211","75212","75217","75219",
        "75220","75223","75224","75226","75228","75232","75234","75241",
        // Atlanta GA
        "30303","30306","30307","30310","30311","30314","30315","30316",
        "30318","30310","30328","30331","30336","30339","30344","30349",
        // Charlotte NC
        "28202","28203","28205","28206","28208","28209","28210","28212",
        "28213","28214","28215","28216","28226","28227","28269","28277",
      ],
      targetCities: ["Denver", "Colorado Springs", "Aurora", "Miami", "Fort Lauderdale", "Houston", "Dallas", "Atlanta", "Charlotte"],
      targetStates: ["CO", "FL", "TX", "GA", "NC"],
      cooldownDays: 90,
    },
    outreach: {
      channel: "email",
      emailTemplate: `Hi {name},

I noticed {company} shows up online but doesn't have a website yet.

In today's market, most homeowners search Google before calling anyone — if your business isn't there, those jobs go to a competitor who is.

Smart Click Agency builds fast, professional websites for contractors. Most clients start getting more calls within 30 days. We handle everything — design, copy, hosting.

Would you be open to a quick 10-minute call this week to see if it's a fit?

Best,
[Your Name]
Smart Click Agency
smartclickagency.com`,
      smsTemplate: "Hi {name}, noticed {company} doesn't have a website yet — homeowners search online first now. We build contractor sites fast. Worth a 10-min chat? Reply YES.",
      maxOutreachPerDay: 30,
      followUpDays: 5,
      requireWarmLead: false,
    },
    qualification: {
      minConfidenceScore: 0.6,
      autoRegister: true,
      autoOutreach: false,
    },
  });

  await redis.set(SEED_KEY, "1").catch(() => {});

  await pushActivity({
    level: "success",
    category: "system",
    message: "Default agent seeded: Smart Click — Construction No-Website Sourcer (active, CO + FL + TX + GA + NC)",
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
