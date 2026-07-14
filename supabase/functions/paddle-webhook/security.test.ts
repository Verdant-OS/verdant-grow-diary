// Deno tests for Paddle webhook signature verification.
//
// Run: deno test --allow-env supabase/functions/paddle-webhook/security.test.ts
//
// Uses only test-only fake secrets. NEVER read a real PADDLE_WEBHOOK_SECRET.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hmacSha256Hex,
  parsePaddleSignature,
  verifyPaddleWebhookSignature,
} from "./verifyPaddleSignature.ts";

// Obviously-fake test secret. Does not match any real Paddle prefix
// (pdl_ntfset_...). Static scanner allow-lists supabase/functions/ but
// we still avoid look-alike shapes.
const TEST_SECRET = "test-fake-webhook-secret-not-a-real-key";

async function buildHeader(rawBody: string, ts: number, secret = TEST_SECRET) {
  const h1 = await hmacSha256Hex(secret, `${ts}:${rawBody}`);
  return `ts=${ts};h1=${h1}`;
}

const NOW = 1_700_000_000;
const RAW = JSON.stringify({ event_id: "evt_1", event_type: "subscription.created" });

Deno.test("valid signature accepts exact raw body", async () => {
  const header = await buildHeader(RAW, NOW);
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW, {
    maxAgeSeconds: 300,
    maxFutureSkewSeconds: 60,
    nowSeconds: NOW,
  });
  assertEquals(r.ok, true);
});

Deno.test("missing Paddle-Signature rejects", async () => {
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, null, RAW);
  assertEquals(r, { ok: false, reason: "missing_header" });
});

Deno.test("malformed header rejects", async () => {
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, "garbage=1", RAW);
  assertEquals(r, { ok: false, reason: "invalid_signature_header" });
});

Deno.test("non-numeric ts rejects", async () => {
  const r = await verifyPaddleWebhookSignature(
    TEST_SECRET,
    "ts=notanumber;h1=abcd",
    RAW,
  );
  assertEquals(r, { ok: false, reason: "invalid_signature_header" });
});

Deno.test("wrong secret rejects", async () => {
  const header = await buildHeader(RAW, NOW, "some-other-fake-secret");
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW);
  assertEquals(r, { ok: false, reason: "signature_mismatch" });
});

Deno.test("tampered raw body rejects with original signature", async () => {
  const header = await buildHeader(RAW, NOW);
  const tampered = RAW.replace("subscription.created", "subscription.canceled");
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, tampered);
  assertEquals(r, { ok: false, reason: "signature_mismatch" });
});

Deno.test("re-serialised body (different bytes) rejects", async () => {
  const header = await buildHeader(RAW, NOW);
  // Same logical JSON, different byte layout (added whitespace).
  const reserialised = JSON.stringify(JSON.parse(RAW), null, 2);
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, reserialised);
  assertEquals(r, { ok: false, reason: "signature_mismatch" });
});

Deno.test("tampered h1 rejects", async () => {
  const good = await buildHeader(RAW, NOW);
  // Flip the last hex character.
  const flipped = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, flipped, RAW);
  assertEquals(r, { ok: false, reason: "signature_mismatch" });
});

Deno.test("stale timestamp rejects when maxAge enforced", async () => {
  const stale = NOW - 3600;
  const header = await buildHeader(RAW, stale);
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW, {
    maxAgeSeconds: 300,
    nowSeconds: NOW,
  });
  assertEquals(r, { ok: false, reason: "timestamp_stale" });
});

Deno.test("future timestamp beyond skew rejects", async () => {
  const future = NOW + 3600;
  const header = await buildHeader(RAW, future);
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW, {
    maxFutureSkewSeconds: 60,
    nowSeconds: NOW,
  });
  assertEquals(r, { ok: false, reason: "timestamp_future" });
});

Deno.test("failure reasons never leak secret or signature material", async () => {
  const header = await buildHeader(RAW, NOW, "some-other-fake-secret");
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW);
  assertEquals(r.ok, false);
  const serialised = JSON.stringify(r);
  // Secret substring must not appear.
  if (serialised.includes(TEST_SECRET)) {
    throw new Error("secret leaked into failure reason");
  }
  if (serialised.includes("some-other-fake-secret")) {
    throw new Error("wrong-secret material leaked into failure reason");
  }
  // No hex-looking signature blob.
  if (/[0-9a-f]{64}/.test(serialised)) {
    throw new Error("hmac hex leaked into failure reason");
  }
});

// --- Paid-launch gate additions: rotation-safe multi-h1 verification -------

Deno.test("secret-rotation header with old+new h1 verifies when either matches", async () => {
  const hOld = await hmacSha256Hex("obviously-fake-retired-secret", `${NOW}:${RAW}`);
  const hNew = await hmacSha256Hex(TEST_SECRET, `${NOW}:${RAW}`);
  // Paddle emits both signatures during rotation: ts=..;h1=old;h1=new
  const header = `ts=${NOW};h1=${hOld};h1=${hNew}`;
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW, {
    nowSeconds: NOW,
  });
  assertEquals(r, { ok: true });
  // Order-independent: new;old also verifies.
  const reversed = `ts=${NOW};h1=${hNew};h1=${hOld}`;
  const r2 = await verifyPaddleWebhookSignature(TEST_SECRET, reversed, RAW, {
    nowSeconds: NOW,
  });
  assertEquals(r2, { ok: true });
});

Deno.test("rotation header where NO h1 matches still fails closed", async () => {
  const h1 = await hmacSha256Hex("obviously-fake-secret-1", `${NOW}:${RAW}`);
  const h2 = await hmacSha256Hex("obviously-fake-secret-2", `${NOW}:${RAW}`);
  const header = `ts=${NOW};h1=${h1};h1=${h2}`;
  const r = await verifyPaddleWebhookSignature(TEST_SECRET, header, RAW, {
    nowSeconds: NOW,
  });
  assertEquals(r, { ok: false, reason: "signature_mismatch" });
});

Deno.test("parsePaddleSignature exposes all h1 values with last-wins back-compat", () => {
  const parsed = parsePaddleSignature("ts=123;h1=aaa;h1=bbb");
  if (!parsed) throw new Error("expected header to parse");
  assertEquals(parsed.h1, "bbb");
  assertEquals([...parsed.h1s], ["aaa", "bbb"]);
});
