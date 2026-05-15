/**
 * Token Tracker — Anthropic API usage & cost tracking
 *
 * Every Claude API call should call trackUsage() after getting a response.
 * Stores daily + monthly aggregates in Redis.
 *
 * Pricing (claude-haiku-4-5): $0.80/M input, $4.00/M output
 * Override via TOKEN_COST_INPUT_PER_M and TOKEN_COST_OUTPUT_PER_M env vars.
 */

import { redis } from "../../infrastructure/redis";
import { format } from "date-fns";

// Pricing per million tokens
const COST_INPUT_PER_M  = parseFloat(process.env.TOKEN_COST_INPUT_PER_M  || "0.80");
const COST_OUTPUT_PER_M = parseFloat(process.env.TOKEN_COST_OUTPUT_PER_M || "4.00");

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  costUSD: number;
}

function todayKey()  { return `tokens:daily:${format(new Date(), "yyyy-MM-dd")}`; }
function monthKey()  { return `tokens:monthly:${format(new Date(), "yyyy-MM")}`; }
function allTimeKey(){ return "tokens:alltime"; }

function calcCost(input: number, output: number): number {
  return (input / 1_000_000) * COST_INPUT_PER_M + (output / 1_000_000) * COST_OUTPUT_PER_M;
}

export async function trackUsage(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const { inputTokens, outputTokens } = params;
  const cost = calcCost(inputTokens, outputTokens);

  const pipeline = redis.pipeline();
  for (const key of [todayKey(), monthKey(), allTimeKey()]) {
    pipeline.hincrbyfloat(key, "inputTokens",  inputTokens);
    pipeline.hincrbyfloat(key, "outputTokens", outputTokens);
    pipeline.hincrbyfloat(key, "calls",        1);
    pipeline.hincrbyfloat(key, "costUSD",      cost);
  }
  // Day key expires after 35 days; month key after 400 days
  pipeline.expire(todayKey(), 35 * 86400);
  pipeline.expire(monthKey(), 400 * 86400);
  await pipeline.exec();
}

async function readRecord(key: string): Promise<UsageRecord> {
  const raw = await redis.hgetall(key);
  if (!raw || Object.keys(raw).length === 0) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUSD: 0 };
  }
  const input  = parseFloat(raw.inputTokens  || "0");
  const output = parseFloat(raw.outputTokens || "0");
  return {
    inputTokens:  Math.round(input),
    outputTokens: Math.round(output),
    totalTokens:  Math.round(input + output),
    calls:        Math.round(parseFloat(raw.calls   || "0")),
    costUSD:      parseFloat((parseFloat(raw.costUSD || "0")).toFixed(6)),
  };
}

export async function getDailyUsage():   Promise<UsageRecord> { return readRecord(todayKey());  }
export async function getMonthlyUsage(): Promise<UsageRecord> { return readRecord(monthKey());  }
export async function getAllTimeUsage():  Promise<UsageRecord> { return readRecord(allTimeKey()); }

/** Last 30 days — one entry per day */
export async function getDailyHistory(): Promise<Array<{ date: string } & UsageRecord>> {
  const results: Array<{ date: string } & UsageRecord> = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = format(d, "yyyy-MM-dd");
    const rec = await readRecord(`tokens:daily:${dateStr}`);
    results.push({ date: dateStr, ...rec });
  }
  return results;
}
