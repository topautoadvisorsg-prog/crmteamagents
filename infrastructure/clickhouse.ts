import { createClient } from "@clickhouse/client";
import dotenv from "dotenv";

dotenv.config();

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "";
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || "default";
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || "";

const enabled = !!CLICKHOUSE_HOST;

export const clickhouse = enabled
  ? createClient({
      host: CLICKHOUSE_HOST,
      username: CLICKHOUSE_USER,
      password: CLICKHOUSE_PASSWORD,
      database: "default",
    })
  : null;

export async function initClickHouse() {
  if (!enabled) {
    console.log("ClickHouse not configured — observability disabled. Set CLICKHOUSE_HOST to enable.");
    return;
  }

  try {
    await clickhouse!.command({
      query: `
        CREATE TABLE IF NOT EXISTS execution_logs (
          trace_id String,
          span_id String,
          step String,
          status String,
          latency_ms UInt32,
          error String,
          metadata String,
          timestamp DateTime64(3, 'UTC')
        ) ENGINE = MergeTree()
        ORDER BY (timestamp, trace_id)
      `,
    });
    console.log("ClickHouse initialized.");
  } catch (err) {
    console.error("ClickHouse initialization failed:", err);
  }
}

export async function logToClickHouse(log: {
  trace_id: string;
  span_id: string;
  step: string;
  status: string;
  latency_ms: number;
  error?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}) {
  if (!enabled || !clickhouse) return;

  try {
    await clickhouse.insert({
      table: "execution_logs",
      values: [{
        trace_id: String(log.trace_id),
        span_id: String(log.span_id),
        step: String(log.step),
        status: String(log.status),
        latency_ms: Number(log.latency_ms),
        error: log.error ? String(log.error) : "",
        metadata: JSON.stringify(log.metadata || {}),
        timestamp: log.timestamp || new Date().toISOString(),
      }],
      format: "JSONEachRow",
    });
  } catch (err: any) {
    console.error("[ClickHouse] Insert failed:", err.message);
  }
}
