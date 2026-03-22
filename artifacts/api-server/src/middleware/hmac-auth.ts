import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const HMAC_HEADER = "x-cluster-hmac";
const TIMESTAMP_HEADER = "x-cluster-timestamp";
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

export function generateHmac(secret: string, body: string, timestamp: string): string {
  const payload = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmac(secret: string, body: string, timestamp: string, signature: string): boolean {
  const expected = generateHmac(secret, body, timestamp);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function hmacAuthMiddleware(getSecret: () => string | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = getSecret();
    if (!secret) {
      res.status(403).json({ error: "Cluster sync not configured: no shared secret" });
      return;
    }

    const signature = req.headers[HMAC_HEADER] as string | undefined;
    const timestamp = req.headers[TIMESTAMP_HEADER] as string | undefined;

    if (!signature || !timestamp) {
      res.status(401).json({ error: "Missing HMAC signature or timestamp" });
      return;
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(Date.now() - ts) > MAX_TIMESTAMP_DRIFT_MS) {
      res.status(401).json({ error: "Request timestamp expired or invalid" });
      return;
    }

    const body = JSON.stringify(req.body) || "";
    if (!verifyHmac(secret, body, timestamp, signature)) {
      res.status(401).json({ error: "Invalid HMAC signature" });
      return;
    }

    next();
  };
}

export function makeSignedRequest(url: string, secret: string, data: object, method: string = "POST") {
  const body = JSON.stringify(data);
  const timestamp = Date.now().toString();
  const hmac = generateHmac(secret, body, timestamp);

  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      [HMAC_HEADER]: hmac,
      [TIMESTAMP_HEADER]: timestamp,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
}
