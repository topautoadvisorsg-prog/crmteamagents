import { Skill } from "../../types";
import { ResendSDK, TwilioSDK, FirecrawlSDK, CalendlySDK } from "../../sdk";
import axios from "axios";
import { generateHMACSignature, generateJWT } from "../../core/security";
import { checkProspect, registerProspect, updateProspectStatus } from "../prospect-store";

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
  // ──────────────────────────────────────────────
  // PROSPECT MANAGEMENT SKILLS
  // Agent uses these BEFORE and AFTER any outreach
  // ──────────────────────────────────────────────

  /**
   * check_prospect — MUST be called before any outreach skill.
   * Returns: { known, prospect, reason }
   * If known + do_not_outreach → agent MUST NOT contact this person.
   * If known + converted → they're already a CRM contact, do not cold-outreach.
   */
  check_prospect: {
    name: "check_prospect",
    version: "1.0.0",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string" },
        email: { type: "string" },
      },
    },
    output_schema: { type: "object" },
    timeout_ms: 2000,
    retries: 2,
    idempotent: true,
    async execute(input: any) {
      if (!input.phone && !input.email) {
        throw new Error("check_prospect requires at least phone or email");
      }
      return await checkProspect({ phone: input.phone, email: input.email });
    },
  },

  /**
   * register_prospect — call after finding someone new.
   * Stores in Redis (fast) + async-syncs to CRM.
   * Safe to call even if prospect already exists — returns existing record.
   */
  register_prospect: {
    name: "register_prospect",
    version: "1.0.0",
    input_schema: {
      type: "object",
      properties: {
        phone:   { type: "string" },
        email:   { type: "string" },
        name:    { type: "string" },
        company: { type: "string" },
        source:  { type: "string" },
        agentId: { type: "string" },
        notes:   { type: "string" },
      },
    },
    output_schema: { type: "object" },
    timeout_ms: 3000,
    retries: 2,
    idempotent: true,
    async execute(input: any) {
      if (!input.phone && !input.email) {
        throw new Error("register_prospect requires at least phone or email");
      }
      return await registerProspect({
        phone:   input.phone   || null,
        email:   input.email   || null,
        name:    input.name    || null,
        company: input.company || null,
        source:  input.source  || "agent",
        agentId: input.agentId || null,
        notes:   input.notes   || null,
      });
    },
  },

  /**
   * mark_do_not_outreach — call when prospect says "I'm already a customer"
   * or explicitly opts out of automated outreach.
   * Does NOT prevent direct CRM contact — only blocks automated campaigns.
   */
  mark_do_not_outreach: {
    name: "mark_do_not_outreach",
    version: "1.0.0",
    input_schema: {
      type: "object",
      properties: {
        phone:  { type: "string" },
        email:  { type: "string" },
        reason: { type: "string" },
      },
    },
    output_schema: { type: "object" },
    timeout_ms: 3000,
    retries: 2,
    idempotent: true,
    async execute(input: any) {
      if (!input.phone && !input.email) {
        throw new Error("mark_do_not_outreach requires at least phone or email");
      }
      const updated = await updateProspectStatus({
        phone:  input.phone  || null,
        email:  input.email  || null,
        status: "do_not_outreach",
        notes:  input.reason || "Opted out of automated outreach",
      });
      if (!updated) throw new Error("Prospect not found in store — register first");
      return { success: true, prospect: updated };
    },
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
