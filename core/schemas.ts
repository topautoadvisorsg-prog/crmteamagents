import { z } from "zod";

export const EventMetadataSchema = z.object({
  trace_id: z.string().uuid(),
  span_id: z.string().uuid(),
  parent_span_id: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  source: z.string(),
  tenant_id: z.string(),
});

export const BusinessEventSchema = z.object({
  metadata: EventMetadataSchema,
  type: z.enum([
    "lead_ingested",
    "lead_updated",
    "action_requested",
    "action_completed",
    "action_failed",
  ]),
  payload: z.any(),
});

export const LLMClassificationSchema = z.object({
  intent: z.enum(["outreach", "scoring", "booking", "enrichment"]),
  action: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning_short: z.string(),
  schema_version: z.literal("v1.0"),
});

export const PolicyDecisionSchema = z.object({
  allow: z.boolean(),
  reason: z.string(),
  overrides: z.array(z.string()).optional(),
});

export const LeadSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
  company: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const IngestionPayloadSchema = z.object({
  idempotency_key: z.string(),
  tenant_id: z.string(),
  schema_version: z.string(),
  source: z.string(),
  lead: LeadSchema,
});

/**
 * Standardized lead intake event schema (snake_case)
 * used for public contracts.
 */
export const LeadIntakeEventSchema = IngestionPayloadSchema;

export const SkillRegistrySchema = z.object({
  name: z.string(),
  version: z.string(),
  input_schema: z.any(),
  output_schema: z.any(),
  timeout_ms: z.number(),
  retries: z.number(),
  idempotent: z.literal(true),
});

export const ObservabilityLogSchema = z.object({
  trace_id: z.string(),
  span_id: z.string(),
  step: z.string(),
  status: z.enum(["ok", "fail"]),
  latency_ms: z.number(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
