/**
 * Tests for the pure pi-ingest request envelope validator.
 * No Supabase, no Edge Function, no network, no writes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isAllowedPiIngestMetric,
  isAllowedPiIngestSource,
  isAllowedPiIngestUnit,
  PI_INGEST_FORBIDDEN_METRICS,
  toExternalSensorIngestPayload,
  type PiIngestRequestValidationResult,
  validatePiIngestRequestEnvelope,
} from "@/lib/piIngestRequestRules";
import { normalizeIngestPayload } from "@/lib/sensorIngestNormalizationRules";

const NOW = new Date("2026-05-23T12:00:00Z");
const TS = "2026-05-23T11:59:30Z";

type FailedPiIngestRequestValidationResult = Extract<
  PiIngestRequestValidationResult,
  { ok: false }
>;

function validBody() {
  return {
    tent_id: "tent-uuid-1",
    device_id: "sensorpush-gateway-1",
    captured_at: TS,
    source: "pi_bridge",
    readings: [
      { metric: "temperature_c", value: 24.2, unit: "c" },
      { metric: "humidity_pct", value: 58, unit: "%" },
      { metric: "vpd_kpa", value: 1.18, unit: "kpa" },
    ],
    raw: { gateway: "x" },
  };
}

describe("validatePiIngestRequestEnvelope — happy path", () => {
  it("accepts a fully valid envelope", () => {
    const r = validatePiIngestRequestEnvelope(validBody(), { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envelope.tent_id).toBe("tent-uuid-1");
      expect(r.envelope.device_id).toBe("sensorpush-gateway-1");
      expect(r.envelope.captured_at).toBe(new Date(TS).toISOString());
      expect(r.envelope.source).toBe("pi_bridge");
      expect(r.envelope.readings.length).toBe(3);
      expect(r.envelope.readings[0].unit).toBe("temperature_c");
      expect(r.envelope.readings[1].unit).toBe("percent");
      expect(r.envelope.readings[2].unit).toBe("kPa");
    }
  });

  it("accepts uppercase / variant unit spellings (c/C, kPa, ppm)", () => {
    const body = {
      ...validBody(),
      readings: [
        { metric: "temperature_c", value: 22, unit: "C" },
        { metric: "humidity_pct", value: 60, unit: "percent" },
        { metric: "vpd_kpa", value: 1.0, unit: "kPa" },
        { metric: "co2_ppm", value: 800, unit: "ppm" },
        { metric: "soil_moisture_pct", value: 40, unit: "pct" },
      ],
    };
    const r = validatePiIngestRequestEnvelope(body, { now: NOW });
    expect(r.ok).toBe(true);
  });

  it("converts Fahrenheit unit string to canonical temperature_f", () => {
    const body = {
      ...validBody(),
      readings: [{ metric: "temperature_c", value: 75, unit: "F" }],
    };
    const r = validatePiIngestRequestEnvelope(body, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.readings[0].unit).toBe("temperature_f");
  });
});

describe("validatePiIngestRequestEnvelope — rejections", () => {
  it("rejects non-object body", () => {
    const r = validatePiIngestRequestEnvelope(null, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues[0].code).toBe("invalid_envelope");
  });

  it("rejects array body", () => {
    const r = validatePiIngestRequestEnvelope([], { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues[0].code).toBe("invalid_envelope");
  });

  it("rejects missing tent_id", () => {
    const r = validatePiIngestRequestEnvelope({ ...validBody(), tent_id: "" }, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_tent_id",
      );
  });

  it("rejects missing device_id", () => {
    const b = { ...validBody() } as Record<string, unknown>;
    delete b.device_id;
    const r = validatePiIngestRequestEnvelope(b, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_device_id",
      );
  });

  it("rejects missing captured_at", () => {
    const b = { ...validBody() } as Record<string, unknown>;
    delete b.captured_at;
    const r = validatePiIngestRequestEnvelope(b, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_captured_at",
      );
  });

  it("rejects invalid captured_at", () => {
    const r = validatePiIngestRequestEnvelope(
      { ...validBody(), captured_at: "not-a-date" },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "invalid_captured_at",
      );
  });

  it("rejects captured_at more than 5 minutes in the future and does not clamp", () => {
    const future = new Date(NOW.getTime() + 6 * 60_000).toISOString();
    const r = validatePiIngestRequestEnvelope(
      { ...validBody(), captured_at: future },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "captured_at_too_far_future",
      );
  });

  it("accepts captured_at slightly in the future within tolerance", () => {
    const inWindow = new Date(NOW.getTime() + 60_000).toISOString();
    const r = validatePiIngestRequestEnvelope(
      { ...validBody(), captured_at: inWindow },
      { now: NOW },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects missing source", () => {
    const b = { ...validBody() } as Record<string, unknown>;
    delete b.source;
    const r = validatePiIngestRequestEnvelope(b, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_source",
      );
  });

  it("rejects source = sim", () => {
    const r = validatePiIngestRequestEnvelope({ ...validBody(), source: "sim" }, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "invalid_source",
      );
  });

  it("rejects source = manual", () => {
    const r = validatePiIngestRequestEnvelope({ ...validBody(), source: "manual" }, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "invalid_source",
      );
  });

  it("rejects unknown source like home_assistant or mqtt", () => {
    for (const source of ["home_assistant", "mqtt", "sensorpush"]) {
      const r = validatePiIngestRequestEnvelope({ ...validBody(), source }, { now: NOW });
      expect(r.ok).toBe(false);
    }
  });

  it("rejects client-provided user_id", () => {
    const r = validatePiIngestRequestEnvelope({ ...validBody(), user_id: "attacker" } as object, {
      now: NOW,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "client_user_id_forbidden",
      );
  });

  it("rejects missing readings", () => {
    const b = { ...validBody() } as Record<string, unknown>;
    delete b.readings;
    const r = validatePiIngestRequestEnvelope(b, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_readings",
      );
  });

  it("rejects empty readings", () => {
    const r = validatePiIngestRequestEnvelope({ ...validBody(), readings: [] }, { now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "empty_readings",
      );
  });

  it("rejects unknown metrics", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [{ metric: "wind_speed", value: 5, unit: "mps" }],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "invalid_metric",
      );
  });

  it("rejects every forbidden metric (PPFD/EC/reservoir/etc.)", () => {
    for (const metric of PI_INGEST_FORBIDDEN_METRICS) {
      const r = validatePiIngestRequestEnvelope(
        {
          ...validBody(),
          readings: [{ metric, value: 1, unit: "%" }],
        },
        { now: NOW },
      );
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
          "forbidden_metric",
        );
    }
  });

  it("rejects unknown units", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [{ metric: "temperature_c", value: 24, unit: "kelvin" }],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "invalid_unit",
      );
  });

  it("rejects non-finite values (NaN, Infinity, -Infinity)", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = validatePiIngestRequestEnvelope(
        {
          ...validBody(),
          readings: [{ metric: "temperature_c", value, unit: "c" }],
        },
        { now: NOW },
      );
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
          "non_finite_value",
        );
    }
  });

  it("rejects non-number value", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [{ metric: "temperature_c", value: "24", unit: "c" }],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "non_finite_value",
      );
  });

  it("rejects missing value", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [{ metric: "temperature_c", unit: "c" }],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_value",
      );
  });

  it("rejects missing unit", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [{ metric: "temperature_c", value: 24 }],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect((r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code)).toContain(
        "missing_unit",
      );
  });

  it("reports issues for every invalid reading in the batch (all-or-nothing)", () => {
    const r = validatePiIngestRequestEnvelope(
      {
        ...validBody(),
        readings: [
          { metric: "temperature_c", value: 24, unit: "c" },
          { metric: "humidity_pct", value: Number.NaN, unit: "%" },
          { metric: "ppfd", value: 500, unit: "umol" },
        ],
      },
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const codes = (r as FailedPiIngestRequestValidationResult).issues.map((i) => i.code);
      expect(codes).toContain("non_finite_value");
      expect(codes).toContain("forbidden_metric");
      // indexes recorded for caller debugging
      expect((r as FailedPiIngestRequestValidationResult).issues.some((i) => i.index === 1)).toBe(
        true,
      );
      expect((r as FailedPiIngestRequestValidationResult).issues.some((i) => i.index === 2)).toBe(
        true,
      );
    }
  });
});

describe("allowlist helpers", () => {
  it("isAllowedPiIngestMetric accepts the V0 metrics only", () => {
    expect(isAllowedPiIngestMetric("temperature_c")).toBe(true);
    expect(isAllowedPiIngestMetric("humidity_pct")).toBe(true);
    expect(isAllowedPiIngestMetric("ppfd")).toBe(false);
    expect(isAllowedPiIngestMetric("soil_ec")).toBe(false);
    expect(isAllowedPiIngestMetric(null)).toBe(false);
    expect(isAllowedPiIngestMetric(123)).toBe(false);
  });

  it("isAllowedPiIngestSource accepts only pi_bridge", () => {
    expect(isAllowedPiIngestSource("pi_bridge")).toBe(true);
    expect(isAllowedPiIngestSource("manual")).toBe(false);
    expect(isAllowedPiIngestSource("sim")).toBe(false);
    expect(isAllowedPiIngestSource("home_assistant")).toBe(false);
    expect(isAllowedPiIngestSource(undefined)).toBe(false);
  });

  it("isAllowedPiIngestUnit only accepts the right unit per metric", () => {
    expect(isAllowedPiIngestUnit("temperature_c", "c")).toBe(true);
    expect(isAllowedPiIngestUnit("temperature_c", "F")).toBe(true);
    expect(isAllowedPiIngestUnit("temperature_c", "%")).toBe(false);
    expect(isAllowedPiIngestUnit("humidity_pct", "%")).toBe(true);
    expect(isAllowedPiIngestUnit("humidity_pct", "kpa")).toBe(false);
    expect(isAllowedPiIngestUnit("vpd_kpa", "kpa")).toBe(true);
    expect(isAllowedPiIngestUnit("co2_ppm", "ppm")).toBe(true);
    expect(isAllowedPiIngestUnit("ppfd", "umol")).toBe(false);
  });
});

describe("toExternalSensorIngestPayload + normalizeIngestPayload integration", () => {
  it("validated envelope flows cleanly into the existing normalization layer", () => {
    const r = validatePiIngestRequestEnvelope(validBody(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = toExternalSensorIngestPayload(r.envelope);
    expect(payload.source).toBe("pi_bridge");
    expect(payload.tent_id).toBe("tent-uuid-1");
    expect(payload.device_id).toBe("sensorpush-gateway-1");
    const norm = normalizeIngestPayload(payload, { now: NOW });
    expect(norm.ok).toBe(true);
    expect(norm.rows.length).toBe(3);
    expect(norm.rows.every((row) => row.source === "pi_bridge")).toBe(true);
  });

  it("does not include user_id in the adapter output (RLS owns ownership)", () => {
    const r = validatePiIngestRequestEnvelope(validBody(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = toExternalSensorIngestPayload(r.envelope);
    expect((payload as unknown as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("preserves the raw envelope verbatim as raw_payload only", () => {
    const r = validatePiIngestRequestEnvelope(validBody(), { now: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const payload = toExternalSensorIngestPayload(r.envelope);
    expect(payload.raw_payload).toEqual({ gateway: "x" });
  });
});

// ------------- Static safety -------------

const SRC = readFileSync(resolve(__dirname, "../lib/piIngestRequestRules.ts"), "utf8");

describe("piIngestRequestRules — static safety", () => {
  it("does not import Supabase runtime/client or React", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase\/client/);
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']react["']/);
    expect(SRC).not.toMatch(/from\s+["']react\//);
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
    // Identifier names like home_assistant only appear inside rejection-test strings,
    // not in the production module.
    expect(SRC).not.toMatch(/\bmqtt\b/i);
    expect(SRC).not.toMatch(/automation|device[\s_-]?control/i);
  });
});
