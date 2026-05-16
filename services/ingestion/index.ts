import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { LeadIntakeEventSchema } from "../../core/schemas";
import { pushToStream, STREAMS, reserveIdempotency, updateExecutionState, ExecutionState } from "../../infrastructure/redis";
import { authMiddleware } from "../../infrastructure/auth-middleware";
import { BusinessEvent } from "../../types";

const router = Router();

/**
 * Lead Ingestion (Public CRM Entry Point)
 * Aligning with SmartKlix CRM contract.
 *
 * Auth: Bearer JWT  OR  x-internal-token header
 */
router.post("/api/intake/lead", authMiddleware, async (req: any, res: any) => {
  try {
    const validated = LeadIntakeEventSchema.parse(req.body);

    // 1. Idempotency Check
    const isNew = await reserveIdempotency(validated.idempotency_key);
    if (!isNew) {
      return res.status(200).json({
        status: "duplicate",
        message: "This idempotency_key has already been processed or is currently in flight.",
      });
    }

    const trace_id = uuidv4();
    const span_id = uuidv4();

    const event: BusinessEvent = {
      metadata: {
        trace_id,
        span_id,
        timestamp: new Date().toISOString(),
        source: validated.source,
        tenant_id: validated.tenant_id,
      },
      type: "lead_ingested",
      payload: {
        ...validated.lead,
        idempotency_key: validated.idempotency_key,
        schema_version: validated.schema_version,
      },
    };

    // 2. Buffer to Redis Stream
    await pushToStream(STREAMS.EVENTS, event);

    // 3. Mark ingestion as accepted
    await updateExecutionState(validated.idempotency_key, ExecutionState.COMPLETED);

    res.status(202).json({ status: "accepted", trace_id });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.errors || error.message,
    });
  }
});

// Legacy alias
router.post("/ingest", authMiddleware, async (req: any, res: any) => {
  res.redirect(307, "/api/intake/lead");
});

export default router;
