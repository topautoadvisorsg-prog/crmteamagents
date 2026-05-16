import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { LLMClassification, ExecutionContext } from "../../types";
import { LLMClassificationSchema } from "../../core/schemas";
import { trackUsage } from "../token-tracker";

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

    const prompt = `
You are an intent classifier for an AI lead execution system.

Current Lead Data: ${leadData}
Event History: ${historyData}

Your job: decide what action to take next for this lead.

AVAILABLE ACTIONS (you must pick exactly one of these):
- register_prospect  → lead is new and not yet in our system (always do this first)
- check_prospect     → verify if this lead already exists before outreach
- send_email         → send an outreach email (requires email address)
- send_sms           → send an outreach SMS (requires phone number)
- book_call          → schedule a call (only if lead responded/is warm)
- scrape_site        → enrich lead by scraping their website
- mark_do_not_outreach → lead opted out or asked to stop contact
- crm_sync           → sync completed lead data to CRM

DECISION RULES:
1. If history is empty or has no "action_completed" events → action must be "register_prospect"
2. If already registered but no outreach yet → action is "send_email" or "send_sms" based on available contact info
3. If lead has replied / status is warm → action is "book_call"
4. If lead asked to stop → action is "mark_do_not_outreach"
5. For enrichment tasks → action is "scrape_site"

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
