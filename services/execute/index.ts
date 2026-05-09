import express from "express";
import axios from "axios";
import { SKILL_REGISTRY } from "../skill-router/registry";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || process.env.EXECUTE_PORT || 3002;
const WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET || "";
const CRM_CALLBACK_URL = process.env.CRM_CALLBACK_URL || "http://localhost:5000/api/agent/callback";

// ─── Auth ────────────────────────────────────────────────────────────────────

function validateSecret(req: express.Request, res: express.Response): boolean {
  const provided = req.headers["x-webhook-secret"] as string;
  if (!WEBHOOK_SECRET || provided !== WEBHOOK_SECRET) {
    res.status(401).json({ status: "error", message: "Unauthorized" });
    return false;
  }
  return true;
}

// ─── Callback to CRM ─────────────────────────────────────────────────────────

async function callbackToCRM(
  proposalId: string,
  correlationId: string,
  status: "completed" | "failed",
  result?: unknown,
  errorMessage?: string
) {
  try {
    await axios.post(
      CRM_CALLBACK_URL,
      { proposalId, correlationId, status, result, errorMessage, completedAt: new Date().toISOString() },
      {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": WEBHOOK_SECRET,
        },
        timeout: 10000,
      }
    );
  } catch (err: any) {
    console.error(`[Execute] Callback to CRM failed for ${correlationId}:`, err.message);
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "execute", port: PORT, timestamp: new Date().toISOString() });
});

// ─── POST /execute/email ──────────────────────────────────────────────────────
// CRM payload: { correlationId, proposalId?, type:"email", to, subject, body }

app.post("/execute/email", async (req: express.Request, res: express.Response) => {
  if (!validateSecret(req, res)) return;

  const { correlationId, proposalId, to, subject, body } = req.body as Record<string, string>;

  if (!correlationId || !to || !subject || !body) {
    res.status(400).json({ status: "error", message: "Missing required fields: correlationId, to, subject, body" });
    return;
  }

  res.status(202).json({ status: "accepted", correlationId });

  try {
    const result = await SKILL_REGISTRY.send_email.execute({ to, subject, body });
    await callbackToCRM(proposalId || correlationId, correlationId, "completed", result);
  } catch (err: any) {
    console.error(`[Execute/email] ${correlationId}:`, err.message);
    await callbackToCRM(proposalId || correlationId, correlationId, "failed", undefined, err.message);
  }
});

// ─── POST /execute/whatsapp ───────────────────────────────────────────────────
// CRM payload: { correlationId, proposalId?, type:"whatsapp", phoneNumber, message }

app.post("/execute/whatsapp", async (req: express.Request, res: express.Response) => {
  if (!validateSecret(req, res)) return;

  const { correlationId, proposalId, phoneNumber, message } = req.body as Record<string, string>;

  if (!correlationId || !phoneNumber || !message) {
    res.status(400).json({ status: "error", message: "Missing required fields: correlationId, phoneNumber, message" });
    return;
  }

  res.status(202).json({ status: "accepted", correlationId });

  try {
    const result = await SKILL_REGISTRY.send_sms.execute({ to: phoneNumber, message });
    await callbackToCRM(proposalId || correlationId, correlationId, "completed", result);
  } catch (err: any) {
    console.error(`[Execute/whatsapp] ${correlationId}:`, err.message);
    await callbackToCRM(proposalId || correlationId, correlationId, "failed", undefined, err.message);
  }
});

// ─── POST /execute/task ───────────────────────────────────────────────────────
// CRM payload: { correlationId, proposalId?, type:"task", actions:[{tool, args}] }

app.post("/execute/task", async (req: express.Request, res: express.Response) => {
  if (!validateSecret(req, res)) return;

  const { correlationId, proposalId, actions } = req.body as {
    correlationId: string;
    proposalId?: string;
    actions: Array<{ tool: string; args: Record<string, unknown> }>;
  };

  if (!correlationId || !Array.isArray(actions) || actions.length === 0) {
    res.status(400).json({ status: "error", message: "Missing required fields: correlationId, actions[]" });
    return;
  }

  res.status(202).json({ status: "accepted", correlationId, actionCount: actions.length });

  const results: Array<{ tool: string; status: string; result?: unknown; error?: string }> = [];

  for (const action of actions) {
    const skill = SKILL_REGISTRY[action.tool];
    if (!skill) {
      results.push({ tool: action.tool, status: "skipped", error: `Unknown skill: ${action.tool}` });
      console.warn(`[Execute/task] Unknown skill: ${action.tool}`);
      continue;
    }
    try {
      const result = await skill.execute(action.args);
      results.push({ tool: action.tool, status: "completed", result });
    } catch (err: any) {
      results.push({ tool: action.tool, status: "failed", error: err.message });
      console.error(`[Execute/task] Skill ${action.tool} failed:`, err.message);
    }
  }

  const overallStatus = results.some(r => r.status === "failed") ? "failed" : "completed";
  const pid = proposalId || correlationId;

  if (overallStatus === "completed") {
    await callbackToCRM(pid, correlationId, "completed", { results });
  } else {
    const firstError = results.find(r => r.status === "failed")?.error;
    await callbackToCRM(pid, correlationId, "failed", { results }, firstError);
  }
});

// ─── POST /execute/payment ────────────────────────────────────────────────────
// CRM payload: { correlationId, proposalId?, type:"payment", amount, currency, description, contactId }

app.post("/execute/payment", async (req: express.Request, res: express.Response) => {
  if (!validateSecret(req, res)) return;

  const { correlationId, proposalId, amount, currency, description, contactId } = req.body as Record<string, string>;

  if (!correlationId || !amount) {
    res.status(400).json({ status: "error", message: "Missing required fields: correlationId, amount" });
    return;
  }

  res.status(202).json({ status: "accepted", correlationId });

  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn(`[Execute/payment] STRIPE_SECRET_KEY not set. Rejecting payment request for ${correlationId}.`);
    await callbackToCRM(
      proposalId || correlationId,
      correlationId,
      "failed",
      undefined,
      "Stripe not configured — set STRIPE_SECRET_KEY to enable payment execution"
    );
    return;
  }

  // TODO: implement Stripe payment link creation with stripe npm package
  console.warn(`[Execute/payment] Stripe configured but not yet implemented for ${correlationId}.`);
  await callbackToCRM(
    proposalId || correlationId,
    correlationId,
    "failed",
    undefined,
    "Payment execution not yet implemented"
  );
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Execute Service running on port ${PORT}`);
  console.log(`Callback URL: ${CRM_CALLBACK_URL}`);
});
