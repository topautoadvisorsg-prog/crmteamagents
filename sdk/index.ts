import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export class ResendSDK {
  private apiKey: string;
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || "";
  }

  async sendEmail(to: string, subject: string, body: string) {
    if (!this.apiKey) {
      console.warn("[SDK:Resend] Missing API Key, simulating success.");
      return { id: "mock_res_" + Date.now(), status: "simulated" };
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL || "SmartKlix <noreply@resend.dev>";
    const response = await axios.post("https://api.resend.com/emails", {
      from: fromAddress,
      to: [to],
      subject,
      html: body,
    }, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 10000,
    });
    
    return response.data;
  }
}

export class TwilioSDK {
  private accountSid: string;
  private authToken: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN || "";
  }

  async sendSMS(to: string, message: string) {
    if (!this.accountSid || !this.authToken) {
      console.warn("[SDK:Twilio] Missing credentials, simulating success.");
      return { sid: "mock_sm_" + Date.now(), status: "simulated" };
    }
    if (!process.env.TWILIO_FROM_NUMBER) {
      throw new Error("TWILIO_FROM_NUMBER is not set");
    }

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER || "", Body: message }).toString(),
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    return response.data;
  }
}

export class FirecrawlSDK {
  private apiKey: string;
  constructor() {
    this.apiKey = process.env.FIRECRAWL_API_KEY || "";
  }

  async scrape(url: string) {
    if (!this.apiKey) {
      console.warn("[SDK:Firecrawl] Missing API Key, simulating success.");
      return { url, content: "Mock content", status: "simulated" };
    }

    const response = await axios.post("https://api.firecrawl.dev/v0/scrape", { url }, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    
    return response.data;
  }
}

export class CalendlySDK {
  private apiKey: string;
  constructor() {
    this.apiKey = process.env.CALENDLY_API_KEY || "";
  }

  async bookMeeting(email: string, slotId: string) {
    if (!this.apiKey) {
      console.warn("[SDK:Calendly] Missing API Key, simulating success.");
      return { booking_id: "mock_bk_" + Date.now(), status: "simulated" };
    }

    const response = await axios.post("https://api.calendly.com/scheduled_events", {
      invitee: { email },
      slot: slotId
    }, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    
    return response.data;
  }
}
