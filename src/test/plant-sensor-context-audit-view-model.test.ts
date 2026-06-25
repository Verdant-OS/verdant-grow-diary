/**
 * Tests for buildPlantSensorContextAuditView (pure view-model).
 */
import { describe, it, expect } from "vitest";
import {
  buildPlantSensorContextAuditView,
  PLANT_SENSOR_CONTEXT_STALE_HOURS,
} from "@/lib/plantSensorContextAuditViewModel";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";

const NOW = new Date("2026-06-12T12:00:00Z");
const HOUR = 3_600_000;
const ago = (h: number) =>
  new Date(NOW.getTime() - h * HOUR).toISOString();

function log(
  capturedAt: string,
  metrics: Record<string, number | null>,
  source: string = "manual",
): ManualSensorLog {
  return { capturedAt, source, metrics } as ManualSensorLog;
}

describe("buildPlantSensorContextAuditView", () => {
  it("returns missing when no logs are present", () => {
    const v = buildPlantSensorContextAuditView([], NOW);
    expect(v.status).toBe("missing");
    expect(v.recentLogCount).toBe(0);
    expect(v.latestCapturedAt).toBeNull();
    expect(v.metrics).toEqual([]);
    expect(v.sources).toEqual([]);
    expect(v.message).toMatch(/No plant-level manual sensor snapshots found/);
  });

  it("returns missing for null/undefined/malformed input", () => {
    expect(buildPlantSensorContextAuditView(null, NOW).status).toBe("missing");
    expect(buildPlantSensorContextAuditView(undefined, NOW).status).toBe(
      "missing",
    );
    // Malformed capturedAt entries get filtered out -> still missing
    const bad = [
      { capturedAt: "not-a-date", source: "manual", metrics: { temp_f: 72 } },
    ] as unknown as ManualSensorLog[];
    expect(buildPlantSensorContextAuditView(bad, NOW).status).toBe("missing");
  });

  it("returns strong when recent logs include temp/humidity and a root-zone metric", () => {
    const v = buildPlantSensorContextAuditView(
      [log(ago(2), { temp_f: 72, humidity_percent: 55, ph: 6.2, ec: 1.4 })],
      NOW,
    );
    expect(v.status).toBe("strong");
    const labels = v.metrics.map((m) => m.label);
    expect(labels).toContain("Temperature");
    expect(labels).toContain("Humidity");
    expect(labels).toContain("pH");
    expect(labels).toContain("EC");
  });

  it("returns limited when only one environment metric is present", () => {
    const v = buildPlantSensorContextAuditView(
      [log(ago(2), { temp_f: 72 })],
      NOW,
    );
    expect(v.status).toBe("limited");
    expect(v.metrics.map((m) => m.label)).toEqual(["Temperature"]);
  });

  it("returns stale when latest log is older than the 72h threshold", () => {
    const v = buildPlantSensorContextAuditView(
      [log(ago(PLANT_SENSOR_CONTEXT_STALE_HOURS + 1), { temp_f: 72, ph: 6.2 })],
      NOW,
    );
    expect(v.status).toBe("stale");
    expect(v.message).toMatch(/stale/i);
    expect(v.ageHours).toBeGreaterThan(PLANT_SENSOR_CONTEXT_STALE_HOURS);
  });

  it("preserves source labels honestly and does not invent live/demo/csv", () => {
    const v = buildPlantSensorContextAuditView(
      [log(ago(1), { temp_f: 72 }, "manual")],
      NOW,
    );
    expect(v.sources).toEqual(["manual"]);
  });

  it("surfaces non-manual source labels only when actually present in the rows", () => {
    const v = buildPlantSensorContextAuditView(
      [
        log(ago(1), { temp_f: 72 }, "manual"),
        log(ago(2), { humidity_percent: 50 }, "csv"),
      ],
      NOW,
    );
    expect(v.sources.sort()).toEqual(["csv", "manual"]);
  });

  it("ignores non-finite metric values", () => {
    const v = buildPlantSensorContextAuditView(
      [
        log(ago(1), {
          temp_f: Number.NaN as unknown as number,
          ph: 6.2,
        }),
      ],
      NOW,
    );
    const labels = v.metrics.map((m) => m.label);
    expect(labels).not.toContain("Temperature");
    expect(labels).toContain("pH");
  });
});
