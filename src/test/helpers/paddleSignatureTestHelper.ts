/**
 * Test-only Paddle-Signature header generator.
 *
 * Matches the BYO paddle-webhook verifier in
 * supabase/functions/paddle-webhook/index.ts:
 *
 *   header = `ts=<unixSeconds>;h1=<hex HMAC-SHA256(secret, `${ts}:${rawBody}`)>`
 *
 * HARD RULES:
 *  - Test-only. Never import from `src/` runtime code, edge functions,
 *    or frontend bundles. The static secret scanner allow-list forbids
 *    embedding real secrets — callers MUST pass fake secrets.
 *  - Deterministic: given the same (rawBody, secret, timestamp) the
 *    output is byte-identical.
 *  - Raw body is signed verbatim — no re-serialisation, no whitespace
 *    normalisation, no key reordering.
 */
import { createHmac } from "node:crypto";

export interface PaddleSignatureInput {
  readonly rawBody: string;
  readonly secret: string;
  /** Unix seconds. */
  readonly timestamp: number;
}

export function buildPaddleSignatureHeader(input: PaddleSignatureInput): string {
  const { rawBody, secret, timestamp } = input;
  if (!Number.isFinite(timestamp) || Math.floor(timestamp) !== timestamp) {
    throw new Error("timestamp must be an integer (unix seconds)");
  }
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("secret must be a non-empty test string");
  }
  if (typeof rawBody !== "string") {
    throw new Error("rawBody must be a string (do not re-serialise)");
  }
  const hex = createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");
  return `ts=${timestamp};h1=${hex}`;
}

/**
 * Mirror of the edge-function verifier — used by helper tests to prove
 * generated headers verify with the same algorithm the handler uses.
 */
export async function verifyPaddleSignatureHeader(
  header: string,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  const parts = header.split(";").map((s) => s.trim());
  let ts = "";
  let h1 = "";
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "ts") ts = v ?? "";
    else if (k === "h1") h1 = v ?? "";
  }
  if (!ts || !h1) return false;
  const expected = createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");
  if (expected.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i);
  }
  return diff === 0;
}
