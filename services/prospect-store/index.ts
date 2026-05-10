/**
 * PROSPECT STORE
 *
 * Redis-backed dedup layer for the agents platform.
 * Agents check here BEFORE reaching out to anyone.
 * Agent's source of truth — fast O(1) lookups.
 *
 * Keys:
 *   prospect:phone:{normalized}  → JSON blob
 *   prospect:email:{normalized}  → JSON blob
 *   prospect:id:{id}             → JSON blob
 *
 * On write: stores in Redis + async-syncs to CRM PostgreSQL via /api/prospects.
 * On read:  Redis only (no CRM round-trip needed).
 *
 * Status lifecycle:
 *   new → outreached → responded → converted | do_not_outreach
 */

import { redis } from "../../infrastructure/redis";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export type ProspectStatus =
  | "new"
  | "outreached"
  | "responded"
  | "converted"
  | "do_not_outreach";

export interface Prospect {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  company: string | null;
  source: string;
  agentId: string | null;
  status: ProspectStatus;
  notes: string | null;
  outreachedAt: string | null;
  respondedAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Normalize phone to digits-only for dedup
// ──────────────────────────────────────────────
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ──────────────────────────────────────────────
// CHECK — call BEFORE reaching out to anyone
// Returns the prospect if known, null if unknown
// ──────────────────────────────────────────────
export async function checkProspect(params: {
  phone?: string;
  email?: string;
}): Promise<{ known: boolean; prospect: Prospect | null; reason: string }> {
  let prospect: Prospect | null = null;

  if (params.phone) {
    const raw = await redis.get(`prospect:phone:${normalizePhone(params.phone)}`);
    if (raw) prospect = JSON.parse(raw);
  }

  if (!prospect && params.email) {
    const raw = await redis.get(`prospect:email:${normalizeEmail(params.email)}`);
    if (raw) prospect = JSON.parse(raw);
  }

  if (!prospect) {
    return { known: false, prospect: null, reason: "not_found" };
  }

  return {
    known: true,
    prospect,
    reason: prospect.status === "do_not_outreach"
      ? "do_not_outreach"
      : prospect.status === "converted"
      ? "already_crm_contact"
      : "already_in_pool",
  };
}

// ──────────────────────────────────────────────
// REGISTER — agent found someone new
// Returns {created: true} or {created: false, existing} if already known
// ──────────────────────────────────────────────
export async function registerProspect(params: {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  source: string;
  agentId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean; prospect: Prospect }> {
  // Dedup check first
  const check = await checkProspect({
    phone: params.phone || undefined,
    email: params.email || undefined,
  });

  if (check.known && check.prospect) {
    return { created: false, prospect: check.prospect };
  }

  const prospect: Prospect = {
    id: uuidv4(),
    phone: params.phone || null,
    email: params.email || null,
    name: params.name || null,
    company: params.company || null,
    source: params.source,
    agentId: params.agentId || null,
    status: "new",
    notes: params.notes || null,
    outreachedAt: null,
    respondedAt: null,
    convertedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await _writeToRedis(prospect);

  // Async sync to CRM — do not block agent execution
  _syncToCRM(prospect, params.metadata).catch((err) => {
    console.error("[ProspectStore] CRM sync failed:", err.message);
  });

  return { created: true, prospect };
}

// ──────────────────────────────────────────────
// UPDATE STATUS — outreached, responded, etc.
// ──────────────────────────────────────────────
export async function updateProspectStatus(params: {
  phone?: string | null;
  email?: string | null;
  prospectId?: string | null;
  status: ProspectStatus;
  notes?: string;
}): Promise<Prospect | null> {
  let prospect: Prospect | null = null;

  // Find by ID first, then phone/email
  if (params.prospectId) {
    const raw = await redis.get(`prospect:id:${params.prospectId}`);
    if (raw) prospect = JSON.parse(raw);
  }
  if (!prospect && params.phone) {
    const raw = await redis.get(`prospect:phone:${normalizePhone(params.phone)}`);
    if (raw) prospect = JSON.parse(raw);
  }
  if (!prospect && params.email) {
    const raw = await redis.get(`prospect:email:${normalizeEmail(params.email)}`);
    if (raw) prospect = JSON.parse(raw);
  }

  if (!prospect) return null;

  const now = new Date().toISOString();
  const updated: Prospect = {
    ...prospect,
    status: params.status,
    notes: params.notes ?? prospect.notes,
    outreachedAt: params.status === "outreached" ? now : prospect.outreachedAt,
    respondedAt: params.status === "responded" || params.status === "do_not_outreach" ? now : prospect.respondedAt,
    convertedAt: params.status === "converted" ? now : prospect.convertedAt,
    updatedAt: now,
  };

  await _writeToRedis(updated);

  // Async sync status update to CRM
  _syncStatusToCRM(updated).catch((err) => {
    console.error("[ProspectStore] CRM status sync failed:", err.message);
  });

  return updated;
}

// ──────────────────────────────────────────────
// INTERNAL — write to all Redis keys
// ──────────────────────────────────────────────
async function _writeToRedis(p: Prospect): Promise<void> {
  const json = JSON.stringify(p);
  const writes: Promise<any>[] = [redis.set(`prospect:id:${p.id}`, json, "EX", TTL_SECONDS)];
  if (p.phone) writes.push(redis.set(`prospect:phone:${normalizePhone(p.phone)}`, json, "EX", TTL_SECONDS));
  if (p.email) writes.push(redis.set(`prospect:email:${normalizeEmail(p.email)}`, json, "EX", TTL_SECONDS));
  await Promise.all(writes);
}

// ──────────────────────────────────────────────
// INTERNAL — sync new prospect to CRM PostgreSQL
// ──────────────────────────────────────────────
async function _syncToCRM(p: Prospect, metadata?: Record<string, unknown>): Promise<void> {
  const crmUrl = process.env.CRM_BASE_URL;
  const token = process.env.AGENT_INTERNAL_TOKEN;
  if (!crmUrl || !token) return; // Skip if CRM not configured

  await axios.post(
    `${crmUrl}/api/prospects`,
    {
      phone: p.phone,
      email: p.email,
      name: p.name,
      company: p.company,
      source: p.source,
      agentId: p.agentId,
      notes: p.notes,
      metadata: metadata || null,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
      },
      timeout: 5000,
    }
  );
}

// ──────────────────────────────────────────────
// INTERNAL — sync status update to CRM
// ──────────────────────────────────────────────
async function _syncStatusToCRM(p: Prospect): Promise<void> {
  const crmUrl = process.env.CRM_BASE_URL;
  const token = process.env.AGENT_INTERNAL_TOKEN;
  if (!crmUrl || !token) return;

  // First find the CRM prospect ID by phone/email via check endpoint
  try {
    const checkRes = await axios.get(`${crmUrl}/api/prospects/check`, {
      params: { phone: p.phone || undefined, email: p.email || undefined },
      headers: { "X-Internal-Token": token },
      timeout: 5000,
    });

    const crmProspectId = checkRes.data?.prospect?.id;
    if (!crmProspectId) return;

    if (p.status === "do_not_outreach") {
      await axios.post(
        `${crmUrl}/api/prospects/${crmProspectId}/do-not-outreach`,
        { reason: p.notes || "Opted out via agent" },
        { headers: { "X-Internal-Token": token }, timeout: 5000 }
      );
    } else {
      await axios.patch(
        `${crmUrl}/api/prospects/${crmProspectId}`,
        { status: p.status, notes: p.notes },
        { headers: { "X-Internal-Token": token }, timeout: 5000 }
      );
    }
  } catch {
    // Non-fatal — Redis is source of truth for agents
  }
}
