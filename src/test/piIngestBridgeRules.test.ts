/**
 * Tests for pure bridge credential resolution and idempotency-key rules.
 * No Supabase, no Edge Function, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BridgeCredential } from "@/lib/piIngestAuthRules";
import {
  assertBridgeCanWriteTent,
  deriveBatchIdempotencyKeys,
  deriveReadingIdempotencyKey,
  resolveBridgeCredential,
  validateBridgeBatchScope,
} from "@/lib/piIngestBridgeRules";

const BRIDGE = "pi-bridge-1";
const OWNER = "owner-user-uuid-1";
const TENT_A = "tent-uuid-a";
const TENT_B = "tent-uuid-b";
const OTHER_TENT = "tent-uuid-other";
const DEVICE = "sensorpush-gw-1";
const TS = "2026-05-23T11:59:30Z";

const credential: BridgeCredential = {
  bridgeId: BRIDGE,
  secret: "irrelevant-here",
  ownerUserId: OWNER,
  allowedTentIds: [TENT_A, TENT_B],
  isActive: true,
};

const inactive: BridgeCredential = { ...credential, isActive: false };

describe("resolveBridgeCredential", () => {
  it("resolves known active credential", () => {
    const r = resolveBridgeCredential(BRIDGE, [credential]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.credential.ownerUserId).toBe(OWNER);
  });

  it("rejects unknown bridge id", () => {
    const r = resolveBridgeCredential("nope", [credential]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("unknown_bridge_id");
  });

  it("rejects inactive credential", () => {
    const r = resolveBridgeCredential(BRIDGE, [inactive]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("inactive_credential");
  });

  it("rejects missing bridge id", () => {
    const r = resolveBridgeCredential("", [credential]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_bridge_id");
  });

  it("works with credentials provided as a Map", () => {
    const map = new Map<string, BridgeCredential>([[BRIDGE, credential]]);
    const r = resolveBridgeCredential(BRIDGE, map);
    expect(r.ok).toBe(true);
  });
});

describe("assertBridgeCanWriteTent", () => {
  it("allows tent inside allowedTentIds", () => {
    const r = assertBridgeCanWriteTent(credential, TENT_A);
    expect(r.ok).toBe(true);
  });

  it("rejects tent outside allowedTentIds", () => {
    const r = assertBridgeCanWriteTent(credential, OTHER_TENT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("tent_not_allowed");
  });

  it("rejects missing tent id", () => {
    const r = assertBridgeCanWriteTent(credential, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_tent_id");
  });
});

describe("deriveReadingIdempotencyKey", () => {
  const base = {
    bridgeId: BRIDGE,
    tentId: TENT_A,
    deviceId: DEVICE,
    metric: "temperature_c",
    capturedAt: TS,
  };

  it("is deterministic for the same input", () => {
    const a = deriveReadingIdempotencyKey(base);
    const b = deriveReadingIdempotencyKey(base);
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
  });

  it("key includes bridgeId, tentId, deviceId, metric, and normalized captured_at", () => {
    const r = deriveReadingIdempotencyKey(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key).toContain(BRIDGE);
      expect(r.key).toContain(TENT_A);
      expect(r.key).toContain(DEVICE);
      expect(r.key).toContain("temperature_c");
      expect(r.key).toContain(new Date(TS).toISOString());
    }
  });

  it("key excludes user_id, sensor value, and raw_payload", () => {
    const r = deriveReadingIdempotencyKey({
      ...base,
      // Extra fields intentionally ignored — module only consumes ReadingIdentityInput.
      // The key contract still must not include these even if callers pass them.
      ...({ userId: "attacker", value: 99.9, raw_payload: { x: 1 } } as object),
    } as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.key).not.toContain("attacker");
      expect(r.key).not.toContain("99.9");
      expect(r.key).not.toContain("raw_payload");
    }
  });

  it("different metric changes the key", () => {
    const a = deriveReadingIdempotencyKey(base);
    const b = deriveReadingIdempotencyKey({ ...base, metric: "humidity_pct" });
    expect(a.ok && b.ok && a.key !== b.key).toBe(true);
  });

  it("different captured_at changes the key", () => {
    const a = deriveReadingIdempotencyKey(base);
    const b = deriveReadingIdempotencyKey({
      ...base,
      capturedAt: "2026-05-23T12:00:00Z",
    });
    expect(a.ok && b.ok && a.key !== b.key).toBe(true);
  });

  it("different deviceId changes the key", () => {
    const a = deriveReadingIdempotencyKey(base);
    const b = deriveReadingIdempotencyKey({ ...base, deviceId: "other-device" });
    expect(a.ok && b.ok && a.key !== b.key).toBe(true);
  });

  it("different tentId changes the key", () => {
    const a = deriveReadingIdempotencyKey(base);
    const b = deriveReadingIdempotencyKey({ ...base, tentId: TENT_B });
    expect(a.ok && b.ok && a.key !== b.key).toBe(true);
  });

  it("normalizes timestamps to canonical ISO form", () => {
    const a = deriveReadingIdempotencyKey({
      ...base,
      capturedAt: "2026-05-23T11:59:30.000Z",
    });
    const b = deriveReadingIdempotencyKey({
      ...base,
      capturedAt: "2026-05-23T11:59:30Z",
    });
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
  });

  it("rejects missing deviceId", () => {
    const r = deriveReadingIdempotencyKey({ ...base, deviceId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_device_id");
  });

  it("rejects missing captured_at", () => {
    const r = deriveReadingIdempotencyKey({ ...base, capturedAt: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_captured_at");
  });

  it("rejects invalid captured_at", () => {
    const r = deriveReadingIdempotencyKey({ ...base, capturedAt: "not-a-date" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("invalid_captured_at");
  });

  it("rejects missing metric", () => {
    const r = deriveReadingIdempotencyKey({ ...base, metric: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_metric");
  });

  it("rejects missing tentId", () => {
    const r = deriveReadingIdempotencyKey({ ...base, tentId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_tent_id");
  });

  it("rejects missing bridgeId", () => {
    const r = deriveReadingIdempotencyKey({ ...base, bridgeId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("missing_bridge_id");
  });
});

describe("deriveBatchIdempotencyKeys", () => {
  const r1 = { tentId: TENT_A, deviceId: DEVICE, metric: "temperature_c", capturedAt: TS };
  const r2 = { tentId: TENT_A, deviceId: DEVICE, metric: "humidity_pct", capturedAt: TS };
  const r3 = { tentId: TENT_B, deviceId: DEVICE, metric: "vpd_kpa", capturedAt: TS };

  it("returns one unique key per reading", () => {
    const r = deriveBatchIdempotencyKeys(BRIDGE, [r1, r2, r3]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keys.length).toBe(3);
      expect(new Set(r.keys).size).toBe(3);
    }
  });

  it("rejects duplicate readings in the same batch", () => {
    const r = deriveBatchIdempotencyKeys(BRIDGE, [r1, r2, r1]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).code).toBe("duplicate_reading_in_batch");
      expect((r as any).index).toBe(2);
    }
  });

  it("batch order does not change individual keys", () => {
    const a = deriveBatchIdempotencyKeys(BRIDGE, [r1, r2, r3]);
    const b = deriveBatchIdempotencyKeys(BRIDGE, [r3, r1, r2]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(new Set(a.keys)).toEqual(new Set(b.keys));
    }
  });

  it("rejects empty batch", () => {
    const r = deriveBatchIdempotencyKeys(BRIDGE, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("empty_batch");
  });

  it("rejects whole batch if any reading is invalid", () => {
    const r = deriveBatchIdempotencyKeys(BRIDGE, [
      r1,
      { ...r2, capturedAt: "" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).code).toBe("missing_captured_at");
      expect((r as any).index).toBe(1);
    }
  });
});

describe("validateBridgeBatchScope", () => {
  const goodReadings = [
    { tentId: TENT_A, deviceId: DEVICE, metric: "temperature_c", capturedAt: TS },
    { tentId: TENT_B, deviceId: DEVICE, metric: "humidity_pct", capturedAt: TS },
  ];

  it("accepts a valid batch and returns ownerUserId from credential (never client)", () => {
    const r = validateBridgeBatchScope(
      { bridgeId: BRIDGE, readings: goodReadings },
      [credential],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownerUserId).toBe(OWNER);
      expect(r.bridgeId).toBe(BRIDGE);
      expect(r.keys.length).toBe(2);
    }
  });

  it("rejects entire batch when any tentId is unauthorized", () => {
    const r = validateBridgeBatchScope(
      {
        bridgeId: BRIDGE,
        readings: [
          goodReadings[0],
          { ...goodReadings[1], tentId: OTHER_TENT },
        ],
      },
      [credential],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).code).toBe("tent_not_allowed");
      expect((r as any).index).toBe(1);
    }
  });

  it("rejects entire batch on inactive credential", () => {
    const r = validateBridgeBatchScope(
      { bridgeId: BRIDGE, readings: goodReadings },
      [inactive],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("inactive_credential");
  });

  it("rejects entire batch on unknown credential", () => {
    const r = validateBridgeBatchScope(
      { bridgeId: "nope", readings: goodReadings },
      [credential],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("unknown_bridge_id");
  });

  it("rejects entire batch on duplicates", () => {
    const r = validateBridgeBatchScope(
      { bridgeId: BRIDGE, readings: [goodReadings[0], goodReadings[0]] },
      [credential],
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).code).toBe("duplicate_reading_in_batch");
  });

  it("does not return or accept any client-provided user_id", () => {
    const r = validateBridgeBatchScope(
      {
        bridgeId: BRIDGE,
        // Cast: malicious client trying to inject user_id at batch level.
        ...({ user_id: "attacker" } as object),
        readings: goodReadings,
      } as never,
      [credential],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ownerUserId).toBe(OWNER);
      expect(JSON.stringify(r)).not.toContain("attacker");
    }
  });
});

// ------------- Static safety: module surface restrictions -------------

const SRC = readFileSync(
  resolve(__dirname, "../lib/piIngestBridgeRules.ts"),
  "utf8",
);

describe("piIngestBridgeRules — static safety", () => {
  it("does not import Supabase or React", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']react["']/);
    expect(SRC).not.toMatch(/from\s+["']react\//);
  });

  it("does not perform DB calls", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/\.(from|insert|update|delete|upsert|rpc)\s*\(/);
  });

  it("does not reference service_role or forbidden persistence surfaces", () => {
    expect(SRC).not.toMatch(/service_role/);
    expect(SRC).not.toMatch(/\baction_queue\b/);
    expect(SRC).not.toMatch(/\balerts\b/);
    expect(SRC).not.toMatch(/\balert_events\b/);
  });

  it("does not reference MQTT/Home Assistant/Pi bridge runtime or automation", () => {
    expect(SRC).not.toMatch(
      /\bmqtt\b|home[\s_-]?assistant|automation|device[\s_-]?control/i,
    );
  });
});
