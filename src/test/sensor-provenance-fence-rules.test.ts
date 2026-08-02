/**
 * Direct unit tests for the shared sensor provenance fence.
 *
 * Downstream suites already assert wiring (dashboard, MCP, Quick Log).
 * This file anchors the pure fence itself: diagnostic exclusion, physical
 * gateway exception, and null-safe stable filtering.
 */
import { describe, expect, it } from "vitest";
import {
  isDiagnosticSensorProvenanceRow,
  withoutDiagnosticSensorRows,
} from "@/lib/sensorProvenanceFenceRules";

const DIAGNOSTIC_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    confidence: "test",
    verdant_source: "live",
  },
};

const PHYSICAL_GATEWAY_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-17 11:55:00",
    },
  },
};

describe("isDiagnosticSensorProvenanceRow", () => {
  it("flags Windows diagnostic packets even when stored source is live", () => {
    expect(
      isDiagnosticSensorProvenanceRow({
        source: "live",
        raw_payload: DIAGNOSTIC_PAYLOAD,
      }),
    ).toBe(true);
  });

  it("keeps physical gateway evidence eligible (not diagnostic)", () => {
    expect(
      isDiagnosticSensorProvenanceRow({
        source: "live",
        raw_payload: PHYSICAL_GATEWAY_PAYLOAD,
      }),
    ).toBe(false);
  });

  it("fails closed for legacy source=ecowitt_windows_testbench without matching vendor envelope", () => {
    expect(
      isDiagnosticSensorProvenanceRow({
        source: "ecowitt_windows_testbench",
        raw_payload: null,
      }),
    ).toBe(true);
  });

  it("does not flag ordinary live/manual rows without testbench lineage", () => {
    expect(isDiagnosticSensorProvenanceRow({ source: "live", raw_payload: null })).toBe(false);
    expect(isDiagnosticSensorProvenanceRow({ source: "manual" })).toBe(false);
    expect(isDiagnosticSensorProvenanceRow({})).toBe(false);
  });
});

describe("withoutDiagnosticSensorRows", () => {
  it("returns [] for null, undefined, and non-array inputs", () => {
    expect(withoutDiagnosticSensorRows(null)).toEqual([]);
    expect(withoutDiagnosticSensorRows(undefined)).toEqual([]);
    // @ts-expect-error runtime guard
    expect(withoutDiagnosticSensorRows({ length: 1 })).toEqual([]);
  });

  it("filters diagnostics while preserving relative order of keepers", () => {
    const rows = [
      { id: "d1", source: "live", raw_payload: DIAGNOSTIC_PAYLOAD },
      { id: "k1", source: "live", raw_payload: PHYSICAL_GATEWAY_PAYLOAD },
      { id: "d2", source: "live", raw_payload: { metadata: { confidence: "demo" } } },
      { id: "k2", source: "manual", raw_payload: null },
      { id: "k3", source: "csv", raw_payload: null },
    ];

    const kept = withoutDiagnosticSensorRows(rows);
    expect(kept.map((r) => r.id)).toEqual(["k1", "k2", "k3"]);
  });

  it("is deterministic for the same input", () => {
    const rows = [
      { source: "live", raw_payload: DIAGNOSTIC_PAYLOAD },
      { source: "live", raw_payload: PHYSICAL_GATEWAY_PAYLOAD },
    ];
    expect(withoutDiagnosticSensorRows(rows)).toEqual(withoutDiagnosticSensorRows(rows));
  });

  it("does not mutate the input array", () => {
    const rows = [
      { id: "d1", source: "live", raw_payload: DIAGNOSTIC_PAYLOAD },
      { id: "k1", source: "manual", raw_payload: null },
    ];
    const copy = [...rows];
    withoutDiagnosticSensorRows(rows);
    expect(rows).toEqual(copy);
  });
});
