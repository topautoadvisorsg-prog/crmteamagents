# Smart Klix — AI Lead Generation Platform
## Context for OpenCodex and any AI agent working in this repo

---

## WHAT THIS PROJECT IS

Smart Klix is an autonomous AI lead generation platform for Smart Click Agency.
It finds construction companies without websites, registers them as prospects,
and sends outreach via email or SMS — automatically, on a schedule.

It runs on Railway. It is live. Everything you touch affects a production system.

---

## TECH STACK

- **Runtime:** Node.js + TypeScript (strict)
- **Backend:** Express, mounted as a single server on one PORT
- **Queue:** Redis Streams (XADD / XREADGROUP)
- **Frontend:** React + Vite + TanStack Query, served as static from `/ui/dist`
- **Email:** Resend SDK (`services/sdk/index.ts`)
- **SMS:** Twilio SDK (`services/sdk/index.ts`)
- **AI classifier:** Claude Haiku via Anthropic SDK
- **Lead sourcing:** Google Places API (or demo mode if key not set)
- **Deployment:** Railway — single service, single PORT

---

## ARCHITECTURE — HOW DATA FLOWS

```
Scheduler (every 30min)
  └─► Lead Sourcer → finds companies with no website per ZIP code
        └─► Redis Stream: EVENTS
              └─► Orchestrator (XREADGROUP loop)
                    └─► Policy Check → LLM Classifier → Skill Router
                          └─► Skills: send_email / send_sms / register_prospect / ...
```

Key services:
- `services/scheduler/`        — boots the sourcer on interval
- `services/lead-sourcer/`     — Google Places API + demo mode
- `services/orchestrator/`     — XREADGROUP consumer loop
- `services/llm-classifier/`   — Claude Haiku decides next action
- `services/skill-router/`     — executes actions (email, SMS, CRM, etc.)
- `services/outreach-sop/`     — SINGLE SOURCE OF TRUTH for all email/SMS templates
- `services/agent-config/`     — CRUD for agent configurations (stored in Redis)
- `services/prospect-store/`   — prospect dedup + status tracking
- `services/admin/`            — all HTTP API routes mounted here
- `ui/src/`                    — React frontend

---

## OUTREACH POSITIONING — CRITICAL

We are NOT selling websites.
We sell: lead generation infrastructure, CRM, automation, AI intake, conversion systems.

All email and SMS templates live in: `services/outreach-sop/index.ts`
**Do NOT hardcode templates anywhere else. Always import from outreach-sop.**

Two lead types:
- **Type 1 (no_website = true):** Company has no website at all → top priority
- **Type 2 (no_website = false):** Company has a website but it's weak → secondary

---

## RULES FOR MAKING CHANGES

1. **Run `npx tsc --noEmit` before every commit** — TypeScript must compile clean
2. **Single server on one PORT** — never spin up a second HTTP server
3. **Redis is optional at boot** — app must stay alive if Redis is unreachable
4. **All email/SMS copy comes from `services/outreach-sop/index.ts`** — never hardcode
5. **The scheduler seeds a default agent on first boot** — bump `SEED_KEY` version if you change the seed agent
6. **Do not touch `infrastructure/redis.ts` connection options** — lazyConnect and maxRetriesPerRequest settings are intentional

---

## KEY ENV VARS

| Variable | Required | Purpose |
|---|---|---|
| `REDIS_URL` | Yes | Redis connection (Railway provides this) |
| `ANTHROPIC_API_KEY` | Yes | Claude Haiku for LLM classification |
| `GOOGLE_PLACES_API_KEY` | No | Real lead sourcing (demo mode if absent) |
| `RESEND_API_KEY` | No | Email sending via Resend |
| `TWILIO_ACCOUNT_SID` | No | SMS sending |
| `TWILIO_AUTH_TOKEN` | No | SMS sending |
| `PORT` | Railway sets | HTTP server port |
| `SEARCH_INTERVAL_MINUTES` | No | Sourcer interval (default: 30) |

---

## DEPLOYMENT

Platform: Railway
Build command: `npm install && cd ui && npm install && npm run build && cd ..`
Start command: `npm start`

After any push to `main` → Railway auto-deploys.
Always push to `main` via `git push origin main`.
Remote: `https://github.com/topautoadvisorsg-prog/crmteamagents.git`

---

## MARKETS + INDUSTRIES

Pre-loaded markets: 25+ US metros in `ui/src/data/markets.ts`
Priority states: CO, FL, TX, GA, NC
Industries list: `ui/src/data/markets.ts` → `INDUSTRIES` export

---

## WHAT NOT TO DO

- Do not add a second Express server or bind a second port
- Do not hardcode ZIP codes outside of `markets.ts` or `scheduler/index.ts`
- Do not write email/SMS copy outside of `services/outreach-sop/index.ts`
- Do not remove the `lazyConnect` or `maxRetriesPerRequest: null` from Redis config
- Do not use `git push --force` on main
- Do not commit `.env` files or real API keys
