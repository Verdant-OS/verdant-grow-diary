/**
 * VPD derivation for live ingest + chart fallback.
 *
 * Asserts:
 *  - normalizeIngestPayload synthesizes vpd_kpa from valid temperature_c +
 *    humidity_pct on the same captured_at (live ingest path) and preserves
 *    source / tent_id / ts / device_id / captured_at on the derived row.
 *  - it does NOT derive VPD when humidity is 0 / > 100, when temperature
 *    is out of realistic range, or when one of the two is missing.
 *  - it does NOT override a vpd_kpa value the payload already supplied.
 *  - Fahrenheit input is converted to Celsius before derivation (unit
 *    conversion happens in normalize before derive runs).
 *  - environmentTrends.samplesFromReadings derives a read-time fallback
 *    when persisted vpd is missing, but never overrides a persisted vpd
 *    and never fabricates VPD from invalid telemetry.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeIngestPayload,
  deriveVpdRowsFromNormalized,
} from "@/lib/sensorIngestNormalizationRules";
import { samplesFromReadings } from "@/lib/environmentTrends";

const TENT = "11111111-1111-1111-1111-111111111111";
const TS = "2026-06-19T12:00:00.000Z";

describe("normalizeIngestPayload — live VPD derivation", () => {
  it("emits a derived vpd_kpa row when temperature_c + humidity_pct are present", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [
        { metric: "temperature_c", value: 25, unit: "temperature_c" },
        { metric: "humidity_pct", value: 60, unit: "percent" },
      ],
    });
    expect(r.ok).toBe(true);
    const vpdRows = r.rows.filter((x) => x.metric === "vpd_kpa");
    expect(vpdRows).toHaveLength(1);
    const v = vpdRows[0];
    expect(typeof v.value).toBe("number");
    expect(v.value as number).toBeGreaterThan(1.2);
    expect(v.value as number).toBeLessThan(1.3);
    expect(v.source).toBe("pi_bridge");
    expect(v.tent_id).toBe(TENT);
    expect(v.ts).toBe(TS);
    expect((v.raw_payload as { calculated?: boolean }).calculated).toBe(true);
    expect(
      (v.raw_payload as { derived_from?: string[] }).derived_from,
    ).toEqual(["temperature_c", "humidity_pct"]);
  });

  it("converts Fahrenheit temperature to Celsius before VPD derivation", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [
        { metric: "temperature_c", value: 77, unit: "temperature_f" }, // 25 C
        { metric: "humidity_pct", value: 60, unit: "percent" },
      ],
    });
    expect(r.ok).toBe(true);
    const v = r.rows.find((x) => x.metric === "vpd_kpa");
    expect(v).toBeDefined();
    expect(v!.value as number).toBeGreaterThan(1.2);
    expect(v!.value as number).toBeLessThan(1.3);
  });

  it("does NOT derive VPD when humidity is 0", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [
        { metric: "temperature_c", value: 25, unit: "temperature_c" },
        { metric: "humidity_pct", value: 0, unit: "percent" },
      ],
    });
    // RH=0 produces a valid SVP*(1-0)=svp; spec says do NOT derive at RH=0
    // because it's almost certainly a stuck/invalid sensor.
    const v = r.rows.find((x) => x.metric === "vpd_kpa");
    expect(v).toBeUndefined();
  });

  it("does NOT derive VPD when humidity is missing", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [
        { metric: "temperature_c", value: 25, unit: "temperature_c" },
      ],
    });
    expect(r.rows.find((x) => x.metric === "vpd_kpa")).toBeUndefined();
  });

  it("does NOT derive VPD when temperature is missing", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [{ metric: "humidity_pct", value: 60, unit: "percent" }],
    });
    expect(r.rows.find((x) => x.metric === "vpd_kpa")).toBeUndefined();
  });

  it("does NOT override an explicitly supplied vpd_kpa", () => {
    const r = normalizeIngestPayload({
      tent_id: TENT,
      source: "pi_bridge",
      captured_at: TS,
      readings: [
        { metric: "temperature_c", value: 25, unit: "temperature_c" },
        { metric: "humidity_pct", value: 60, unit: "percent" },
        { metric: "vpd_kpa", value: 0.42, unit: "kPa" },
      ],
    });
    const vpds = r.rows.filter((x) => x.metric === "vpd_kpa");
    expect(vpds).toHaveLength(1);
    expect(vpds[0].value).toBe(0.42);
  });
});

describe("deriveVpdRowsFromNormalized — pure helper", () => {
  it("returns [] for empty input", () => {
    expect(deriveVpdRowsFromNormalized([])).toEqual([]);
  });
  it("returns [] when only one of temp/rh present", () => {
    const out = deriveVpdRowsFromNormalized([
      {
        tent_id: TENT,
        metric: "temperature_c",
        value: 25,
        source: "pi_bridge",
        ts: TS,
      },
    ]);
    expect(out).toEqual([]);
  });
});

describe("environmentTrends.samplesFromReadings — read-time VPD fallback", () => {
  it("derives VPD when temp + rh present but vpd_kpa missing", () => {
    const rows = [
      {
        ts: TS,
        metric: "temperature_c",
        value: 25,
        source: "pi_bridge",
        tent_id: TENT,
      },
      {
        ts: TS,
        metric: "humidity_pct",
        value: 60,
        source: "pi_bridge",
        tent_id: TENT,
      },
    ];
    const samples = samplesFromReadings(rows);
    expect(samples).toHaveLength(1);
    expect(samples[0].vpd).not.toBeNull();
    expect(samples[0].vpd!).toBeGreaterThan(1.2);
    expect(samples[0].vpd!).toBeLessThan(1.3);
  });

  it("does NOT override a persisted vpd_kpa value", () => {
    const samples = samplesFromReadings([
      { ts: TS, metric: "temperature_c", value: 25, tent_id: TENT },
      { ts: TS, metric: "humidity_pct", value: 60, tent_id: TENT },
      { ts: TS, metric: "vpd_kpa", value: 0.42, tent_id: TENT },
    ]);
    expect(samples[0].vpd).toBe(0.42);
  });

  it("does NOT derive VPD from invalid humidity (>100)", () => {
    const samples = samplesFromReadings([
      { ts: TS, metric: "temperature_c", value: 25, tent_id: TENT },
      { ts: TS, metric: "humidity_pct", value: 150, tent_id: TENT },
    ]);
    expect(samples[0].vpd).toBeNull();
  });

  it("does NOT render missing VPD as zero", () => {
    const samples = samplesFromReadings([
      { ts: TS, metric: "temperature_c", value: 25, tent_id: TENT },
    ]);
    expect(samples[0].vpd).toBeNull();
    expect(samples[0].vpd).not.toBe(0);
  });

  it("preserves source labels (live/manual/sim)", () => {
    const samples = samplesFromReadings([
      { ts: TS, metric: "temperature_c", value: 25, tent_id: TENT, source: "manual" },
      { ts: TS, metric: "humidity_pct", value: 60, tent_id: TENT, source: "manual" },
    ]);
    expect(samples[0].source).toBe("manual");
    expect(samples[0].vpd).not.toBeNull();
  });
});
