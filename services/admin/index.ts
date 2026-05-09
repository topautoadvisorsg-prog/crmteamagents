import express from "express";
import { redis, getExecutionState, updateExecutionState, removeIdempotency, ExecutionState, STREAMS, GROUPS } from "../../infrastructure/redis";

const app = express();
app.use(express.json());

const PORT = process.env.ADMIN_PORT || 3001;

/**
 * GET /status/:trace_id
 * Check the lifecycle state of a specific execution
 */
app.get("/status/:trace_id", async (req, res) => {
  const { trace_id } = req.params;
  // Note: This assumes we know the actionHash. In a real system, 
  // we'd search Redis keys or ClickHouse for the hash(es) associated with this trace_id.
  const state = await getExecutionState(trace_id); 
  res.json({ trace_id, state });
});

/**
 * POST /retry/:trace_id
 * Safely reset idempotency to allow a retry
 */
app.post("/retry/:action_hash", async (req, res) => {
  const { action_hash } = req.params;
  const currentState = await getExecutionState(action_hash);

  if (!currentState) {
    return res.status(404).json({ error: "Action not found" });
  }

  if (currentState === ExecutionState.IN_PROGRESS) {
    return res.status(400).json({ error: "Cannot retry an in-progress action" });
  }

  await removeIdempotency(action_hash);
  res.json({ status: "success", message: "Idempotency key removed. System will allow re-execution." });
});

/**
 * GET /pending
 * List all stuck messages in the PEL
 */
app.get("/pending", async (req, res) => {
  const pending = await redis.xpending(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "-", "+", 100);
  res.json({ pending });
});

app.listen(PORT, () => {
  console.log(`Admin Control Plane API running on port ${PORT}`);
});
