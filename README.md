# AI Lead Execution Control Plane (V1.6)

## 1. System Overview
The **AI Lead Execution Control Plane** is a deterministic, event-driven execution engine designed to process business events and execute high-stakes actions (Email, SMS, Scaping, Booking) through a strict safety and validation pipeline.

**What this system is NOT:**
- It is NOT an autonomous agent.
- It does NOT give LLMs direct execution authority.
- It is NOT a monolithic application.

## 2. Architecture Diagram
```text
[CRM Webhook]
      |
[Ingestion Service] ----> [Zod Validation]
      |
[Redis Streams (SSOT)] <---- [Event History]
      |
[Worker Pool (Consumer Groups)]
      |
      +--> [Context Builder] (Stateless State Aggregation)
      |
      +--> [Policy Engine] (Deterministic Rules - BEFORE LLM)
      |
      +--> [LLM Classifier] (Claude-3: Intent Extraction ONLY)
      |
      +--> [Execution Gate] (8-Stage Safety Validation)
      |         |-- Schema, Policy, Skill, Permission,
      |         |-- Semantic, Idempotency, Rate Limit, Confidence
      |
      +--> [Atomic Lock] (Redis SET NX)
      |
      +--> [Skill Router] --> [Skill Worker] --> [SDK Layer] ----> [External APIs]
      |                                              |              (Resend, Twilio, etc.)
      |                                              +--> [Retries w/ Backoff]
      |
[Observability Pipeline] ----> [ClickHouse] + [Redis Streams]
```

## 3. Core Concepts
- **Redis Streams as SSOT**: Every event is an immutable record. State is derived, not stored.
- **Execution Gate**: A "Hard Safety Layer" that must return a 100% PASS before any side-effect occurs.
- **Policy Engine**: Hard-coded business logic that overrules any LLM decision.
- **LLM Classification**: Used solely for routing and data extraction, never for control logic.

## 4. Execution Flow
1. **Ingestion**: `/api/intake/lead` validates payload, checks **idempotency_key**, and assigns a unique `trace_id`.
   - Supports **JWT (Bearer)** and **X-INTERNAL-TOKEN** authentication.
   - Enforces `LeadIntakeEventSchema` (snake_case).
2. **Consumption**: Workers pull via `XREADGROUP`, ensuring distributed partitioning.
3. **Classification**: Claude extraction with a strict **0.70 confidence threshold**.
4. **Safety Check**: Execution Gate verifies idempotency and semantic validity.
5. **Execution**: Skill execution via SDK with exponential backoff retries.
6. **Sync Callback**: `crm_sync` skill notifies the CRM via `/api/intake/sync` with an **HMAC-SHA256 signature**.
7. **Finalization**: `XACK` marks message as processed; trace logged to ClickHouse.

## 5. Adding a New Skill
1. **Create Skill**: Add a new entry in `services/skill-router/registry.ts`.
2. **Define Contract**:
   ```typescript
   my_new_skill: {
     name: "my_new_skill",
     version: "1.0.0",
     input_schema: { ... },
     output_schema: { ... },
     timeout_ms: 5000,
     retries: 3,
     idempotent: true,
     async execute(input: any) {
       // Implementation using SDK
     }
   }
   ```
3. **Register SDK**: If needed, add the provider logic in `sdk/index.ts`.

## 6. Execution Guarantees
- **At-Least-Once Ingestion**: CRM webhooks are buffered in Redis Streams immediately.
- **Exactly-Once Execution (Logical)**: Enforced via the combination of Redis Consumer Groups (delivery) and Atomic Idempotency Locks (execution).
- **At-Least-Once Logging**: Observability logs are emitted to both Redis and ClickHouse. In case of ClickHouse failure, logs remain in the Redis `observability_stream` for later drain.

## 7. Safety Model
- **Idempotency Lifecycle**: 
  - `reserveIdempotency`: Sets state to `IN_PROGRESS` (TTL: 1h).
  - `updateExecutionState`: Sets state to `COMPLETED` (TTL: 24h) or `FAILED`.
- **Confidence Guard**: Any LLM classification with < 0.70 confidence is automatically blocked.
- **Loop Protection**: Maximum depth of 5 actions per trace to prevent recursive loops.

## 8. Failure Recovery Playbook
### Scenario: Worker Crashes Mid-Execution
- **Detection**: Redis Consumer Group PEL will show the message as "pending" but unacknowledged.
- **Recovery**: Another worker can claim the message via `XCLAIM`. The `ExecutionGate` will check the idempotency key. If it finds `IN_PROGRESS`, it will block until the lock expires (1 hour) or until an operator resets the state.

### Scenario: Redis Service Failure
- **Detection**: Ingestion service will return 500.
- **Recovery**: Infrastructure must be restarted. Since the stream is persisted (`APPENDONLY yes`), no data is lost upon restart. Workers will resume from the last acknowledged ID.

### Scenario: Persistent Skill Failure (API Outage)
- **Detection**: Status `FAILED` in ClickHouse/Redis idempotency key.
- **Recovery**: Fix the external API issue. Use the **Admin API** `POST /retry/:action_hash` to safely reset the state and allow a retry.

## 9. Reconciliation Engine
The system includes a background `ReconciliationService` that:
- Scans the Redis PEL (Pending Entries List) for "stuck" messages (> 5 mins idle).
- Detects "poison pills" (messages with > 5 delivery attempts) and acknowledges them to stop the loop.
- Enables auto-healing of distributed state inconsistencies.

## 10. Admin Control Plane
A dedicated API (default port `3001`) provides safe operational control:
- `GET /status/:trace_id`: Query the current lifecycle state.
- `POST /retry/:action_hash`: Reset idempotency locks for safe manual retry.
- `GET /pending`: Audit messages stuck in the worker pipeline.

## 11. Execution SLO Layer
- **Ingestion Latency**: < 50ms (CRM to Redis).
- **Orchestration Latency**: < 500ms (Redis to Skill Start).
- **Retry Budget**: Max 3 attempts per skill with exponential backoff.
- **Deduplication Window**: 24 hours per unique action.

## 12. Scaling Model
- **Horizontal Scaling**: Simply spin up more worker instances with unique `workerId`s. Redis handles the load balancing across the `main_worker_group`.
- **Statelessness**: Workers carry no local state; all context is rebuilt from the stream.

## 13. Environment Setup
Create a `.env` file with:
```env
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=your_key
RESEND_API_KEY=your_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
CLICKHOUSE_HOST=http://localhost:8123
```

**Run Locally:**
1. `docker-compose up -d`
2. `npm install`
3. `npx tsx index.ts`
