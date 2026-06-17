/**
 * Tests for the pure GGS real-payload ingest planner.
 *
 * Verifies refusal logic, canonical emission, vendor identity preservation,
 * and that nothing here calls Supabase, AI, alerts, Action Queue, or
 * device control.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildGgsRealPayloadCommitInput,
  GGS_REAL_PAYLOAD_SOURCE,
  GGS_REAL_PAYLOAD_SOURCE_APP,
  type GgsRealPayloadCommitInput,
} from "@/lib/ggsRealPayloadIngestRules";

const NOW = new Date("2026-06-17T12:00:00Z");
const FRESH_TS = "2026-06-17T11:59:00Z";
const TENT = "11111111-1111-4111-8111-111111111111";

const CTX = {
  userId: "user-uuid-aaaa",
  bridgeId: "bridge-uuid-bbbb",
  tentId: TENT,
  deviceId: "ggs-probe-serial-001",
  now: NOW,
};

function realLookingPayload(): Record<string, unknown> {
  return {
    sensor_id: "GGS-PRO-1234567",
    tent_id: TENT,
    timestamp: FRESH_TS,
    soil_moisture_pct: 42.5,
    soil_temp_c: 22.3,
    soil_ec: 1.6,
    original_units: { soil_ec: "mS/cm", soil_temp: "C" },
  };
}

/** Narrowing helper: asserts plan is a refusal and returns its reason. */
function refusalReason(plan: GgsRealPayloadCommitInput): string {
  if (plan.ok === true) {
    throw new Error(`expected refusal, got success with ${plan.rows.length} rows`);
  }
  const failed = plan as Extract<GgsRealPayloadCommitInput, { ok: false }>;
  return failed.reason;
}

