/**
 * Territory Service — ZIP Code Exhaustion Tracking
 *
 * Tracks which ZIP codes agents have already researched.
 * A ZIP is "exhausted" after being searched — it won't be re-searched
 * until the cooldown period expires (default: 90 days).
 *
 * Key pattern: territory:zip:{zip}
 * TTL: cooldownDays * 86400 seconds
 */

import { redis } from "../../infrastructure/redis";

const KEY_PREFIX = "territory:zip:";
const DEFAULT_COOLDOWN_DAYS = 90;

export interface ZipRecord {
  zip: string;
  city?: string;
  state?: string;
  lastSearched: string;       // ISO timestamp
  searchCount: number;
  prospectsFound: number;
  cooldownDays: number;
  expiresAt: string;          // ISO timestamp when cooldown lifts
  status: "exhausted" | "available";
}

function zipKey(zip: string) {
  return `${KEY_PREFIX}${zip.replace(/\D/g, "")}`;
}

/**
 * Mark a ZIP code as searched by an agent run.
 * Safe to call multiple times — increments counter.
 */
export async function markZipSearched(params: {
  zip: string;
  city?: string;
  state?: string;
  prospectsFound?: number;
  cooldownDays?: number;
}): Promise<ZipRecord> {
  const { zip, city, state, prospectsFound = 0, cooldownDays = DEFAULT_COOLDOWN_DAYS } = params;
  const key = zipKey(zip);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + cooldownDays * 86400 * 1000);

  // Read existing record
  const existing = await redis.get(key);
  const prev: Partial<ZipRecord> = existing ? JSON.parse(existing) : {};

  const record: ZipRecord = {
    zip,
    city: city ?? prev.city,
    state: state ?? prev.state,
    lastSearched: now.toISOString(),
    searchCount: (prev.searchCount ?? 0) + 1,
    prospectsFound: (prev.prospectsFound ?? 0) + prospectsFound,
    cooldownDays,
    expiresAt: expiresAt.toISOString(),
    status: "exhausted",
  };

  await redis.set(key, JSON.stringify(record), "EX", cooldownDays * 86400);
  return record;
}

/**
 * Get the current status of a ZIP code.
 * Returns null if the ZIP has never been searched (or cooldown expired).
 */
export async function getZipStatus(zip: string): Promise<ZipRecord | null> {
  const raw = await redis.get(zipKey(zip));
  if (!raw) return null;
  return JSON.parse(raw) as ZipRecord;
}

/**
 * Check if a ZIP is available to search (never searched, or cooldown expired).
 */
export async function isZipAvailable(zip: string): Promise<boolean> {
  const status = await getZipStatus(zip);
  return status === null; // null means key expired or never set → available
}

/**
 * List all tracked ZIP codes with their current status.
 * Uses a single pipeline — no N+1 TTL calls.
 */
export async function listAllZips(): Promise<ZipRecord[]> {
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (!keys.length) return [];

  // Batch GET and TTL in one pipeline
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
    pipeline.ttl(key);
  }
  const results = await pipeline.exec();
  if (!results) return [];

  const zips: ZipRecord[] = [];
  for (let i = 0; i < results.length; i += 2) {
    const [errGet, val] = results[i];
    const [, ttlRaw]    = results[i + 1];
    if (errGet || !val || typeof val !== "string") continue;
    try {
      const record = JSON.parse(val) as ZipRecord;
      const ttl = (ttlRaw as number) ?? -1;
      zips.push({
        ...record,
        status: ttl > 0 ? "exhausted" : "available",
      });
    } catch {}
  }

  return zips.sort((a, b) => new Date(b.lastSearched).getTime() - new Date(a.lastSearched).getTime());
}

/**
 * Manually reset a ZIP code cooldown — makes it available immediately.
 */
export async function resetZip(zip: string): Promise<boolean> {
  const deleted = await redis.del(zipKey(zip));
  return deleted > 0;
}

/**
 * Get a summary count of territory coverage.
 */
export async function getTerritorySummary(): Promise<{
  totalTracked: number;
  exhausted: number;
  available: number;
  totalProspectsFound: number;
}> {
  const zips = await listAllZips();
  const exhausted = zips.filter(z => z.status === "exhausted").length;
  const totalProspectsFound = zips.reduce((sum, z) => sum + (z.prospectsFound ?? 0), 0);
  return {
    totalTracked: zips.length,
    exhausted,
    available: zips.length - exhausted,
    totalProspectsFound,
  };
}
