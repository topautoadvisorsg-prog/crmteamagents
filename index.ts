import { startOrchestrator } from "./services/workers/orchestrator";
import { initInfrastructure } from "./infrastructure/redis";
import { initClickHouse } from "./infrastructure/clickhouse";
import { ReconciliationService } from "./services/reconciler";
import { startScheduler } from "./services/scheduler";
import "./services/admin"; // single server: ingestion + execute + admin UI all on PORT

async function bootstrap() {
  console.log("AI Lead Execution Control Plane (V1.8) Booting...");
  console.log("REDIS_URL:", process.env.REDIS_URL ? process.env.REDIS_URL.replace(/:\/\/.*@/, "://<credentials>@") : "NOT SET — set REDIS_URL in Railway Variables");

  // 1. Initialize Redis Streams and Consumer Groups
  // Non-fatal: HTTP server stays alive even if Redis is unreachable.
  // The dashboard will show "Offline" until Redis is reachable.
  try {
    await initInfrastructure();
    console.log("[Redis] Streams initialized OK");
  } catch (err: any) {
    console.error("[Redis] Failed to initialize streams:", err.message);
    console.error("[Redis] REDIS_URL may be wrong or Redis unreachable.");
    console.error("[Redis] HTTP server will continue — fix REDIS_URL in Railway Variables to enable the pipeline.");
    // Do NOT crash — let the HTTP health check stay alive
  }

  // 2. Initialize ClickHouse for Observability (non-fatal)
  try {
    await initClickHouse();
  } catch (err: any) {
    console.warn("[ClickHouse] Skipped:", err.message);
  }

  // 3. Start Reconciliation Engine (non-fatal — needs Redis)
  try {
    const reconciler = new ReconciliationService();
    reconciler.start();
  } catch (err: any) {
    console.error("[Reconciler] Failed to start:", err.message);
  }

  // 4. Start the worker pool (non-fatal — needs Redis)
  startOrchestrator().catch(err => {
    console.error("[Orchestrator] Failed to start (is REDIS_URL correct?):", err.message);
    // Don't exit — let HTTP server keep serving the UI
  });

  // 5. Start the lead sourcer scheduler (non-fatal — needs Redis)
  try {
    startScheduler();
  } catch (err: any) {
    console.error("[Scheduler] Failed to start:", err.message);
  }
}

bootstrap().catch(err => {
  // Last-resort: log but don't kill the HTTP server that's already listening
  console.error("[Bootstrap] Unhandled error:", err.message);
});
