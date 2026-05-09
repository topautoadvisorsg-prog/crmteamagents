import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.AGENT_INTERNAL_TOKEN || "smart-klix-default-secret-change-me-in-prod";
const WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET || "smart-klix-webhook-secret";

const JWT_ISSUER = "smartklix-agent-platform";
const JWT_AUDIENCE = "smartklix-crm";

export interface JWTPayload {
  tenant_id: string;
  scope?: string[];
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

/**
 * Generates a signed JWT for outbound requests (e.g., sync callbacks).
 */
export function generateJWT(tenantId: string): string {
  const payload: JWTPayload = {
    tenant_id: tenantId,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
  };
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
}

/**
 * Verifies a signed JWT and returns the payload.
 * Enforces production issuer, audience, and algorithm checks.
 */
export function verifyJWT(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ["HS256"],
    }) as JWTPayload;
  } catch (error: any) {
    throw new Error(`Invalid JWT: ${error.message}`);
  }
}

/**
 * Generates an HMAC-SHA256 signature for a payload.
 * Canonical format: <timestamp>.<json_payload>
 */
export function generateHMACSignature(payload: string, timestamp: string): string {
  const data = `${timestamp}.${payload}`;
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(data)
    .digest("hex");
}

/**
 * Utility to verify a static internal token (legacy support).
 */
export function verifyInternalToken(token: string): boolean {
  const internalToken = process.env.INTERNAL_TOKEN || "sk-internal-default";
  return token === internalToken;
}
