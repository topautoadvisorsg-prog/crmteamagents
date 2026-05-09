import { Request, Response, NextFunction } from "express";
import { verifyJWT, verifyInternalToken } from "../core/security";

export interface AuthenticatedRequest extends Request {
  tenant_id?: string;
}

/**
 * Middleware to authenticate requests via JWT (Bearer) or Static Internal Token.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const internalTokenHeader = req.headers["x-internal-token"];

  // 1. Check for Static Internal Token (Legacy/System-to-System)
  if (internalTokenHeader && typeof internalTokenHeader === "string") {
    if (verifyInternalToken(internalTokenHeader)) {
      return next();
    }
  }

  // 2. Check for JWT (Modern/Standard)
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = verifyJWT(token);
      req.tenant_id = payload.tenant_id;
      return next();
    } catch (error: any) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Invalid or expired JWT",
      });
    }
  }

  // 3. Fallback: Unauthorized
  return res.status(401).json({
    status: "error",
    message: "Unauthorized: Missing or invalid authentication credentials",
  });
}
