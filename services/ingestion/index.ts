import express from "express";
import { v4 as uuidv4 } from "uuid";
import { LeadIntakeEventSchema } from "../../core/schemas";
import { pushToStream, STREAMS, reserveIdempotency, updateExecutionState, ExecutionState } from "../../infrastructure/redis";
import { authMiddleware } from "../../infrastructure/auth-middleware";
import { BusinessEvent } from "../../types";

const app = express();
app.use(express.json());

const PORT = process.env.INGESTION_PORT || 3000;

/**
 * Lead Ingestion (Public CRM Entry Point)
 * Aligning with SmartKlix CRM contract.
 */
app.post("/api/intake/lead", authMiddleware, async (req: any, res: any) => {
  try {
    const validated = LeadIntakeEventSchema.parse(req.body);
    
    // 1. Idempotency Check
    // We use the key provided by CRM to prevent duplicate processing.
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

    // 2. Buffer to Redis Stream (SSOT)
    await pushToStream(STREAMS.EVENTS, event);

    // 3. Update Idempotency State to COMPLETED
    // In a real async worker system, this might be done by the worker, 
    // but for ingestion acknowledgement, we mark it as accepted/buffered.
    await updateExecutionState(validated.idempotency_key, ExecutionState.COMPLETED);

    res.status(202).json({
      status: "accepted",
      trace_id,
    });
  } catch (error: any) {
    res.status(400).json({
      status: "error",
      message: error.errors || error.message,
    });
  }
});

// Legacy/Internal endpoint alias
app.post("/ingest", authMiddleware, async (req: any, res: any) => {
  // Redirect to canonical endpoint logic or just duplicate for now
  res.redirect(307, "/api/intake/lead");
});

app.listen(PORT, () => {
  console.log(`Ingestion Service running on port ${PORT}`);
});
