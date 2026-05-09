import { PolicyDecision, ExecutionContext } from "../../types";

// Skills that require the contact to be a warm lead (replied/interested)
const WARM_ONLY_SKILLS = ["book_call", "scrape_site", "crm_sync"];

// Contact statuses that qualify as warm
const WARM_STATUSES = ["prospect", "warm", "replied", "interested", "qualified", "customer"];

export class PolicyEngine {
  async evaluate(context: ExecutionContext): Promise<PolicyDecision> {
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

    // Rule 3: Tenant isolation check
    if (!context.history[0]?.metadata.tenant_id) {
      return {
        allow: false,
        reason: "Execution blocked: Missing tenant identity",
      };
    }

    // Rule 4: Warm lead gate
    // High-value actions (booking, scraping, syncing) only run on warm contacts.
    // Cold/new leads only get email and SMS outreach.
    const contactStatus = (lead.status || "new").toLowerCase();
    const isWarm = WARM_STATUSES.includes(contactStatus);
    const lastAction = context.history
      .filter(e => e.type === "action_completed")
      .slice(-1)[0]?.payload?.action as string | undefined;

    if (lastAction && WARM_ONLY_SKILLS.includes(lastAction) && !isWarm) {
      return {
        allow: false,
        reason: `Execution blocked: "${lastAction}" requires a warm lead. Contact status is "${contactStatus}". Only email/SMS allowed for cold contacts.`,
      };
    }

    return {
      allow: true,
      reason: "Policy check passed",
      overrides: isWarm ? ["warm_lead_gate_passed"] : [],
    };
  }
}
