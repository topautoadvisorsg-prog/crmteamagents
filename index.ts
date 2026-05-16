import { startOrchestrator } from "./services/workers/orchestrator";
import { initInfrastructure } from "./infrastructure/redis";
import { initClickHouse } from "./infrastructure/clickhouse";
import { ReconciliationService } from "./services/reconciler";
import { startScheduler } from "./services/scheduler";
import "./services/admin"; // single server: ingestion + execute + admin UI all on PORT

async function bootstrap() {
  console.log("AI Lead Execution Control Plane (V1.8) Booting...");

  // 1. Initialize Redis Streams and Consumer Groups
  await initInfrastructure();

  // 2. Initialize ClickHouse for Observability
  await initClickHouse();

  // 3. Start Reconciliation Engine
  const reconciler = new ReconciliationService();
  reconciler.start();

  // 4. Start the worker pool
  startOrchestrator().catch(err => {
    console.error("Failed to start orchestrator:", err);
    process.exit(1);
  });

  // 5. Start the lead sourcer scheduler
  startScheduler();
}

bootstrap();
