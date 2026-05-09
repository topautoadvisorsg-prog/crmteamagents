import { 
  ExecutionContext, 
  LLMClassification, 
  PolicyDecision, 
  Skill, 
  EventStatus 
} from "../../types";
import { checkIdempotency } from "../../infrastructure/redis";
import crypto from "crypto";

export class ExecutionGate {
  async validate(
    context: ExecutionContext,
    classification: LLMClassification,
    policy: PolicyDecision,
    skill?: Skill
  ): Promise<{ allowed: boolean; reason: string }> {
    
    // 1. Schema validation (Done via Zod in other layers, but can add extra here)
    if (classification.schema_version !== "v1.0") {
      return { allowed: false, reason: "Schema validation failed: unsupported version" };
    }

    // 2. Policy engine approval
    if (!policy.allow) {
      return { allowed: false, reason: `Policy engine block: ${policy.reason}` };
    }

    // 3. Skill registry check
    if (!skill) {
      return { allowed: false, reason: `Skill registry check failed: unknown skill for action ${classification.action}` };
    }

    // 4. Permission check (Example: check if tenant has permission for this skill)
    // For now, allow all.
    
    // 5. Semantic validation (Check if action makes sense for lead state)
    if (classification.intent === "outreach" && !context.current_state.email && !context.current_state.phone) {
      return { allowed: false, reason: "Semantic validation failed: outreach requires contact info" };
    }

    // 6. Idempotency check
    const actionHash = crypto
      .createHash("sha256")
      .update(`${classification.action}:${context.current_state.id}:${JSON.stringify(classification)}`)
      .digest("hex");
    
    const isDuplicate = await checkIdempotency(actionHash);
    if (isDuplicate) {
      return { allowed: false, reason: "Idempotency check failed: duplicate action detected" };
    }

    // 7. Rate limiting (Example: check Redis for tenant rate limits)
    // Placeholder

    // 8. Confidence check
    if (classification.confidence < 0.70) {
      return { allowed: false, reason: `Confidence check failed: ${classification.confidence} < 0.70` };
    }

    return { allowed: true, reason: "Execution gate passed" };
  }
}
