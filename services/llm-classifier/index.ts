import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { LLMClassification, ExecutionContext } from "../../types";
import { LLMClassificationSchema } from "../../core/schemas";
import { trackUsage } from "../token-tracker";
import { LLM_BUSINESS_CONTEXT, QUALIFICATION_RULES } from "../outreach-sop";

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "dummy",
});

const MODEL = "claude-haiku-4-5-20251001";

export class LLMClassifier {
  async classify(context: ExecutionContext): Promise<LLMClassification> {
    if (context.llm_calls_count >= 1) {
      throw new Error("Hard limit exceeded: max 1 LLM call per trace");
    }

    const leadData    = JSON.stringify(context.current_state);
    const historyData = JSON.stringify(context.history.map(h => ({ type: h.type, payload: h.payload })));

    // Extract key signals from lead state for better classification
    const state = context.current_state as Record<string, any>;
    const hasEmail   = !!(state.email);
    const hasPhone   = !!(state.phone);
    const noWebsite  = state.no_website === true;
    const isWarm     = ["warm", "replied", "interested"].includes(state.status);
    const optedOut   = state.status === "do_not_outreach";
    const hasWebsite = !!(state.website_url);

    const disqualifyReasons = QUALIFICATION_RULES.disqualify;

    const prompt = `
${LLM_BUSINESS_CONTEXT}

---

You are an intent classifier for the Smart Click Agency AI lead execution system.
Your job: decide the next best action for this lead based on its current state and history.

LEAD SIGNALS DETECTED:
- Has email: ${hasEmail}
- Has phone: ${hasPhone}
- No website: ${noWebsite}
- Has website URL: ${hasWebsite}
- Lead status: ${state.status || "new"}
- Is warm/replied: ${isWarm}
- Opted out: ${optedOut}

Current Lead Data: ${leadData}
Event History: ${historyData}

AVAILABLE ACTIONS (pick exactly one):
- register_prospect    → lead is new and not yet in our system (ALWAYS first)
- check_prospect       → verify lead exists before outreach
- send_email           → outreach email (requires email address)
- send_sms             → outreach SMS (requires phone number)
- book_call            → schedule a call (ONLY if lead is warm/replied)
- scrape_site          → scrape their website to qualify website quality
- mark_do_not_outreach → lead opted out or asked to stop
- crm_sync             → sync completed lead data to CRM

DECISION RULES (apply in order):
1. If opted out → "mark_do_not_outreach"
2. If history is empty or no "action_completed" events → "register_prospect"
3. If registered and disqualified (franchise/chain/modern site) → "crm_sync" with status=disqualified
4. If registered, no_website=false, no scrape yet → "scrape_site" to check website quality
5. If registered and warm/replied → "book_call"
6. If registered, not warm, has email → "send_email"
7. If registered, not warm, has phone only → "send_sms"
8. Otherwise → "crm_sync"

DISQUALIFY THESE LEADS (mark via crm_sync, do not outreach):
${disqualifyReasons.map(r => `- ${r}`).join("\n")}

OUTPUT ONLY VALID JSON (no markdown, no explanation):
{
  "intent": "outreach" | "scoring" | "booking" | "enrichment",
  "action": "<one of the AVAILABLE ACTIONS above>",
  "confidence": <number 0-1>,
  "reasoning_short": "<one sentence>",
  "schema_version": "v1.0"
}
`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    // Track token usage — never discard this
    const usage = response.usage;
    await trackUsage({
      model: MODEL,
      inputTokens:  usage.input_tokens,
      outputTokens: usage.output_tokens,
    }).catch(() => {}); // non-fatal

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Invalid response from Claude");
    }

    try {
      const parsed = JSON.parse(content.text);
      return LLMClassificationSchema.parse(parsed);
    } catch (error) {
      console.error("Failed to parse Claude response:", content.text);
      throw new Error("Failed to extract classification from LLM");
    }
  }
}
