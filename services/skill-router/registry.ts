import { Skill } from "../../types";
import { ResendSDK, TwilioSDK, FirecrawlSDK, CalendlySDK } from "../../sdk";
import axios from "axios";
import { generateHMACSignature, generateJWT } from "../../core/security";

const resend = new ResendSDK();
const twilio = new TwilioSDK();
const firecrawl = new FirecrawlSDK();
const calendly = new CalendlySDK();

export const SKILL_REGISTRY: Record<string, Skill> = {
  send_email: {
    name: "send_email",
    version: "1.0.0",
    input_schema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } } },
    output_schema: { type: "object" },
    timeout_ms: 5000,
    retries: 3,
    idempotent: true,
    async execute(input: any) {
      return await resend.sendEmail(input.to, input.subject, input.body);
    }
  },
  send_sms: {
    name: "send_sms",
    version: "1.0.0",
    input_schema: { type: "object", properties: { to: { type: "string" }, message: { type: "string" } } },
    output_schema: { type: "object" },
    timeout_ms: 5000,
    retries: 2,
    idempotent: true,
    async execute(input: any) {
      return await twilio.sendSMS(input.to, input.message);
    }
  },
  scrape_site: {
    name: "scrape_site",
    version: "1.0.0",
    input_schema: { type: "object", properties: { url: { type: "string" } } },
    output_schema: { type: "object" },
    timeout_ms: 10000,
    retries: 1,
    idempotent: true,
    async execute(input: any) {
      return await firecrawl.scrape(input.url);
    }
  },
  book_call: {
    name: "book_call",
    version: "1.0.0",
    input_schema: { type: "object", properties: { email: { type: "string" }, slotId: { type: "string" } } },
    output_schema: { type: "object" },
    timeout_ms: 5000,
    retries: 1,
    idempotent: true,
    async execute(input: any) {
      return await calendly.bookMeeting(input.email, input.slotId);
    }
  },
  crm_sync: {
    name: "crm_sync",
    version: "1.0.0",
    input_schema: { type: "object", properties: { correlationId: { type: "string" }, status: { type: "string" }, metadata: { type: "object" } } },
    output_schema: { type: "object" },
    timeout_ms: 5000,
    retries: 3,
    idempotent: true,
    async execute(input: any) {
      const timestamp = new Date().toISOString();
      const payloadString = JSON.stringify(input);
      const signature = generateHMACSignature(payloadString, timestamp);
      const token = generateJWT(input.metadata?.tenant_id || "default-tenant");
      
      const crmSyncUrl = process.env.CRM_SYNC_URL;
      if (!crmSyncUrl) throw new Error("CRM_SYNC_URL is not set");

      const response = await axios.post(
        crmSyncUrl,
        input,
        {
          headers: {
            "Content-Type": "application/json",
            "x-webhook-signature": signature,
            "x-webhook-timestamp": timestamp,
            "Authorization": `Bearer ${token}`
          }
        }
      );
      return response.data;
    }
  }
};
