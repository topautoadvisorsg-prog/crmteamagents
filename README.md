# SmartKlix Agent Control Plane (V1.8)

Autonomous AI lead generation for construction companies with no website. Finds them, qualifies them, and runs outreach — all on autopilot.

**Live on Railway:** `web-production-a0d9f.up.railway.app`

---

## How It Works — The Full Pipeline

```
┌──────────────┐   every 30min   ┌──────────────┐   lead found   ┌──────────────────────────────────┐
│   AGENT      │ ──────────────▶ │   SOURCER    │ ─────────────▶ │   PIPELINE (Redis Stream)        │
│              │                 │              │                 │                                  │
│ You define:  │                 │ Searches ZIP │                 │  lead_ingested                   │
│ • Target ZIPs│                 │ codes on     │                 │       ↓ Claude AI qualifies      │
│ • Industries │                 │ Google Places│                 │  register_prospect               │
│ • Templates  │                 │ Filters: no  │                 │       ↓ if auto-outreach on      │
│ • Schedule   │                 │ website = ✓  │                 │  send_email / send_sms           │
│              │                 │              │                 │       ↓ if lead replies           │
│ Status:      │                 │ Demo mode if │                 │  book_call                       │
│ Active = ON  │                 │ no API key   │                 │       ↓                          │
│ Paused = OFF │                 │              │                 │  crm_sync → converted            │
└──────────────┘                 └──────────────┘                 └──────────────────────────────────┘
       │                                │                                      │
       ▼                                ▼                                      ▼
  Agents tab                      Territory tab                          Prospects tab
  Create/configure               ZIP cooldown                           Full pipeline
  your agents                    tracking                               visibility
```

---

## Getting Started — 3 Steps

### Step 1 — Create an Agent (Agents tab)
An Agent is the **brain of the search**. It tells the system:
- **WHERE** to look → Target ZIP codes
- **WHAT** to look for → Industries + keywords
- **WHAT TO DO** with leads → Email/SMS templates

> ✅ A default agent targeting construction companies across FL, TX, GA, NC, OH is **auto-created on first boot** and set to Active.

### Step 2 — Let It Run (Dashboard)
Once an agent is **Active**, the scheduler runs automatically every **30 minutes**.

Hit **Run Now** on the Dashboard to trigger an immediate search without waiting.

Each run:
1. Picks up all Active agents
2. For each agent, loops through its target ZIP codes
3. Searches Google Places (or demo mode) for construction companies
4. Filters out anyone with a website — those are disqualified
5. Pushes qualifying companies into the pipeline as `lead_ingested` events

### Step 3 — Monitor (Prospects + Activity)
- **Dashboard** → Live activity feed shows each lead as it's discovered
- **Prospects tab** → Every company found, with stage: New → Outreached → Responded → Converted
- **Territory tab** → Which ZIPs have been searched, when cooldown lifts (default: 90 days)

---

## Agent Form — Field Reference

### Basic
| Field | What it does |
|-------|-------------|
| Name | Your internal label for this campaign |
| Status | **Active = sourcer runs on schedule. Paused = saved but not running. Draft = incomplete.** |
| Description | Notes for yourself |

### ICP (Ideal Customer Profile)
| Field | What it does |
|-------|-------------|
| Industries | Search terms: `construction`, `roofing`, `plumbing`, `electrician`, `painter` |
| Keywords | Additional filters to refine results |
| Negative Keywords | Exclude: `franchise`, `chain`, `commercial` |
| Business Type | Label for your records: `residential contractor` |

### Territory ← **Most important section**
| Field | What it does |
|-------|-------------|
| **Target ZIPs** | **The ZIP codes the sourcer will search. Add as many as you want.** |
| Cooldown Days | How long before a ZIP gets re-searched (90 days default) |
| Target Cities / States | For reference/filtering — ZIPs drive the actual search |

### Outreach
| Field | What it does |
|-------|-------------|
| Channel | Email, SMS, or both |
| Email Template | Sent to each lead. Use `{name}` and `{company}` as placeholders |
| SMS Template | Short version for text outreach |
| Max/Day | Rate limit — prevents flooding. 30-50 is a safe range |
| Follow-up Days | How many days before sending a follow-up if no reply |
| Require Warm Lead | Only outreach leads that have already replied (conservative mode) |

### Qualification
| Field | What it does |
|-------|-------------|
| Auto Register | ✅ Automatically add discovered leads to Prospects. Leave on. |
| Auto Outreach | Send first message automatically. Off = review leads first, then outreach manually. |

---

## Sourcer Modes

### Demo Mode (default — works without any API keys)
Generates realistic fake construction companies per ZIP. Deterministic — same ZIP always produces the same companies. ~35% simulated as having no website (your qualified leads).

Use this to: test the full pipeline, verify templates, check territory tracking.

