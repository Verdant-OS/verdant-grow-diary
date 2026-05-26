/**
 * Tests for the pure pi-ingest pipeline composer.
 * No Supabase, no Edge Function, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildSigningString,
  computeHmacSha256Hex,
  type BridgeCredential,
} from "@/lib/piIngestAuthRules";
import {
  preparePiIngestReadings,
  type PiIngestPipelineInput,
  type PiIngestPipelineResult,
} from "@/lib/piIngestPipeline";

const SECRET = "super-secret-bridge-token";
const BRIDGE = "pi-bridge-1";
const OWNER = "owner-user-uuid-1";
const TENT = "tent-uuid-1";
const OTHER_TENT = "tent-uuid-other";
const DEVICE = "sensorpush-gateway-1";

const NOW_ISO = "2026-05-23T12:00:00Z";
const NOW_MS = Date.parse(NOW_ISO);
const TS_ISO = "2026-05-23T11:59:30Z";
const PATH = "/functions/v1/pi-ingest-readings";

type FailedPiIngestPipelineResult = Extract<PiIngestPipelineResult, { ok: false }>;

const credential: BridgeCredential = {
  bridgeId: BRIDGE,
  secret: SECRET,
  ownerUserId: OWNER,
  allowedTentIds: [TENT],
  isActive: true,
};

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    tent_id: TENT,
    device_id: DEVICE,
    captured_at: TS_ISO,
    source: "pi_bridge",
    readings: [
      { metric: "temperature_c", value: 24.2, unit: "c" },
      { metric: "humidity_pct", value: 58, unit: "%" },
    ],
    raw: { gateway: "x" },
    ...overrides,
  };
}

async function makeInput(
  overrides: {
    body?: Record<string, unknown>;
    recent?: number[];
    maxReq?: number;
    maxBatch?: number;
    credentials?: BridgeCredential[];
    tampered?: boolean;
  } = {},
): Promise<PiIngestPipelineInput> {
  const body = overrides.body ?? makeBody();
  const rawBody = JSON.stringify(body);
  const signed = await computeHmacSha256Hex(
    SECRET,
    buildSigningString("POST", PATH, TS_ISO, rawBody),
  );
  const signature = overrides.tampered ? "deadbeef".repeat(8) : signed;
  return {
    authRequest: {
      bridgeId: BRIDGE,
      signature,
      timestamp: TS_ISO,
      method: "POST",
      path: PATH,
      rawBody,
      tentId: TENT,
    },
    credentials: overrides.credentials ?? [credential],
    parsedBody: body,
    rateLimit: {
      recentRequestTimestamps: overrides.recent ?? [NOW_MS - 10_000],
      windowMs: 60_000,
      maxRequestsPerWindow: overrides.maxReq ?? 5,
      maxReadingsPerBatch: overrides.maxBatch ?? 50,
    },
    now: NOW_MS,
  };
}

describe("preparePiIngestReadings — happy path", () => {
  it("returns ok with normalized drafts, owner from credential, and idempotency keys", async () => {
    const input = await makeInput();
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownerUserId).toBe(OWNER);
      expect(r.bridgeId).toBe(BRIDGE);
      expect(r.tentId).toBe(TENT);
      expect(r.readingDrafts.length).toBe(2);
      expect(r.readingDrafts.every((d) => d.source === "pi_bridge")).toBe(true);
      expect(r.idempotencyKeys.length).toBe(2);
      expect(new Set(r.idempotencyKeys).size).toBe(2);
    }
  });
});

describe("preparePiIngestReadings — rejection per stage", () => {
  it("auth: rejects on invalid signature", async () => {
    const input = await makeInput({ tampered: true });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as FailedPiIngestPipelineResult).stage).toBe("auth");
      expect((r as FailedPiIngestPipelineResult).issues[0].code).toBe("invalid_signature");
    }
  });

  it("envelope: rejects on bad source (sim)", async () => {
    const input = await makeInput({ body: makeBody({ source: "sim" }) });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as FailedPiIngestPipelineResult).stage).toBe("envelope");
      expect(
        (r as FailedPiIngestPipelineResult).issues.some((i) => i.code === "invalid_source"),
      ).toBe(true);
    }
  });

  it("envelope: rejects when envelope tent_id does not match auth tent_id", async () => {
    // Use a credential that allows BOTH tents so the signature stays valid and
    // batch_scope wouldn't reject — the composer itself must catch the mismatch.
    const dualCred: BridgeCredential = {
      ...credential,
      allowedTentIds: [TENT, OTHER_TENT],
    };
    const input = await makeInput({
      body: makeBody({ tent_id: OTHER_TENT }),
      credentials: [dualCred],
    });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as FailedPiIngestPipelineResult).stage).toBe("envelope");
      expect((r as FailedPiIngestPipelineResult).issues[0].code).toBe("tent_id_mismatch");
    }
  });

  it("abuse_guard: rejects when rate-limited and exposes retryAfterMs", async () => {
    const recent = [
      NOW_MS - 50_000,
      NOW_MS - 40_000,
      NOW_MS - 30_000,
      NOW_MS - 20_000,
      NOW_MS - 10_000,
    ];
    const input = await makeInput({ recent, maxReq: 5 });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as FailedPiIngestPipelineResult).stage).toBe("abuse_guard");
      expect(
        (r as FailedPiIngestPipelineResult).issues.some((i) => i.code === "rate_limited"),
      ).toBe(true);
      expect((r as FailedPiIngestPipelineResult).retryAfterMs).toBe(10_000);
    }
  });

  it("abuse_guard: rejects when batch exceeds max", async () => {
    const input = await makeInput({ maxBatch: 1 });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as FailedPiIngestPipelineResult).stage).toBe("abuse_guard");
      expect(
        (r as FailedPiIngestPipelineResult).issues.some((i) => i.code === "batch_too_large"),
      ).toBe(true);
    }
  });

  it("batch_scope: rejects when bridge is not authorized for the tent", async () => {
    // Build credential that doesn't include the body's tent — auth would also
    // fail with tent_not_allowed earlier, so this asserts the auth-stage
    // rejection path is wired (single discriminated stage).
    const wrongCred: BridgeCredential = {
      ...credential,
      allowedTentIds: ["some-other-tent"],
    };
    const input = await makeInput({ credentials: [wrongCred] });
    const r = await preparePiIngestReadings(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Auth stage rejects first via tent_not_allowed.
      expect((r as FailedPiIngestPipelineResult).stage).toBe("auth");
      expect((r as FailedPiIngestPipelineResult).issues[0].code).toBe("tent_not_allowed");
    }
  });

  it("rejects on invalid `now` input", async () => {
    const input = await makeInput();
    const r = await preparePiIngestReadings({ ...input, now: "not-a-date" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as FailedPiIngestPipelineResult).issues[0].code).toBe("invalid_now");
  });
});

// ------------- Static safety -------------

const SRC = readFileSync(resolve(__dirname, "../lib/piIngestPipeline.ts"), "utf8");

describe("piIngestPipeline — static safety", () => {
  it("does not import Supabase client or React", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase\/client/);
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']react["']/);
    expect(SRC).not.toMatch(/from\s+["']react\//);
    expect(SRC).not.toMatch(/@tanstack\/react-query/);
  });

  it("does not perform DB calls or network I/O", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/\.(from|insert|update|delete|upsert|rpc)\s*\(/);
  });

  it("does not reference service_role or forbidden persistence surfaces", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/\baction_queue\b/);
    expect(SRC).not.toMatch(/\balerts\b/);
    expect(SRC).not.toMatch(/\balert_events\b/);
  });

  it("does not reference MQTT/Home Assistant runtime or automation/device control", () => {
    expect(SRC).not.toMatch(/\bmqtt\b/i);
    expect(SRC).not.toMatch(/home[\s_-]?assistant/i);
    expect(SRC).not.toMatch(/automation|device[\s_-]?control/i);
  });
});
