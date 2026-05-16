/**
 * Agent Config Service
 *
 * Stores agent configurations in Redis. Each agent has:
 * - What to search for (ICP, industries, keywords)
 * - Where to search (target ZIPs/cities)
 * - What to do with leads (outreach template, cadence)
 * - Operational settings (enabled, schedule)
 *
 * Key: agent:config:{id}
 * Index: agent:index (sorted set by createdAt)
 */

import { redis } from "../../infrastructure/redis";
import crypto from "crypto";

export type AgentStatus = "active" | "paused" | "draft";
export type OutreachChannel = "email" | "sms" | "both";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;

  // ICP (Ideal Customer Profile)
  icp: {
    industries: string[];           // e.g. ["roofing", "hvac", "plumbing"]
    keywords: string[];             // e.g. ["roof damage", "storm damage"]
    negativeKeywords: string[];     // e.g. ["commercial", "new construction"]
    minEmployees?: number;
    maxEmployees?: number;
    businessType?: string;          // e.g. "residential contractor"
  };

  // Geographic targeting
  territory: {
    targetZips: string[];           // specific ZIPs to prioritize
    targetCities: string[];         // e.g. ["Miami", "Hialeah"]
    targetStates: string[];         // e.g. ["FL"]
    cooldownDays: number;           // days before re-searching a ZIP
    radiusMiles?: number;
  };

  // Outreach settings
  outreach: {
    channel: OutreachChannel;
    emailTemplate: string;          // subject + body (can contain {name}, {company})
    smsTemplate: string;
    maxOutreachPerDay: number;
    followUpDays: number;           // days before follow-up if no response
    requireWarmLead: boolean;       // if true, only outreach warm/responded leads
  };

  // Lead qualification rules
  qualification: {
    minConfidenceScore: number;     // 0-1, LLM confidence threshold
    autoRegister: boolean;          // auto-register to prospect store
    autoOutreach: boolean;          // auto-send outreach after register
  };

  // Metadata
  createdAt: string;
  updatedAt: string;
  totalLeadsFound: number;
  totalOutreachSent: number;
}

const KEY_PREFIX = "agent:config:";
const INDEX_KEY  = "agent:index";

function agentKey(id: string) { return `${KEY_PREFIX}${id}`; }

// ──────────────────────────────────────────────────────────
// CREATE
// ──────────────────────────────────────────────────────────
export async function createAgent(params: Omit<AgentConfig, "id" | "createdAt" | "updatedAt" | "totalLeadsFound" | "totalOutreachSent">): Promise<AgentConfig> {
  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const agent: AgentConfig = {
    ...params,
    id,
    createdAt: now,
    updatedAt: now,
    totalLeadsFound: 0,
    totalOutreachSent: 0,
  };

  await redis.pipeline()
    .set(agentKey(id), JSON.stringify(agent))
    .zadd(INDEX_KEY, Date.now(), id)
    .exec();

  return agent;
}

// ──────────────────────────────────────────────────────────
// LIST ALL
// ──────────────────────────────────────────────────────────
export async function listAgents(): Promise<AgentConfig[]> {
  const ids = await redis.zrevrange(INDEX_KEY, 0, -1);
  if (!ids.length) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) pipeline.get(agentKey(id));
  const results = await pipeline.exec();

  return (results ?? [])
    .map(([, v]) => { try { return v ? JSON.parse(v as string) : null; } catch { return null; } })
    .filter(Boolean) as AgentConfig[];
}

// ──────────────────────────────────────────────────────────
// GET ONE
// ──────────────────────────────────────────────────────────
export async function getAgent(id: string): Promise<AgentConfig | null> {
  const raw = await redis.get(agentKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as AgentConfig; } catch { return null; }
}

// ──────────────────────────────────────────────────────────
// UPDATE
// ──────────────────────────────────────────────────────────
export async function updateAgent(id: string, updates: Partial<Omit<AgentConfig, "id" | "createdAt">>): Promise<AgentConfig | null> {
  const existing = await getAgent(id);
  if (!existing) return null;

  const updated: AgentConfig = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(agentKey(id), JSON.stringify(updated));
  return updated;
}

// ──────────────────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────────────────
export async function deleteAgent(id: string): Promise<boolean> {
  const result = await redis.pipeline()
    .del(agentKey(id))
    .zrem(INDEX_KEY, id)
    .exec();
  return ((result?.[0]?.[1] as number) ?? 0) > 0;
}

// ──────────────────────────────────────────────────────────
// STATUS TOGGLE
// ──────────────────────────────────────────────────────────
export async function setAgentStatus(id: string, status: AgentStatus): Promise<AgentConfig | null> {
  return updateAgent(id, { status });
}

// ──────────────────────────────────────────────────────────
// INCREMENT COUNTERS
// ──────────────────────────────────────────────────────────
export async function incrAgentLeads(id: string, count = 1): Promise<void> {
  const agent = await getAgent(id);
  if (!agent) return;
  await updateAgent(id, { totalLeadsFound: agent.totalLeadsFound + count });
}

export async function incrAgentOutreach(id: string, count = 1): Promise<void> {
  const agent = await getAgent(id);
  if (!agent) return;
  await updateAgent(id, { totalOutreachSent: agent.totalOutreachSent + count });
}

// ──────────────────────────────────────────────────────────
// DEFAULT TEMPLATE (for new agent creation)
// ──────────────────────────────────────────────────────────
export function getDefaultAgentTemplate(): Omit<AgentConfig, "id" | "createdAt" | "updatedAt" | "totalLeadsFound" | "totalOutreachSent"> {
  return {
    name: "New Agent",
    description: "",
    status: "draft",
    icp: {
      industries: [],
      keywords: [],
      negativeKeywords: [],
      businessType: "",
    },
    territory: {
      targetZips: [],
      targetCities: [],
      targetStates: [],
      cooldownDays: 90,
    },
    outreach: {
      channel: "email",
      emailTemplate: "Hi {name},\n\nI noticed your business {company} and wanted to reach out...\n\nBest,\nSmartKlix Team",
      smsTemplate: "Hi {name}, this is SmartKlix. We have a service opportunity for {company}. Reply YES to learn more.",
      maxOutreachPerDay: 50,
      followUpDays: 3,
      requireWarmLead: false,
    },
    qualification: {
      minConfidenceScore: 0.7,
      autoRegister: true,
      autoOutreach: false,
    },
  };
}