### Live Mode
Set `GOOGLE_PLACES_API_KEY` in Railway Variables → real Google Places data → real companies → real leads.

---

## Dashboard — What Each Section Means

| Section | What it tells you |
|---------|------------------|
| System Health | Red = Redis disconnected. Green = all systems go. |
| Worker Pool | Workers are the AI processes reading the queue. Need at least 1. |
| Today's Activity | Executions run, leads found, emails sent, success rate |
| Lead Sourcer panel | Running status, last/next run, Run Now button |
| Activity Feed | Real-time log — every lead, every action, every decision |
| Prospect Funnel | How many leads at each stage of the pipeline |

---

## Environment Variables (Railway Variables tab)

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | ✅ **Yes** | Redis connection. Use Railway Redis (auto-injected) or Upstash (`rediss://...`) |
| `ANTHROPIC_API_KEY` | ✅ **Yes** | Powers the AI classification. Get at console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | Optional | Real lead sourcing. Without it: demo mode |
| `SEARCH_INTERVAL_MINUTES` | Optional | Sourcer interval (default: `30`) |
| `RESEND_API_KEY` | Optional | Email sending. Without it: simulated (logged but not sent) |
| `RESEND_FROM_EMAIL` | Optional | Sender address: `SmartKlix <hello@yourdomain.com>` |
| `TWILIO_ACCOUNT_SID` | Optional | SMS sending. Without it: simulated |
| `TWILIO_AUTH_TOKEN` | Optional | SMS sending |
| `TWILIO_FROM_NUMBER` | Optional | Your Twilio number: `+13055550001` |
| `DISABLE_WEEKEND_POLICY` | Optional | `true` = allow outreach on weekends (default: blocked) |
| `ADMIN_TOKEN` | Optional | Protects admin API with static token |
| `CLICKHOUSE_HOST` | Optional | Observability logging (not required) |

---

## Architecture

```
index.ts
├── services/admin/          HTTP server (single Railway port)
│   ├── Serves React UI (ui/dist)
│   └── All /api/* routes
├── services/scheduler/      Runs sourcer on interval
├── services/lead-sourcer/   Finds companies without websites
├── services/workers/        Orchestrator — Redis stream consumer
│   └── orchestrator.ts      XREADGROUP → policy → LLM → skill
├── services/llm-classifier/ Claude Haiku — decides next action per lead
├── services/policy-engine/  Weekend block, loop depth, DNO guard
├── services/prospect-store/ Redis lead database (dedup by phone/email)
├── services/territory/      ZIP cooldown tracking
├── services/agent-config/   Agent CRUD (Redis-backed)
├── services/activity-feed/  Live event log (last 200 events)
├── services/token-tracker/  Daily/monthly cost tracking
├── services/reconciler/     Reclaims stuck queue messages
├── infrastructure/redis.ts  Single Redis client
└── sdk/index.ts             Resend · Twilio · Firecrawl · Calendly
```

---

## Pipeline Events (Redis Stream: `events_stream`)

| Event | Triggered by | What happens next |
|-------|-------------|-------------------|
| `lead_ingested` | Sourcer or manual | LLM classifies → `register_prospect` |
| `action_completed` | Each skill | LLM re-evaluates → next action |
| `prospect_registered` | register_prospect skill | Pipeline continues |
| `email_sent` | send_email skill | Status → outreached |
| `sms_sent` | send_sms skill | Status → outreached |
| `call_booked` | book_call skill | Status → converted |

---

## UI Pages

| Page | Purpose |
|------|---------|
| **Dashboard** | System health + sourcer control + live feed |
| **Agents** | ← **Start here.** Create/configure search agents |
| **Prospects** | Every lead with pipeline stage + notes |
| **Executions** | Every AI decision with trace ID |
| **Territory** | ZIP coverage map + cooldown timers |
| **Analytics** | Token cost, API calls, skill success rates |
| **Settings** | Integration health check + policy config |

---

## Changelog

### V1.8 — May 15, 2026
- **Lead Sourcer** — proactive discovery of construction companies without websites
- **Scheduler** — auto-runs every 30min per active agent, seeds default agent on first boot
- **Agent Config CRUD** — full create/edit/delete UI with ICP + territory + outreach sections
- **Sourcer status panel** on Dashboard with Run Now trigger
- **Redis resilience** — lazyConnect, non-fatal boot, process survives Redis downtime
- New UI pages: Agents, Settings, Prospects inline edit, Analytics

### V1.7 — May 10, 2026
- Prospect Store with 90-day TTL + dedup
- Territory/ZIP tracking with cooldown
- Token tracker + cost analytics
- Activity feed (live event log)
- Admin auth token

### V1.6 and earlier
- Railway deployment, warm lead gate, policy engine, worker pool
