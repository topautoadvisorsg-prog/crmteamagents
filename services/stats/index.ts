/**
 * Stats Service — daily throughput counters + skill analytics
 *
 * Keys:
 *   stats:daily:{YYYY-MM-DD}:{metric}  — daily counters (TTL 35d)
 *   stats:skill:{skillName}            — all-time per-skill counters
 */

import { redis } from "../../infrastructure/redis";
import { format } from "date-fns";

type DailyMetric =
  | "executions"
  | "policy_blocked"
  | "skill_success"
  | "skill_fail"
  | "prospects_found"
  | "emails_sent"
  | "sms_sent"
  | "calls_booked";

function dayKey(metric: DailyMetric): string {
  return `stats:daily:${format(new Date(), "yyyy-MM-dd")}:${metric}`;
}

export async function incr(metric: DailyMetric, by = 1): Promise<void> {
  const key = dayKey(metric);
  await redis.pipeline()
    .incrby(key, by)
    .expire(key, 35 * 86400)
    .exec();
}

export async function getDailyStats(): Promise<Record<DailyMetric, number>> {
  const metrics: DailyMetric[] = [
    "executions", "policy_blocked", "skill_success", "skill_fail",
    "prospects_found", "emails_sent", "sms_sent", "calls_booked",
  ];
  const today = format(new Date(), "yyyy-MM-dd");
  const pipeline = redis.pipeline();
  for (const m of metrics) pipeline.get(`stats:daily:${today}:${m}`);
  const results = await pipeline.exec();

  const out = {} as Record<DailyMetric, number>;
  metrics.forEach((m, i) => {
    out[m] = parseInt((results?.[i]?.[1] as string) || "0") || 0;
  });
  return out;
}

// Per-skill analytics
export async function trackSkillRun(skill: string, success: boolean): Promise<void> {
  const key = `stats:skill:${skill}`;
  const pipeline = redis.pipeline();
  pipeline.hincrby(key, "calls", 1);
  pipeline.hincrby(key, success ? "success" : "fail", 1);
  await pipeline.exec();
}

export async function getSkillStats(): Promise<Array<{
  skill: string; calls: number; success: number; fail: number; successRate: number;
}>> {
  const keys = await redis.keys("stats:skill:*");
  if (!keys.length) return [];

  const pipeline = redis.pipeline();
  for (const k of keys) pipeline.hgetall(k);
  const results = await pipeline.exec();
  if (!results) return [];

  return keys.map((k, i) => {
    const raw = results[i]?.[1] as Record<string, string> | null;
    const calls   = parseInt(raw?.calls   || "0");
    const success = parseInt(raw?.success || "0");
    const fail    = parseInt(raw?.fail    || "0");
    return {
      skill: k.replace("stats:skill:", ""),
      calls, success, fail,
      successRate: calls > 0 ? Math.round((success / calls) * 100) : 0,
    };
  }).sort((a, b) => b.calls - a.calls);
}
