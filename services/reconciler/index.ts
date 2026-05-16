import { redis, STREAMS, GROUPS, ExecutionState, getExecutionState, updateExecutionState } from "../../infrastructure/redis";
import crypto from "crypto";

export class ReconciliationService {
  private interval: number;
  private pendingTimeoutMs: number;

  constructor(intervalMs: number = 60000, pendingTimeoutMs: number = 300000) {
    this.interval = intervalMs;
    this.pendingTimeoutMs = pendingTimeoutMs;
  }

  async start() {
    console.log(`Reconciliation Engine started (Interval: ${this.interval}ms, Timeout: ${this.pendingTimeoutMs}ms)`);
    setInterval(() => this.reconcile(), this.interval);
  }

  private async reconcile() {
    try {
      // 1. Check for messages stuck in Pending Entries List (PEL)
      const pending = await redis.xpending(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, "-", "+", 100);
      
      for (const entry of pending as any[]) {
        const [id, consumer, idleTime, deliveries] = entry;
        
        if (idleTime > this.pendingTimeoutMs) {
          console.warn(`[Reconciler] Stuck message detected: ${id} (Idle: ${idleTime}ms, Deliveries: ${deliveries})`);
          
          // 2. Fetch the message content
          const messages = await redis.xrange(STREAMS.EVENTS, id, id);
          if (messages.length === 0) continue;
          
          const [_, [__, data]] = messages[0];
          const event = JSON.parse(data);
          const { trace_id } = event.metadata;

          // 3. Check Idempotency State
          // We need the action hash. Since we don't have it easily from the raw event without re-running classification,
          // we rely on the trace history or a secondary index if we had one.
          // For now, if we can't determine the specific action lock, we log for manual intervention.
          
          if (deliveries > 5) {
            // Poison pill — ACK and move on to prevent infinite retry loop
            console.error(`[Reconciler] Poison pill (${deliveries} deliveries) for ${id}. ACKing to unblock queue.`);
            await redis.xack(STREAMS.EVENTS, GROUPS.MAIN_WORKER_GROUP, id);
          } else {
            // XCLAIM — transfer ownership to "reconciler" so any idle worker can pick it up
            console.log(`[Reconciler] Reclaiming stuck message ${id} after ${Math.round(idleTime / 1000)}s idle.`);
            try {
              await (redis as any).xclaim(
                STREAMS.EVENTS,
                GROUPS.MAIN_WORKER_GROUP,
                "reconciler",       // claim under this consumer name
                this.pendingTimeoutMs, // min-idle-time must match
                id
              );
            } catch (claimErr: any) {
              console.error(`[Reconciler] XCLAIM failed for ${id}: ${claimErr.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Reconciler] Error during reconciliation loop:", err);
    }
  }
}
