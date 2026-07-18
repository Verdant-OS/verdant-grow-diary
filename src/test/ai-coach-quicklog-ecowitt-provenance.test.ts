import { describe, expect, it } from "vitest";
import { buildAiSensorSnapshotContext } from "@/lib/aiSensorSnapshotContextRules";
import {
  acquireQuickLogSensorSnapshot,
  resolveQuickLogSensorSnapshotForAi,
  type QuickLogSensorAcquisitionRow,
} from "@/lib/quick-log/quickLogSensorSnapshotAcquisitionRules";

const NOW = new Date("2026-06-09T12:05:00Z");
const QUICK_LOG_SNAPSHOT = {
  source: "live",
  captured_at: "2026-06-09T12:00:00Z",
  metrics: { temperature: 99, humidity: 55 },
};

function physicalGatewayPayload() {
  return {
    vendor: "ecowitt_windows_testbench",
    metadata: {
      reported_verdant_source: "live",
      raw_payload: {
        stationtype: "GW2000A_V3.2.4",
        model: "GW2000A",
        dateutc: "2026-06-09 12:00:00",
      },
    },
  };
}

function sensorRow(
  id: string,
  metric: string,
  capturedAt: string,
  value: number,
  rawPayload: unknown,
): QuickLogSensorAcquisitionRow {
  return {
    id,
    metric,
    value,
    quality: "ok",
    source: "live",
    captured_at: capturedAt,
    raw_payload: rawPayload,
  };
}

function coachContext(rows: QuickLogSensorAcquisitionRow[] | null) {
  const resolved = resolveQuickLogSensorSnapshotForAi(QUICK_LOG_SNAPSHOT, rows, { now: NOW });
  return buildAiSensorSnapshotContext(resolved, { now: NOW });
}

describe("AI Coach — Quick Log ECOWITT provenance consumption", () => {
  it("diagnostic-only rows cannot raise trust or forward values", () => {
    const context = coachContext([
      sensorRow("diagnostic", "temperature_c", "2026-06-09T12:00:00Z", 99, {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test" },
      }),
    ]);

    expect(context.sourceLabel).toBe("demo");
    expect(context.trustLevel).toBe("low");
    expect(context.isTrustedForAi).toBe(false);
    expect(context.valuesForModel).toBeNull();
    expect(context.annotationLine).not.toContain("99");
  });

  it("mixed diagnostic and physical rows use only the physical cohort", () => {
    const context = coachContext([
      sensorRow("diagnostic", "temperature_c", "2026-06-09T12:00:00Z", 99, {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test" },
      }),
      sensorRow(
        "physical-temp",
        "temperature_c",
        "2026-06-09T11:59:00Z",
        24.3,
        physicalGatewayPayload(),
      ),
      sensorRow(
        "physical-humidity",
        "humidity_pct",
        "2026-06-09T11:59:00Z",
        55,
        physicalGatewayPayload(),
      ),
    ]);

    expect(context.sourceLabel).toBe("live");
    expect(context.trustLevel).toBe("high");
    expect(context.isTrustedForAi).toBe(true);
    expect(context.valuesForModel).toEqual({
      temperature_c: 24.3,
      humidity: 55,
    });
    expect(context.annotationLine).not.toContain("99");
  });

  it("keeps a physical gateway Quick Log snapshot trusted", () => {
    const context = coachContext([
      sensorRow(
        "physical-temp",
        "temperature_c",
        "2026-06-09T12:00:00Z",
        24.3,
        physicalGatewayPayload(),
      ),
    ]);

    expect(context.sourceLabel).toBe("live");
    expect(context.trustLevel).toBe("high");
    expect(context.valuesForModel).toEqual({ temperature_c: 24.3 });
  });

  it("does not relabel an older same-source metric with the fresh anchor time", () => {
    const acquired = acquireQuickLogSensorSnapshot(
      [
        sensorRow(
          "physical-temp",
          "temperature_c",
          "2026-06-09T12:00:00Z",
          24.3,
          physicalGatewayPayload(),
        ),
        sensorRow(
          "old-humidity",
          "humidity_pct",
          "2026-06-09T11:54:59Z",
          88,
          physicalGatewayPayload(),
        ),
      ],
      { now: NOW },
    );

    expect(acquired.snapshot).toEqual({
      source: "live",
      quality: "ok",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature: 24.3 },
    });
  });

  it("keeps a same-source metric exactly on the five-minute coherence boundary", () => {
    const acquired = acquireQuickLogSensorSnapshot(
      [
        sensorRow(
          "physical-temp",
          "temperature_c",
          "2026-06-09T12:00:00Z",
          24.3,
          physicalGatewayPayload(),
        ),
        sensorRow(
          "boundary-humidity",
          "humidity_pct",
          "2026-06-09T11:55:00Z",
          55,
          physicalGatewayPayload(),
        ),
      ],
      { now: NOW },
    );

    expect(acquired.snapshot?.metrics).toEqual({ temperature: 24.3, humidity: 55 });
  });

  it("fails closed for a legacy nested live snapshot with no row provenance", () => {
    const context = coachContext(null);
    expect(context.sourceLabel).toBe("unknown");
    expect(context.trustLevel).toBe("low");
    expect(context.isTrustedForAi).toBe(false);
    expect(context.valuesForModel).toBeNull();
  });
});
