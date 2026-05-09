import { PolicyDecision, ExecutionContext } from "../../types";

export class PolicyEngine {
  async evaluate(context: ExecutionContext): Promise<PolicyDecision> {
    // Deterministic rules
    const lead = context.current_state;
    
    // Rule 1: No outreach on weekends
    const today = new Date().getDay();
    if (today === 0 || today === 6) {
      return {
        allow: false,
        reason: "Outreach blocked: Weekend policy enforced",
      };
    }

    // Rule 2: Max loop depth guard
    if (context.loop_depth >= 5) {
      return {
        allow: false,
        reason: "Execution blocked: Max loop depth reached",
      };
    }

    // Rule 3: Tenant isolation check (dummy example)
    if (!context.history[0]?.metadata.tenant_id) {
      return {
        allow: false,
        reason: "Execution blocked: Missing tenant identity",
      };
    }

    return {
      allow: true,
      reason: "Policy check passed",
    };
  }
}
