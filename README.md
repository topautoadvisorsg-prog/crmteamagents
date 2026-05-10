# AI Lead Execution Control Plane (V1.7)

**Last Updated:** May 10, 2026  
**Status:** Active — deployed on Railway  
**Paired with:** SmartKlix CRM (smartklix23)

---

## 1. System Overview

The **AI Lead Execution Control Plane** is a deterministic, event-driven execution engine for processing business events and executing outreach actions (Email, SMS, Scraping, Booking) through a strict safety and validation pipeline.

**What this system is NOT:**
- It is NOT an autonomous agent
- It does NOT give LLMs direct execution authority
- It is NOT a monolithic application

**What it IS:**
- The execution arm of SmartKlix CRM
- A prospect discovery and dedup engine
- A safety-gated outreach platform

---

## 2. Architecture

```
[CRM Webhook]
      |
[Ingestion Service] ──► [Zod Validation] ──► [Idempotency Check]
      |
[Redis Streams (SSOT)] ◄── [Event History]
      |
[Worker Pool (Consumer Groups)]
      |
      ├──► [Context Builder]     (Stateless State Aggregation)
      |
      ├──► [Policy Engine]       (Deterministic Rules — BEFORE LLM)
      |         Rule 1: No outreach on weekends
      |         Rule 2: Max loop depth (5)
      |         Rule 3: Tenant isolation
      |         Rule 4: Do-Not-Outreach hard block ← NEW v1.7
      |         Rule 5: Warm lead gate
      |
      ├──► [LLM Classifier]      (Claude-3: Intent Extraction ONLY, 0.70 threshold)
      |
      ├──► [Execution Gate]      (8-Stage Safety Validation)
      |
      ├──► [Atomic Lock]         (Redis SET NX)
      |
      └──► [Skill Router] ──► [Skill Worker] ──► [SDK Layer] ──► [External APIs]
                                                                  (Resend, Twilio, etc.)

[Observability] ──► [ClickHouse] + [Redis Streams]

[Prospect Store] ──► [Redis] ──► async sync ──► [CRM /api/prospects]
```

---

## 3. Skills Registry

| Skill | What it does | Requires |
|-------|-------------|---------|
| `check_prospect` | Dedup check — call BEFORE any outreach | phone or email |
| `register_prospect` | Log new prospect to Redis + sync to CRM | phone or email |
| `mark_do_not_outreach` | Block prospect from all automated outreach | phone or email |
| `send_email` | Send email via Resend | warm lead or new |
| `send_sms` | Send SMS via Twilio | warm lead or new |
| `scrape_site` | Scrape URL via Firecrawl | warm lead only |
| `book_call` | Book Calendly meeting | warm lead only |
| `crm_sync` | Callback to CRM `/api/intake/sync` | warm lead only |

---

## 4. Prospect Store (v1.7)

Redis-backed dedup layer. Agent's source of truth for who has already been found/contacted.

**Key pattern:** `prospect:phone:{normalized}`, `prospect:email:{normalized}`, `prospect:id:{uuid}`  
**TTL:** 90 days  
**CRM sync:** Async — Redis writes complete first, CRM sync runs in background (non-blocking)

### Status Lifecycle
```
new → outreached → responded → converted
                             → do_not_outreach
```

### Agent Workflow
```
1. Find someone → register_prospect (dedup auto-checked)
2. Before reaching out → check_prospect (instant Redis lookup)
3. If known + do_not_outreach → Policy Engine HARD BLOCKS — no outreach
4. If known + converted → Policy Engine HARD BLOCKS — direct CRM contact only
5. They respond "already a customer" → mark_do_not_outreach
6. CRM user reviews prospects at /prospect-pool, converts to full contact
```

---

## 5. Policy Engine Rules

| Rule | Condition | Action |
|------|-----------|--------|
| 1 | Saturday or Sunday | Block all outreach |
| 2 | `loop_depth >= 5` | Block execution |
| 3 | Missing `tenant_id` | Block execution |
| 4 | Outreach skill + `do_not_outreach` status | Hard block (never contact) |
| 4 | Outreach skill + `converted` status | Hard block (use CRM directly) |
| 5 | Warm-only skill + cold lead | Block skill, allow email/SMS |

---

## 6. Execution Flow

1. **Ingestion** — `/api/intake/lead` validates payload, checks idempotency, pushes to Redis Stream
2. **Consumption** — Workers pull via `XREADGROUP` consumer groups
3. **Classification** — Claude-3 extraction with 0.70 confidence threshold
4. **Policy Check** — Deterministic rules run BEFORE LLM output acts
5. **Execution Gate** — 8-stage safety validation
6. **Prospect Check** — `check_prospect` before any outreach skill
7. **Skill Execution** — SDK layer with exponential backoff retries
8. **CRM Sync** — `crm_sync` skill notifies CRM via `/api/intake/sync` (HMAC-signed)
9. **Finalization** — `XACK`, trace logged to ClickHouse

---

## 7. Environment Variables

```env
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_key

# CRM connection (for prospect sync)
CRM_BASE_URL=https://your-crm-url.com
AGENT_INTERNAL_TOKEN=your_token
CRM_SYNC_URL=https://your-crm-url.com/api/intake/sync

# Outreach SDKs
RESEND_API_KEY=your_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token

# Observability
CLICKHOUSE_HOST=http://localhost:8123

# Ports
INGESTION_PORT=3000
ADMIN_PORT=3001
```

---

## 8. Running Locally

```bash
docker-compose up -d      # Redis + ClickHouse
npm install
npx tsx index.ts          # Boot all services
```

---

## 9. Admin Control Plane (Port 3001)

| Endpoint | What |
|----------|------|
| `GET /status/:trace_id` | Check execution lifecycle state |
| `POST /retry/:action_hash` | Reset idempotency for safe retry |
| `GET /pending` | Audit messages stuck in worker pipeline |

---

## 10. Failure Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Worker crash mid-execution | Redis PEL shows pending unacked message | `XCLAIM` by another worker; idempotency key blocks duplicate |
| Redis failure | Ingestion returns 500 | Restart infra; stream is persisted (`APPENDONLY yes`) |
| Skill API outage | Status `FAILED` in ClickHouse | Fix API, then `POST /retry/:action_hash` |

---

## 11. Scaling

- **Horizontal:** Spin up more worker instances with unique `workerId`s — Redis handles load balancing
- **Stateless workers:** All context rebuilt from stream — no shared local state
- **Prospect store:** Redis SET NX ensures atomic dedup under concurrent writes

---

## 12. Changelog

### v1.7 — May 10, 2026
- **Prospect Store** (`services/prospect-store/`) — Redis-backed dedup layer with 90-day TTL, async CRM sync
- **3 new skills:** `check_prospect`, `register_prospect`, `mark_do_not_outreach`
- **Policy Engine Rule 4:** Hard blocks all outreach skills when prospect is `do_not_outreach` or `converted`
- `CRM_BASE_URL` + `AGENT_INTERNAL_TOKEN` env vars added for CRM sync

### v1.6 — prior
- Warm lead gate (Rule 5 in Policy Engine)
- Railway deployment
- Redis error handler + retry strategy
