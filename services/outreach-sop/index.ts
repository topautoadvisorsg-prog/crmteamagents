/**
 * Outreach SOP — Smart Click Agency
 * Source: OUTREACH SOP 1v (May 2026)
 *
 * This module is the single source of truth for:
 * - Business positioning and offer
 * - Email + SMS outreach templates (by lead type)
 * - Lead qualification criteria
 * - LLM context injection string
 * - Template rendering with personalization
 *
 * Every outreach action in the pipeline should reference this module.
 * Do NOT hardcode templates or positioning anywhere else.
 */

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS POSITIONING
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY_NAME = "Smart Click Agency";
export const COMPANY_WEBSITE = "smartclickagency.com";

/**
 * Core positioning — used in LLM prompts and template copy.
 * We are NOT selling "a website." We are selling a business growth system.
 */
export const POSITIONING = {
  NOT: "We build websites.",
  IS: `We help construction companies generate and manage more leads using modern websites,
CRM systems, automation, AI intake systems, and operational workflows.
The website is one component. The actual product is business optimization.`,

  CORE_OFFER: [
    "Lead generation infrastructure",
    "Lead conversion systems",
    "Intake automation",
    "Follow-up automation",
    "CRM setup and management",
    "Reputation improvement",
    "Operational efficiency",
    "AI-enhanced customer communication",
    "Modern digital business infrastructure",
  ],

  SALES_ANGLE: `Do NOT sell "a website." Sell:
- More inbound leads
- Better conversion from visitor to booked job
- Faster response systems (missed-call text-back, AI intake)
- Better customer experience
- Automated follow-up that closes deals while they sleep
- Operational efficiency that saves time every week
- Modern business infrastructure that competitors don't have yet`,
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES OFFERED
// ─────────────────────────────────────────────────────────────────────────────

export const SERVICES = {
  website: [
    "Modern responsive website (mobile-first)",
    "Conversion-focused layout and copy",
    "Quote request / estimate calculator",
    "Project gallery with before/after photos",
    "Service area pages",
    "Booking system",
    "AI-assisted intake chat",
  ],
  crmAndAutomation: [
    "CRM setup and lead pipeline",
    "Automated follow-up sequences",
    "Missed-call text-back system",
    "Appointment reminders",
    "Review request automation",
    "Lead routing and assignment",
    "Email and SMS workflow automation",
    "Estimate follow-up sequences",
  ],
  aiAndOps: [
    "AI chat/intake assistant",
    "AI reception system",
    "AI lead qualification",
    "Automated scheduling",
    "Customer support automation",
    "Workflow automation",
  ],
  ongoingManagement: [
    "Website hosting and maintenance",
    "CRM management",
    "Automation monitoring",
    "Lead management support",
    "SEO support",
    "Reputation management",
  ],
  futureUpsells: [
    "Local SEO",
    "Google Ads management",
    "AI phone system / AI receptionist",
    "Review and reputation systems",
    "Email/SMS campaigns",
    "Analytics dashboards",
    "Monthly optimization retainer",
    "Pipeline management",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// TARGET TYPES
// ─────────────────────────────────────────────────────────────────────────────

export const TARGET_TYPES = {
  noWebsite: {
    label: "Type 1 — No Website",
    description: "Company has a Google Business Profile, Facebook page, or directory listing but no actual website.",
    signals: [
      "Google Business Profile present but no website link",
      "Facebook or Yelp page only",
      "Relies entirely on referrals",
      "No SSL certificate",
      "No domain found in any directory",
    ],
    goal: "Position a website + automation system as a growth upgrade that turns referral-dependent businesses into inbound lead machines.",
    pitch: "You're losing jobs to competitors who have websites. Homeowners search Google first — if you're not there, the call goes somewhere else.",
  },
  hasWebsite: {
    label: "Type 2 — Has a Website",
    description: "Company has a website but it lacks modern conversion systems, CRM integration, or automation.",
    signals: [
      "Old or outdated design",
      "Not mobile-optimized",
      "No quote/estimate form",
      "No booking system",
      "No CRM integration indicators",
      "Poor Core Web Vitals / slow loading",
      "No clear call-to-action",
      "No project gallery",
      "Generic or template-looking design",
      "No chat widget or automation",
      "Weak or no Google review activity",
    ],
    goal: "Position modernization + conversion optimization. The site exists but it's not working — it's losing leads every day.",
    pitch: "Your website exists but it's not converting. Most visitors leave without calling. Modern conversion systems, CRM, and automation turn that around.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LEAD QUALIFICATION RULES (for LLM + policy engine)
// ─────────────────────────────────────────────────────────────────────────────

export const QUALIFICATION_RULES = {
  priorityLeads: [
    "No website at all",
    "Outdated website (pre-2018 design)",
    "No mobile optimization",
    "No quote/estimate form",
    "Active Google Business Profile (proves they're real and operating)",
    "Has reviews on Google/Yelp (proves existing customer base)",
    "Poor or no review response activity",
    "Inconsistent online presence across platforms",
    "No CRM or automation indicators",
    "Weak or generic branding",
  ],
  disqualify: [
    "National franchise or chain",
    "Already has a modern, conversion-optimized website with clear CRM/automation",
    "Explicitly opted out of contact",
    "Large commercial-only operations (not our target market)",
  ],
  tone: {
    be: ["Professional", "Helpful", "Modern", "Business-focused", "Concise"],
    avoid: ["Overhyping AI", "Sounding spammy", "Technical jargon", "Long paragraphs", "Aggressive sales language", "Vague compliments"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export interface OutreachTemplate {
  id: string;
  type: "no_website" | "has_website" | "follow_up" | "sms";
  variant: "direct" | "casual" | "value" | "standard";
  subjectOptions: string[];
  body: string;
}

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [

  // ── NO WEBSITE — Template 1: Direct & Professional ─────────────────────────
  {
    id: "no_website_direct",
    type: "no_website",
    variant: "direct",
    subjectOptions: [
      "Quick idea for {company}",
      "Helping local contractors get more inbound leads",
      "{company} — simple way to get more jobs online",
      "Noticed {company} doesn't have a website yet",
    ],
    body: `Hi {name},

I came across {company} and noticed you don't have a full website set up yet.

A lot of construction companies in {city} are losing potential jobs simply because homeowners search Google before calling anyone — if your business isn't showing up with a professional site, those calls go to a competitor who is.

We help contractors like you build more than just a website. We set up a complete lead generation system that includes:

- A modern, mobile-first website designed to convert visitors into quote requests
- A CRM to organize and track every lead
- Automated follow-up so no lead falls through the cracks
- AI intake to handle after-hours inquiries

The goal isn't just "having a website" — it's turning your online presence into a system that books more jobs.

If you'd like, I can put together a few ideas specific to {company} and show you what this could look like for your business.

Best,
{sender_name}
{company_name}
{website}`,
  },

  // ── NO WEBSITE — Template 2: Casual & Conversational ──────────────────────
  {
    id: "no_website_casual",
    type: "no_website",
    variant: "casual",
    subjectOptions: [
      "Hey {name} — quick question about {company}",
      "More leads for {company}?",
      "Quick upgrade idea for {company}",
      "Getting more calls for {company}",
    ],
    body: `Hey {name},

I was looking up {company} and noticed you don't have a website set up yet.

Honestly, a lot of contractors are getting more inbound leads right now just by making it easier for customers to find them and request quotes online. Without a website, you're relying entirely on referrals — which works, until it doesn't.

What we do is build the whole system:

- A clean, fast website that works great on phones
- Quote/estimate request forms so customers can reach you 24/7
- Automated text and email follow-ups
- A simple CRM to track jobs and leads
- AI chat for after-hours inquiries

You'd be surprised how quickly this pays for itself in booked jobs.

Want me to put together a few ideas for {company}? No pressure — just sharing what's been working for other contractors in {city}.

Best,
{sender_name}
{company_name}`,
  },

  // ── NO WEBSITE — Template 3: ROI-Focused ──────────────────────────────────
  {
    id: "no_website_roi",
    type: "no_website",
    variant: "value",
    subjectOptions: [
      "How much is {company} leaving on the table?",
      "Construction jobs you might be missing, {name}",
      "The gap between {company} and your competitors",
    ],
    body: `Hi {name},

Quick question: how do most of your new customers find you?

If the answer is mostly referrals, that's great — but it also means you're invisible to everyone in {city} who's searching Google right now for a {industry}.

We work with construction companies to close that gap. We build a full lead generation system — not just a website — that includes:

→ A professional site designed to convert visitors into booked jobs
→ Online quote/estimate request capability
→ CRM to manage your lead pipeline
→ Automated follow-up via email and text
→ AI intake for calls and messages you can't answer immediately

Most of our clients see new inbound inquiries within the first 30 days.

I'd love to put together a few ideas specific to {company}. Would a quick 10-minute call this week work?

Best,
{sender_name}
{company_name}
{website}`,
  },

  // ── HAS WEBSITE — Template 1: Professional Upgrade ────────────────────────
  {
    id: "has_website_professional",
    type: "has_website",
    variant: "direct",
    subjectOptions: [
      "A few upgrade ideas for {company}'s website",
      "Helping construction companies convert more leads online",
      "Website + automation ideas for {company}",
      "Quick question about your website",
    ],
    body: `Hi {name},

I came across {company}'s website and wanted to reach out.

You already have a presence online — which puts you ahead of a lot of competitors. But there are a few areas where modern conversion systems and automation could significantly improve how many visitors actually turn into booked jobs.

We help construction companies upgrade their sites and add the infrastructure that turns them into lead-generation systems:

- Conversion-optimized redesign (faster, mobile-first, cleaner UX)
- Quote request and estimate calculator integration
- CRM setup so every lead is captured and tracked
- Automated follow-up sequences (email + SMS)
- AI intake assistant for after-hours inquiries
- Review request automation to build reputation

The shift happening right now is from websites-as-brochures to websites-as-lead-machines. That's what we build.

I'd be happy to put together a few specific ideas for {company}. Would that be useful?

Best,
{sender_name}
{company_name}`,
  },

  // ── HAS WEBSITE — Template 2: Modernization Focused ──────────────────────
  {
    id: "has_website_modern",
    type: "has_website",
    variant: "casual",
    subjectOptions: [
      "Hey {name} — big shift happening in how contractor websites work",
      "Most contractor websites are leaving money on the table",
      "Converting more website visitors into jobs — {company}",
    ],
    body: `Hey {name},

I checked out {company}'s website — you've got a solid base to work from.

There's a big shift happening right now in how construction companies use their websites. Most older sites act like digital brochures — they show what you do, but don't actively convert visitors into customers.

The newer approach is turning your website into a lead-conversion system:

→ Smart quote forms that capture leads 24/7
→ CRM integration so nothing gets missed
→ Automated follow-up that nurtures leads while you're on a job site
→ AI chat/intake to handle after-hours inquiries
→ Review request automation to build your Google presence
→ Missed-call text-back so you never lose a lead to voicemail

The goal isn't a nicer website. It's converting more of your existing traffic into actual paying jobs while reducing the time you spend chasing leads manually.

I can put together a few ideas tailored specifically for {company}. Interested?

Best,
{sender_name}
{company_name}`,
  },

  // ── HAS WEBSITE — Template 3: Competitor Gap Angle ───────────────────────
  {
    id: "has_website_competitive",
    type: "has_website",
    variant: "value",
    subjectOptions: [
      "How {company} compares to competitors online",
      "The conversion gap in your {city} market",
      "What your competitors are doing that you're not yet",
    ],
    body: `Hi {name},

I was researching {industry} companies in {city} and noticed that {company} has an online presence — but there's a significant opportunity to increase how many of those visitors actually turn into leads.

The companies winning the most inbound business right now aren't necessarily the best contractors — they're the ones with the best lead-conversion infrastructure:

- Instant quote/estimate request capability
- Automated follow-up within 5 minutes of inquiry
- CRM that tracks every lead from first contact to booked job
- AI intake that answers questions 24/7
- Review systems that consistently build trust online

These aren't things you need a big marketing budget to implement. It's a one-time setup that runs in the background while you focus on the work.

I'd be happy to do a quick analysis of {company}'s current setup and show you exactly where the gaps are and what fixing them would mean in booked jobs.

Worth a 10-minute conversation?

Best,
{sender_name}
{company_name}
{website}`,
  },

  // ── FOLLOW-UP EMAIL (works for both types) ────────────────────────────────
  {
    id: "follow_up_standard",
    type: "follow_up",
    variant: "standard",
    subjectOptions: [
      "Following up — {company}",
      "Re: {company} — quick follow-up",
      "Just checking in, {name}",
    ],
    body: `Hi {name},

Just following up in case my last message got buried.

We help construction companies like {company} build the infrastructure to generate and manage more inbound leads — websites, CRM, automation, AI intake, and follow-up systems.

Even small upgrades can make a significant difference in how many inquiries actually turn into booked jobs.

If you'd like, I can put together a few ideas specific to {company} — no commitment required.

Best,
{sender_name}
{company_name}`,
  },

  // ── SMS TEMPLATES ─────────────────────────────────────────────────────────
  {
    id: "sms_no_website",
    type: "sms",
    variant: "direct",
    subjectOptions: [],
    body: `Hi {name}, noticed {company} doesn't have a website yet. We build lead generation systems for contractors — website, CRM, automation. Most clients get inbound calls within 30 days. Worth a quick chat? Reply YES.`,
  },
  {
    id: "sms_has_website",
    type: "sms",
    variant: "direct",
    subjectOptions: [],
    body: `Hi {name}, checked out {company}'s site. There are a few conversion upgrades (CRM, automated follow-up, AI intake) that could significantly increase inbound leads. Quick 10-min call this week? Reply YES.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateData {
  name?: string;
  company?: string;
  city?: string;
  industry?: string;
  sender_name?: string;
  company_name?: string;
  website?: string;
}

const DEFAULT_DATA: Required<TemplateData> = {
  name: "there",
  company: "your company",
  city: "your area",
  industry: "contractor",
  sender_name: "[Your Name]",
  company_name: COMPANY_NAME,
  website: COMPANY_WEBSITE,
};

export function renderTemplate(template: string, data: TemplateData): string {
  const merged = { ...DEFAULT_DATA, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
  return template.replace(/\{(\w+)\}/g, (_, key) => (merged as any)[key] ?? `{${key}}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateVariant = "direct" | "casual" | "value" | "standard";

export interface SelectedOutreach {
  subject: string;
  body: string;
  templateId: string;
  type: OutreachTemplate["type"];
}

/**
 * Select the best outreach template based on lead data and optional variant preference.
 * Falls back gracefully if no match.
 */
export function selectEmailTemplate(params: {
  noWebsite: boolean;
  isFollowUp?: boolean;
  variant?: TemplateVariant;
  data: TemplateData;
}): SelectedOutreach {
  const { noWebsite, isFollowUp = false, variant, data } = params;

  let type: OutreachTemplate["type"];
  if (isFollowUp) {
    type = "follow_up";
  } else if (noWebsite) {
    type = "no_website";
  } else {
    type = "has_website";
  }

  const candidates = OUTREACH_TEMPLATES.filter(t => t.type === type);

  // Pick by variant if specified, otherwise pick randomly from candidates
  let template: OutreachTemplate | undefined;
  if (variant) {
    template = candidates.find(t => t.variant === variant);
  }
  if (!template) {
    template = candidates[Math.floor(Math.random() * candidates.length)];
  }
  if (!template) {
    // Final fallback
    template = OUTREACH_TEMPLATES[0];
  }

  // Pick a subject line (rotate based on company name hash for consistency)
  const hash = (data.company || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const subject = template.subjectOptions[hash % template.subjectOptions.length] || template.subjectOptions[0] || "Reaching out";

  return {
    subject: renderTemplate(subject, data),
    body: renderTemplate(template.body, data),
    templateId: template.id,
    type: template.type,
  };
}

export function selectSMSTemplate(params: {
  noWebsite: boolean;
  data: TemplateData;
}): string {
  const { noWebsite, data } = params;
  const template = OUTREACH_TEMPLATES.find(t =>
    t.type === "sms" && t.variant === "direct" && (noWebsite ? t.id === "sms_no_website" : t.id === "sms_has_website")
  );
  return template ? renderTemplate(template.body, data) : renderTemplate(OUTREACH_TEMPLATES.find(t => t.type === "sms")?.body || "", data);
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM CONTEXT — injected into the classifier prompt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * This string is injected into the LLM classifier prompt so Claude understands
 * what Smart Click Agency actually sells, who the ideal targets are, and how to
 * classify leads correctly based on website status.
 */
export const LLM_BUSINESS_CONTEXT = `
COMPANY: Smart Click Agency
WHAT WE SELL: We are NOT selling websites. We sell lead generation infrastructure,
conversion systems, CRM integration, automation, and AI-enhanced business operations.
A website is just one component of the full system we deliver.

IDEAL TARGETS (construction companies that either):
  TYPE 1 — NO WEBSITE: Company has a Google Business Profile or social media but no actual website.
    These businesses depend on referrals and are invisible to inbound search traffic.
    They are PRIORITY leads. Flag as: no_website = true
  TYPE 2 — HAS WEAK WEBSITE: Company has a website but lacks quote forms, CRM, automation, modern design.
    These businesses have a digital footprint but are not converting visitors into leads.
    Flag as: no_website = false

DISQUALIFY if: national franchise/chain, already has modern conversion-optimized site with CRM.

OUTREACH TONE: Professional, helpful, business-focused, concise. Never spammy. Never overhype AI.
Sell business outcomes, not technical features.

SERVICES WE OFFER:
- Modern responsive websites with conversion-focused layouts
- Quote/estimate request systems and booking
- CRM setup and lead pipeline management
- Automated follow-up (email + SMS sequences)
- Missed-call text-back and AI intake assistants
- Review request automation
- Ongoing website and CRM management

CORE SALES ANGLE: Help them book more jobs, reduce manual follow-up, and build a system
that generates inbound leads on autopilot. The ROI is measured in booked jobs, not page views.
`.trim();
