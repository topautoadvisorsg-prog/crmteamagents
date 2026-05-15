/**
 * Activity Feed — Live event stream for the admin UI
 *
 * Stores the last 200 agent events in a Redis list.
 * Admin UI polls this every 5s for real-time visibility.
 */

import { redis } from "../../infrastructure/redis";

const FEED_KEY   = "activity:feed";
const MAX_EVENTS = 200;

export type ActivityLevel = "info" | "success" | "warn" | "error";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  category: "prospect" | "skill" | "policy" | "territory" | "system" | "token";
  message: string;
  meta?: Record<string, any>;
}

export async function pushActivity(params: Omit<ActivityEvent, "id" | "timestamp">): Promise<void> {
  const event: ActivityEvent = {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    ...params,
  };
  const pipeline = redis.pipeline();
  pipeline.lpush(FEED_KEY, JSON.stringify(event));
  pipeline.ltrim(FEED_KEY, 0, MAX_EVENTS - 1);
  await pipeline.exec();
}

export async function getActivityFeed(limit = 50): Promise<ActivityEvent[]> {
  const raw = await redis.lrange(FEED_KEY, 0, Math.min(limit - 1, MAX_EVENTS - 1));
  return raw.map(r => {
    try { return JSON.parse(r) as ActivityEvent; } catch { return null; }
  }).filter(Boolean) as ActivityEvent[];
}
