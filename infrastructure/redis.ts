import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,      // never hang forever — fail fast after 3 tries
  enableReadyCheck: false,
  connectTimeout: 5000,         // 5s to establish connection, then throw
  lazyConnect: false,
  retryStrategy(times) {
    if (times > 5) {
      console.error("[Redis] Max reconnection attempts reached. Giving up.");
      return null;              // stop retrying, let the error surface
    }
    return Math.min(times * 500, 3000);
  },
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

export const STREAMS = {
  EVENTS: "events_stream",
  LOGS: "observability_stream",
};

export const GROUPS = {
  MAIN_WORKER_GROUP: "main_worker_group",
};

export enum ExecutionState {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export async function initInfrastructure() {
  try {
    await redis.xgroup("CREATE", STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "$", "MKSTREAM");
  } catch (e: any) {
    if (!e.message.includes("BUSYGROUP")) {
      throw e;
    }
  }
}

export async function pushToStream(stream: string, data: any) {
  const payload = JSON.stringify(data);
  return await redis.xadd(stream, "*", "data", payload);
}

export async function acknowledgeMessage(stream: string, group: string, messageId: string) {
  return await redis.xack(stream, group, messageId);
}

export async function checkIdempotency(key: string): Promise<boolean> {
  const exists = await redis.get(`idempotency:${key}`);
  if (exists) return true;
  return false;
}

export async function reserveIdempotency(key: string, ttlSeconds: number = 3600): Promise<boolean> {
  // Use SET with NX to acquire an atomic lock
  // Default TTL of 1 hour to prevent permanent "stuck" locks
  const result = await redis.set(`idempotency:${key}`, ExecutionState.IN_PROGRESS, "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function updateExecutionState(key: string, state: ExecutionState, ttlSeconds: number = 86400) {
  // COMPLETED states usually have longer TTL (e.g., 24 hours) for deduplication
  await redis.set(`idempotency:${key}`, state, "EX", ttlSeconds);
}

export async function getExecutionState(key: string): Promise<ExecutionState | null> {
  return (await redis.get(`idempotency:${key}`)) as ExecutionState | null;
}

export async function removeIdempotency(key: string) {
  await redis.del(`idempotency:${key}`);
}