describe("buildGgsRealPayloadCommitInput", () => {
  it("emits three canonical long-format rows from a real-looking payload", () => {
    const plan = buildGgsRealPayloadCommitInput(realLookingPayload(), CTX);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const metrics = plan.rows.map((r) => r.metric).sort();
    expect(metrics).toEqual(["ec", "soil_moisture_pct", "soil_temp_c"]);
    for (const row of plan.rows) {
      expect(row.source).toBe("live");
      expect(row.source).toBe(GGS_REAL_PAYLOAD_SOURCE);
      expect(row.raw_payload.source_app).toBe(GGS_REAL_PAYLOAD_SOURCE_APP);
      expect(row.raw_payload.source_app).toBe("spider_farmer_ggs");
      expect(row.raw_payload.sensor_id).toBe("GGS-PRO-1234567");
      expect(row.raw_payload.original_units?.soil_ec).toBe("mS/cm");
      expect(row.captured_at).toBe(FRESH_TS);
      expect(row.device_id).toBe(CTX.deviceId);
      expect(row.idempotency_key.startsWith("ggs:")).toBe(true);
      expect(Number.isFinite(row.value)).toBe(true);
    }
  });

  it("never emits ggs_live or ggs_csv sources", () => {
    const plan = buildGgsRealPayloadCommitInput(realLookingPayload(), CTX);
    if (!plan.ok) throw new Error("expected ok");
    for (const row of plan.rows) {
      expect(row.source).not.toBe("ggs_live" as never);
      expect(row.source).not.toBe("ggs_csv" as never);
    }
  });

  it("refuses an explicit declared source of demo", () => {
    const plan = buildGgsRealPayloadCommitInput(
      { ...realLookingPayload(), source: "demo" },
      CTX,
    );
    expect(refusalReason(plan)).toBe("forbidden_declared_source");
  });

  it.each(["ggs_live", "ggs_csv", "fixture", "test", "sample"])(
    "refuses forbidden declared source %s",
    (src) => {
      const plan = buildGgsRealPayloadCommitInput(
        { ...realLookingPayload(), source: src },
        CTX,
      );
      expect(refusalReason(plan)).toBe("forbidden_declared_source");
    },
  );

  it("refuses when timestamp is missing", () => {
    const p = realLookingPayload();
    delete p.timestamp;
    const plan = buildGgsRealPayloadCommitInput(p, CTX);
    expect(refusalReason(plan)).toBe("captured_at_missing_or_malformed");
  });

  it("refuses when tent_id is missing from context", () => {
    const plan = buildGgsRealPayloadCommitInput(realLookingPayload(), {
      ...CTX,
      tentId: "",
    });
    expect(refusalReason(plan)).toBe("tent_id_missing");
  });

  it("refuses when device_id is missing from context", () => {
    const plan = buildGgsRealPayloadCommitInput(realLookingPayload(), {
      ...CTX,
      deviceId: "",
    });
    expect(refusalReason(plan)).toBe("device_id_missing");
  });

  it("refuses fully non-numeric payloads and never emits NaN rows for partials", () => {
    const partial = buildGgsRealPayloadCommitInput(
      { ...realLookingPayload(), soil_temp_c: "warm" },
      CTX,
    );
    const allBad = buildGgsRealPayloadCommitInput(
      {
        sensor_id: "x",
        tent_id: TENT,
        timestamp: FRESH_TS,
        soil_moisture_pct: "wet",
        soil_temp_c: "warm",
        soil_ec: "salty",
      },
      CTX,
    );
    expect(["no_canonical_readings", "normalizer_refused"]).toContain(
      refusalReason(allBad),
    );
    if (partial.ok) {
      expect(partial.rows.find((r) => r.metric === "soil_temp_c")).toBeUndefined();
      for (const row of partial.rows) expect(Number.isFinite(row.value)).toBe(true);
    }
  });

  it("refuses NaN / Infinity values", () => {
    const plan = buildGgsRealPayloadCommitInput(
      { ...realLookingPayload(), soil_temp_c: Number.POSITIVE_INFINITY },
      CTX,
    );
    expect(refusalReason(plan)).toBe("non_finite_value");
  });

  it("refuses out-of-bounds soil_temp_c", () => {
    const plan = buildGgsRealPayloadCommitInput(
      { ...realLookingPayload(), soil_temp_c: 999 },
      CTX,
    );
    // Either upstream normalizer drops it, or our bounds check fires.
    if (plan.ok) {
      expect(plan.rows.find((r) => r.metric === "soil_temp_c")).toBeUndefined();
    } else {
      expect([
        "soil_temp_out_of_range",
        "no_canonical_readings",
        "normalizer_refused",
      ]).toContain(plan.reason);
    }
  });

  it("refuses suspected EC unit mismatch (µS/cm leaking through)", () => {
    const plan = buildGgsRealPayloadCommitInput(
      { ...realLookingPayload(), soil_ec: 1500 },
      CTX,
    );
    expect(refusalReason(plan)).toBe("soil_ec_unit_mismatch_suspected");
  });

  it("refuses missing payload", () => {
    const plan = buildGgsRealPayloadCommitInput(null, CTX);
    expect(refusalReason(plan)).toBe("payload_missing");
  });

  it("refuses payload that is not an object", () => {
    const plan = buildGgsRealPayloadCommitInput([1, 2, 3], CTX);
    expect(refusalReason(plan)).toBe("payload_not_object");
  });

  it("refuses when user/bridge context is missing", () => {
    const a = buildGgsRealPayloadCommitInput(realLookingPayload(), {
      ...CTX,
      userId: "",
    });
    expect(refusalReason(a)).toBe("user_id_missing");

    const b = buildGgsRealPayloadCommitInput(realLookingPayload(), {
      ...CTX,
      bridgeId: "",
    });
    expect(refusalReason(b)).toBe("bridge_id_missing");
  });

  it("does not import Supabase, fetch, AI, alerts, action_queue, or device control", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/ggsRealPayloadIngestRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/\.from\(["']sensor_readings["']\)/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\baction_queue\b/);
    expect(src).not.toMatch(/\balerts\b/);
    expect(src).not.toMatch(/\bdevice[_-]?control\b/i);
    expect(src).not.toMatch(/automation/i);
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/bridge[_\s-]?token/i);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});
