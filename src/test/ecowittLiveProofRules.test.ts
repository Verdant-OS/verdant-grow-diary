import { describe, it, expect } from "vitest";
import {
  classifyEcowittProofRow,
  detectEcowittVendor,
  detectInvalidMetric,
  detectStuckSoilMoisture,
  ECOWITT_PROOF_WINDOW_MS,
  resolveSourceKind,
  sortRowsByCapturedAtDesc,
  type EcowittProofRow,
} from "@/lib/ecowittLiveProofRules";

const NOW = Date.parse("2026-06-19T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const min = (m: number) => m * 60_000;
const hr = (h: number) => h * 60 * 60_000;

function row(overrides: Partial<EcowittProofRow>): EcowittProofRow {
  return {
    id: "r",
    tent_id: "t-1",
    source: "live",
    captured_at: iso(-min(1)),
    raw_payload: { vendor: "ecowitt" },
    metric: "temp",
    value: 24,
    unit: "C",
    ...overrides,
  };
}

describe("detectEcowittVendor", () => {
  it("accepts canonical legacy source=ecowitt", () => {
    expect(detectEcowittVendor(row({ source: "ecowitt", raw_payload: null }))).toBe(true);
  });
  it("accepts raw_payload.vendor = ecowitt", () => {
    expect(detectEcowittVendor(row({ raw_payload: { vendor: "ecowitt_windows_testbench" } }))).toBe(true);
  });
  it("accepts metadata.transport_source ecowitt", () => {
    expect(detectEcowittVendor(row({ raw_payload: { metadata: { transport_source: "ecowitt" } } }))).toBe(true);
  });
  it("rejects when no lineage", () => {
    expect(detectEcowittVendor(row({ source: "live", raw_payload: { vendor: "spider_farmer" } }))).toBe(false);
  });
});

describe("resolveSourceKind", () => {
  it("classifies sources", () => {
    expect(resolveSourceKind(row({ source: "live" }))).toBe("canonical_live");
    expect(resolveSourceKind(row({ source: "ecowitt" }))).toBe("legacy_ecowitt");
    expect(resolveSourceKind(row({ source: "manual" }))).toBe("non_live");
    expect(resolveSourceKind(row({ source: "demo" }))).toBe("non_live");
    expect(resolveSourceKind(row({ source: "csv" }))).toBe("non_live");
    expect(resolveSourceKind(row({ source: null }))).toBe("missing");
  });
});

describe("sortRowsByCapturedAtDesc", () => {
  it("sorts newest first; missing/invalid timestamps last", () => {
    const a = row({ id: "a", captured_at: iso(-min(10)) });
    const b = row({ id: "b", captured_at: iso(-min(1)) });
    const c = row({ id: "c", captured_at: null, ts: null });
    const d = row({ id: "d", captured_at: "not-a-date", ts: null });
    const out = sortRowsByCapturedAtDesc([a, c, b, d]).map((r) => r.id);
    expect(out[0]).toBe("b");
    expect(out[1]).toBe("a");
    expect(out.slice(2).sort()).toEqual(["c", "d"]);
  });
  it("returns empty for null", () => {
    expect(sortRowsByCapturedAtDesc(null)).toEqual([]);
  });
});

describe("detectInvalidMetric", () => {
  it("flags humidity stuck at 100", () => {
    expect(detectInvalidMetric(row({ metric: "rh", value: 100 }))).toBe("humidity_stuck");
  });
  it("flags pH out of range", () => {
    expect(detectInvalidMetric(row({ metric: "ph", value: 12 }))).toBe("ph_out_of_range");
  });
  it("flags EC unit mismatch (large raw)", () => {
    expect(detectInvalidMetric(row({ metric: "soil_ec", value: 1450, unit: "" }))).toBe("ec_unit_mismatch");
  });
  it("flags CO2 out of bounds", () => {
    expect(detectInvalidMetric(row({ metric: "co2", value: 10 }))).toBe("co2_out_of_range");
  });
  it("passes a valid reading", () => {
    expect(detectInvalidMetric(row({ metric: "rh", value: 55 }))).toBeNull();
  });
});

describe("detectStuckSoilMoisture", () => {
  it("returns limited when <3 same-metric rows", () => {
    const cand = row({ metric: "soil", value: 0 });
    expect(detectStuckSoilMoisture(cand, [cand])).toBe("limited");
  });
  it("returns invalid when 3+ stuck at 0", () => {
    const cand = row({ metric: "soil", value: 0 });
    const rows = [cand, row({ metric: "soil", value: 0 }), row({ metric: "soil", value: 0 })];
    expect(detectStuckSoilMoisture(cand, rows)).toBe("invalid");
  });
  it("returns null when values vary", () => {
    const cand = row({ metric: "soil", value: 40 });
    const rows = [cand, row({ metric: "soil", value: 50 }), row({ metric: "soil", value: 35 })];
    expect(detectStuckSoilMoisture(cand, rows)).toBeNull();
  });
});

describe("classifyEcowittProofRow", () => {
  it("fresh canonical live + ecowitt vendor → live_confirmed", () => {
    const r = row({});
    expect(classifyEcowittProofRow(r, [r, r, r], NOW).status).toBe("live_confirmed");
  });
  it("legacy source=ecowitt fresh → live_confirmed", () => {
    const r = row({ source: "ecowitt", raw_payload: null });
    const c = classifyEcowittProofRow(r, [r, r, r], NOW);
    expect(c.status).toBe("live_confirmed");
    expect(c.sourceKind).toBe("legacy_ecowitt");
  });
  it("legacy ecowitt old → stale", () => {
    const r = row({ source: "ecowitt", raw_payload: null, captured_at: iso(-hr(2)) });
    expect(classifyEcowittProofRow(r, [r, r, r], NOW).status).toBe("stale");
  });
  it("manual/demo/csv → not_ecowitt", () => {
    for (const s of ["manual", "demo", "csv"]) {
      const r = row({ source: s });
      expect(classifyEcowittProofRow(r, [r], NOW).status).toBe("not_ecowitt");
    }
  });
  it("missing timestamp → unknown", () => {
    const r = row({ captured_at: null, ts: null });
    expect(classifyEcowittProofRow(r, [r], NOW).status).toBe("unknown");
  });
  it("future timestamp → invalid", () => {
    const r = row({ captured_at: iso(min(10)) });
    expect(classifyEcowittProofRow(r, [r], NOW).status).toBe("invalid");
  });
  it("humidity stuck → invalid", () => {
    const r = row({ metric: "rh", value: 100 });
    expect(classifyEcowittProofRow(r, [r, r, r], NOW).status).toBe("invalid");
  });
  it("canonical live without ecowitt vendor → not_ecowitt", () => {
    const r = row({ raw_payload: { vendor: "spider_farmer" } });
    expect(classifyEcowittProofRow(r, [r], NOW).status).toBe("not_ecowitt");
  });
});

describe("ECOWITT_PROOF_WINDOW_MS", () => {
  it("is exactly 24 hours", () => {
    expect(ECOWITT_PROOF_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
