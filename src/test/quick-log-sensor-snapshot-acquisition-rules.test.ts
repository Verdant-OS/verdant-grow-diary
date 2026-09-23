import { describe, expect, it } from "vitest";
import {
  acquireQuickLogSensorSnapshot,
  type QuickLogSensorAcquisitionRow,
} from "@/lib/quick-log/quickLogSensorSnapshotAcquisitionRules";

const OBSERVED = "2026-06-09T12:00:00Z";

function row(
  id: string,
  metric: string,
  value: number,
  source: string,
  rawPayload: unknown = null,
): QuickLogSensorAcquisitionRow {
  return {
    id,
    metric,
    value,
    quality: "ok",
    source,
    captured_at: OBSERVED,
    ts: OBSERVED,
    created_at: OBSERVED,
    raw_payload: rawPayload,
  };
}

describe("acquireQuickLogSensorSnapshot source cohort", () => {
  it("does not fold live metrics under a manual anchor at the same timestamp", () => {
    const acquired = acquireQuickLogSensorSnapshot([
      row("manual-temp", "temperature_c", 24, "manual"),
      row("live-humidity", "humidity_pct", 55, "live"),
    ]);

    expect(acquired.snapshot).toEqual({
      source: "manual",
      captured_at: OBSERVED,
      metrics: { temperature: 24 },
    });
  });

  it("does not fold manual metrics under a live anchor at the same timestamp", () => {
    const acquired = acquireQuickLogSensorSnapshot([
      {
        ...row("live-temp", "temperature_c", 24.3, "live", {
          vendor: "ecowitt_windows_testbench",
          metadata: {
            reported_verdant_source: "live",
            raw_payload: { stationtype: "GW2000A_V3.2.4", model: "GW2000A" },
          },
        }),
        captured_at: "2026-06-09T12:00:01Z",
        ts: "2026-06-09T12:00:01Z",
        created_at: "2026-06-09T12:00:01Z",
      },
      row("manual-humidity", "humidity_pct", 55, "manual"),
    ]);

    expect(acquired.snapshot).toEqual({
      source: "live",
      captured_at: "2026-06-09T12:00:01Z",
      metrics: { temperature: 24.3 },
    });
  });

  it("reports diagnostic rows omitted before anchoring", () => {
    const acquired = acquireQuickLogSensorSnapshot([
      row("diagnostic-temp", "temperature_c", 99, "live", {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test" },
      }),
      row("manual-temp", "temperature_c", 24, "manual"),
    ]);

    expect(acquired.diagnosticRowsOmitted).toBe(1);
    expect(acquired.snapshot?.metrics).toEqual({ temperature: 24 });
  });
});
