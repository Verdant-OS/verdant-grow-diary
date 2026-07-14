/**
 * Pure Paddle webhook signature verifier — single source of truth.
 *
 * Imported by supabase/functions/paddle-webhook/index.ts. Tested by
 * supabase/functions/paddle-webhook/security.test.ts.
 *
 * HARD RULES:
 *  - Verify against the EXACT raw request bytes. Never JSON.parse before
 *    verification, never re-serialise.
 *  - HMAC-SHA256 over `${ts}:${rawBody}` using the webhook secret.
 *  - Timing-safe comparison of hex strings of equal length.
 *  - Secret is server-only; never logged, never returned in errors.
 */

export type PaddleSignatureParts = {
  ts: string;
  /** Last h1 value (back-compat with earlier callers/tests). */
  h1: string;
  /**
   * ALL h1 values in header order. Paddle sends two h1 entries during
   * webhook-secret rotation; verification passes when ANY matches, so
   * rotation is zero-downtime.
   */
  h1s: readonly string[];
};

export function parsePaddleSignature(header: string): PaddleSignatureParts | null {
  if (typeof header !== "string" || header.length === 0) return null;
  const parts = header.split(";").map((s) => s.trim());
  let ts = "";
  const h1s: string[] = [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "ts") ts = v ?? "";
    else if (k === "h1" && v) h1s.push(v);
  }
  if (!ts || h1s.length === 0) return null;
  return { ts, h1: h1s[h1s.length - 1], h1s };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export type VerifyPaddleWebhookOptions = {
  /** Maximum age of `ts` (in seconds) relative to `nowSeconds`. */
  readonly maxAgeSeconds?: number;
  /** Maximum future skew (in seconds) allowed for `ts`. */
  readonly maxFutureSkewSeconds?: number;
  /** Injectable clock for tests. Defaults to Date.now(). */
  readonly nowSeconds?: number;
};

export type VerifyPaddleWebhookResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_header"
        | "invalid_signature_header"
        | "signature_mismatch"
        | "timestamp_stale"
        | "timestamp_future";
    };

/**
 * Verify a Paddle-Signature header against a raw request body.
 *
 * Order:
 *   1. header present + parseable
 *   2. optional timestamp freshness window
 *   3. HMAC compare, constant-time
 *
 * Never throws for verification failures — returns a discriminated result.
 * Never includes secret/signature/hash material in the failure reason.
 */
export async function verifyPaddleWebhookSignature(
  secret: string,
  header: string | null | undefined,
  rawBody: string,
  opts: VerifyPaddleWebhookOptions = {},
): Promise<VerifyPaddleWebhookResult> {
  if (!header) return { ok: false, reason: "missing_header" };
  const parsed = parsePaddleSignature(header);
  if (!parsed) return { ok: false, reason: "invalid_signature_header" };

  const tsNum = Number(parsed.ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: "invalid_signature_header" };
  }

  if (
    typeof opts.maxAgeSeconds === "number" ||
    typeof opts.maxFutureSkewSeconds === "number"
  ) {
    const now =
      typeof opts.nowSeconds === "number"
        ? opts.nowSeconds
        : Math.floor(Date.now() / 1000);
    if (
      typeof opts.maxAgeSeconds === "number" &&
      now - tsNum > opts.maxAgeSeconds
    ) {
      return { ok: false, reason: "timestamp_stale" };
    }
    if (
      typeof opts.maxFutureSkewSeconds === "number" &&
      tsNum - now > opts.maxFutureSkewSeconds
    ) {
      return { ok: false, reason: "timestamp_future" };
    }
  }

  // Rotation-safe: compare against EVERY provided h1 (constant-time each);
  // any match verifies. No early exit on match order — all candidates are
  // compared so timing does not reveal which slot matched.
  const expected = await hmacSha256Hex(secret, `${parsed.ts}:${rawBody}`);
  let anyMatch = false;
  for (const candidate of parsed.h1s) {
    if (constantTimeEqual(expected, candidate)) anyMatch = true;
  }
  if (!anyMatch) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}
