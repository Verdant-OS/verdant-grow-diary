/**
 * Pure tests for sensorProvenanceFenceRules.
 *
 * Diagnostic Windows testbench rows must not count as plant evidence in MCP,
 * Quick Log, AI Doctor, or report adapters.
 */
import { describe, expect, it } from "vitest";
import {
  isDiagnosticSensorProvenanceRow,
  withoutDiagnosticSensorRows,
} from "@/lib/sensorProvenanceFenceRules";

describe("isDiagnosticSensorProvenanceRow", () => {
  it("flags explicit testbench listener rows", () => {
    expect(isDiagnosticSensorProvenanceRow({ source: "ecowitt_windows_testbench" })).toBe(true);
  });

  it("does not flag a physical EcoWitt bridge row with preserved live source and gateway markers", () => {
    expect(
      isDiagnosticSensorProvenanceRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: {
            confidence: "high",
            reported_verdant_source: "live",
            raw_payload: {
              stationtype: "GW2000A_V3.2.4",
              model: "GW2000A",
              dateutc: "2026-06-06 17:59:00",
            },
          },
        },
      }),
    ).toBe(false);
  });
});

describe("withoutDiagnosticSensorRows", () => {
  const liveRow = {
    source: "manual",
    raw_payload: { metadata: { confidence: "high" } },
  };
  const diagnosticRow = { source: "ecowitt_windows_testbench" };

  it("returns only non-diagnostic rows in stable order", () => {
    expect(withoutDiagnosticSensorRows([diagnosticRow, liveRow, diagnosticRow])).toEqual([liveRow]);
  });

  it.each([null, undefined])("returns an empty array for %s input", (value) => {
    expect(withoutDiagnosticSensorRows(value)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const rows = Object.freeze([
      Object.freeze({ ...liveRow }),
      Object.freeze({ ...diagnosticRow }),
    ]);
    withoutDiagnosticSensorRows(rows);
    expect(rows.map((row) => row.source)).toEqual(["manual", "ecowitt_windows_testbench"]);
  });
});
