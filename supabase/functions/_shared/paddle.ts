/**
 * Shared Lovable built-in Paddle utility.
 *
 * See knowledge: paddle-shared-utils. This file is used by Phase 1's
 * `get-paddle-price` resolver. It does NOT replace the existing BYO
 * `paddle-webhook/` edge function — that continues to run against the
 * BYO PADDLE_* secrets.
 *
 * Webhook verification uses the pure HMAC verifier (same algorithm as
 * paddle-webhook/verifyPaddleSignature.ts) so secrets never need a full
 * SDK client just to fail-closed on a bad signature.
 */
import { Environment, Paddle, EventName } from "npm:@paddle/paddle-node-sdk";
import { verifyPaddleWebhookSignature } from "../paddle-webhook/verifyPaddleSignature.ts";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export { EventName };

export type PaddleEnv = "sandbox" | "live";

/** Replay window aligned with BYO paddle-webhook production bounds. */
export const PAYMENTS_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
export const PAYMENTS_WEBHOOK_MAX_FUTURE_SKEW_SECONDS = 60;

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev/paddle";

export function getConnectionApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Paddle(connectionApiKey, {
    environment: GATEWAY_BASE_URL as unknown as Environment,
    customHeaders: {
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
    },
  });
}

export async function gatewayFetch(
  env: PaddleEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");
  return fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
      ...init?.headers,
    },
  });
}

export function getWebhookSecret(env: PaddleEnv): string {
  return env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
}

export type VerifyPaymentsWebhookFailureReason =
  | "webhook_secret_not_configured"
  | "missing_header"
  | "invalid_signature_header"
  | "signature_mismatch"
  | "timestamp_stale"
  | "timestamp_future"
  | "invalid_json";

export type VerifyPaymentsWebhookResult =
  | { ok: true; rawBody: string; event: unknown }
  | { ok: false; reason: VerifyPaymentsWebhookFailureReason };

/**
 * Fail-closed Paddle webhook verification for payments-webhook.
 *
 * 1. Resolve env-scoped secret (missing → not_configured, never compare).
 * 2. HMAC-verify raw body + paddle-signature (constant-time, multi-h1).
 * 3. JSON.parse only after signature succeeds.
 *
 * Does not call the Paddle SDK (no LOVABLE_API_KEY required for verify).
 * Never returns secret or signature material in reasons.
 */
export async function verifyPaymentsWebhookRequest(
  req: Request,
  env: PaddleEnv,
  opts?: { nowSeconds?: number },
): Promise<VerifyPaymentsWebhookResult> {
  let secret: string;
  try {
    secret = getWebhookSecret(env);
  } catch {
    return { ok: false, reason: "webhook_secret_not_configured" };
  }

  // Exact raw bytes — never re-serialize.
  const rawBody = await req.text();
  const header = req.headers.get("paddle-signature");

  const verification = await verifyPaddleWebhookSignature(secret, header, rawBody, {
    maxAgeSeconds: PAYMENTS_WEBHOOK_MAX_AGE_SECONDS,
    maxFutureSkewSeconds: PAYMENTS_WEBHOOK_MAX_FUTURE_SKEW_SECONDS,
    nowSeconds: opts?.nowSeconds,
  });
  if (!verification.ok) {
    return { ok: false, reason: verification.reason };
  }

  try {
    const event = JSON.parse(rawBody) as unknown;
    return { ok: true, rawBody, event };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/**
 * @deprecated Prefer verifyPaymentsWebhookRequest — kept for call sites that
 * still expect throw-on-fail + SDK-shaped events.
 */
export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const result = await verifyPaymentsWebhookRequest(req, env);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.event;
}
