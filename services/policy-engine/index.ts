import { PolicyDecision, ExecutionContext } from "../../types";
import { checkProspect } from "../prospect-store";

// Skills that require the contact to be a warm lead (replied/interested)
const WARM_ONLY_SKILLS  = ["book_call", "scrape_site", "crm_sync"];

// Any skill that results in contacting the prospect
const OUTREACH_SKILLS   = ["send_email", "send_sms", "book_call"];

// Contact statuses that qualify as warm
const WARM_STATUSES     = ["prospect", "warm", "replied", "interested", "qualified", "customer"];

export class PolicyEngine {
  async evaluate(context: ExecutionContext): Promise<PolicyDecision> {
    const lead = context.current_state;

    // Rule 1: No outreach on weekends
    // Override with DISABLE_WEEKEND_POLICY=true for testing / markets that run 7 days
    const today = new Date().getDay();
    const weekendPolicyEnabled = process.env.DISABLE_WEEKEND_POLICY !== "true";
    if (weekendPolicyEnabled && (today === 0 || today === 6)) {
      return { allow: false, reason: "Outreach blocked: Weekend policy enforced (set DISABLE_WEEKEND_POLICY=true to override)" };
    }

    // Rule 2: Max loop depth guard
    if (context.loop_depth >= 5) {
      return { allow: false, reason: "Execution blocked: Max loop depth reached" };
    }

    // Rule 3: Tenant isolation check
    if (!context.history[0]?.metadata.tenant_id) {
      return { allow: false, reason: "Execution blocked: Missing tenant identity" };
    }

    // Rule 4: Do-Not-Outreach guard (HARD BLOCK)
    // Check the prospect store before ANY outreach skill runs.
    // If status is do_not_outreach or converted — do not contact via automation.
    const pendingSkill = (context as any).pending_skill as string | undefined;
    if (pendingSkill && OUTREACH_SKILLS.includes(pendingSkill)) {
      const phone = lead.phone || lead.phone_number || undefined;
      const email = lead.email || undefined;

      if (phone || email) {
        const check = await checkProspect({ phone, email });
        if (check.known && check.prospect) {
          if (check.prospect.status === "do_not_outreach") {
            return {
              allow: false,
              reason: `Outreach BLOCKED: ${phone || email} is marked do_not_outreach. Reason: ${check.prospect.notes || "opted out"}`,
            };
          }
          if (check.prospect.status === "converted") {
            return {
              allow: false,
              reason: `Outreach BLOCKED: ${phone || email} is already a CRM contact (converted). Use direct CRM contact, not automated outreach.`,
            };
          }
        }
      }
    }

    // Rule 5: Warm lead gate
    // High-value actions (booking, scraping, syncing) only run on warm contacts.
    const contactStatus = (lead.status || "new").toLowerCase();
    const isWarm = WARM_STATUSES.includes(contactStatus);
    const lastAction = context.history
      .filter(e => e.type === "action_completed")
      .slice(-1)[0]?.payload?.action as string | undefined;

    if (lastAction && WARM_ONLY_SKILLS.includes(lastAction) && !isWarm) {
      return {
        allow: false,
        reason: `Execution blocked: "${lastAction}" requires a warm lead. Contact status is "${contactStatus}".`,
      };
    }

    return {
      allow: true,
      reason: "Policy check passed",
      overrides: isWarm ? ["warm_lead_gate_passed"] : [],
    };
  }
}
