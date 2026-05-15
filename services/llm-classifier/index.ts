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
      You are an intent classifier for a lead execution system.
      Current Lead Data: ${leadData}
      Event History: ${historyData}

      Classify the intent into one of: outreach, scoring, booking, enrichment.
      Determine the specific action to take.
      Provide a confidence score between 0 and 1.
      Provide a short reasoning.

      OUTPUT ONLY VALID JSON IN THIS FORMAT:
      {
        "intent": "outreach" | "scoring" | "booking" | "enrichment",
        "action": "string",
        "confidence": number,
        "reasoning_short": "string",
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
