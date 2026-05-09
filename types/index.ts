export type TraceId = string;
export type SpanId = string;

export type EventStatus = "ok" | "fail";

export interface EventMetadata {
  trace_id: TraceId;
  span_id: SpanId;
  parent_span_id?: SpanId;
  timestamp: string;
  source: string;
  tenant_id: string;
}

export interface BaseEvent {
  metadata: EventMetadata;
  payload: any;
}

export interface BusinessEvent extends BaseEvent {
  type: "lead_ingested" | "lead_updated" | "action_requested" | "action_completed" | "action_failed";
}

export type IntentType = "outreach" | "scoring" | "booking" | "enrichment";

export interface LLMClassification {
  intent: IntentType;
  action: string;
  confidence: number;
  reasoning_short: string;
  schema_version: "v1.0";
}

export interface PolicyDecision {
  allow: boolean;
  reason: string;
  overrides?: string[];
}

export interface Skill {
  name: string;
  version: string;
  input_schema: any;
  output_schema: any;
  timeout_ms: number;
  retries: number;
  idempotent: boolean;
  execute(input: any): Promise<any>;
}

export interface ExecutionContext {
  trace_id: TraceId;
  history: BusinessEvent[];
  current_state: Record<string, any>;
  loop_depth: number;
  llm_calls_count: number;
}

export interface ObservabilityLog {
  trace_id: TraceId;
  span_id: SpanId;
  step: string;
  status: EventStatus;
  latency_ms: number;
  error?: string;
  metadata?: Record<string, any>;
}
