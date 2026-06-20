/**
 * Tests for buildGgsSentinelEvidenceViewModel.
 * Pure / deterministic / null-safe.
 */
import { describe, it, expect } from "vitest";
import { buildGgsSentinelEvidenceViewModel } from "@/lib/ggsSentinelEvidenceViewModel";
import {
  evaluateGgsSentinelReadiness,
  type GgsSentinelInputRow,
  type GgsSentinelSnapshot,
} from "@/lib/ggsSentinelSmokeRunner";

const NOW = new Date("2026-06-17T18:30:00Z");

function row(
  metric: string,
  value: number,
  capturedAt: string,
  opts: Partial<GgsSentinelInputRow> = {},
): GgsSentinelInputRow {
  return {
    metric,
    value,
    source: "live",
    captured_at: capturedAt,
    raw_payload: { source_app: "spider_farmer_ggs", sensor_id: "GGS-1" },
    ...opts,
  };
}

const SNAP: GgsSentinelSnapshot = {
  captured_at: "2026-06-17T18:29:00Z",
  source: "live",
  soil_moisture: 40,
  soil_temp: 22,
  soil_ec: 0.9,
};

function offset(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("buildGgsSentinelEvidenceViewModel", () => {
  it("returns null when evaluation is null", () => {
    expect(buildGgsSentinelEvidenceViewModel({ evaluation: null })).toBeNull();
  });

  it("maps PASS state to pass verdict with no warnings", () => {
    const ts = offset(60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts),
        row("ec", 1, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const vm = buildGgsSentinelEvidenceViewModel({ evaluation: ev });
    expect(vm).not.toBeNull();
    expect(vm!.verdict).toBe("pass");
    expect(vm!.verdictLabel).toBe("PASS");
    expect(vm!.hasFreshnessWarning).toBe(false);
    expect(vm!.freshnessWarnings).toEqual([]);
    expect(vm!.metrics).toHaveLength(3);
    // Vendor passes through as label; raw payload body never does.
    expect(vm!.metrics.every((m) => m.vendorLabel === "spider_farmer_ggs")).toBe(true);
    expect(JSON.stringify(vm)).not.toContain("sensor_id");
  });

  it("flags stale metric as warning and adds Refresh evidence next step", () => {
    const fresh = offset(60_000);
    const stale = offset(16 * 60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, fresh),
        row("ec", 1, fresh),
        row("soil_temp_c", 22, stale),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const vm = buildGgsSentinelEvidenceViewModel({ evaluation: ev })!;
    expect(vm.verdict).toBe("blocked");
    expect(vm.hasFreshnessWarning).toBe(true);
    expect(vm.freshnessWarnings.some((w) => /stale/i.test(w))).toBe(true);
    expect(vm.nextSteps).toContain("Refresh evidence — at least one metric is past the freshness window.");
  });

  it("flags missing metric and recommends verifying the right row", () => {
    const ts = offset(60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const vm = buildGgsSentinelEvidenceViewModel({ evaluation: ev })!;
    expect(vm.verdict).toBe("blocked");
    expect(vm.hasFreshnessWarning).toBe(true);
    expect(vm.freshnessWarnings.some((w) => /EC/.test(w))).toBe(true);
    expect(vm.nextSteps).toContain("Verify EC row.");
  });

  it("never classifies invalid/non-canonical source as healthy", () => {
    const ts = offset(60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [
        row("soil_moisture_pct", 40, ts, { source: "ggs_live" }),
        row("ec", 1, ts),
        row("soil_temp_c", 22, ts),
      ],
      snapshot: SNAP,
      now: NOW,
    });
    const vm = buildGgsSentinelEvidenceViewModel({ evaluation: ev })!;
    expect(vm.verdict).toBe("blocked");
    expect(vm.nextSteps).toContain(
      "Confirm source label is canonical (live / manual / csv).",
    );
  });

  it("renders all three canonical metric rows in deterministic order", () => {
    const ts = offset(60_000);
    const ev = evaluateGgsSentinelReadiness({
      rows: [row("ec", 1, ts)],
      snapshot: SNAP,
      now: NOW,
    });
    const vm = buildGgsSentinelEvidenceViewModel({ evaluation: ev })!;
    expect(vm.metrics.map((m) => m.metric)).toEqual([
      "soil_moisture_pct",
      "ec",
      "soil_temp_c",
    ]);
    // Missing metrics keep value null — never a fabricated value.
    const moisture = vm.metrics.find((m) => m.metric === "soil_moisture_pct")!;
    expect(moisture.value).toBeNull();
    expect(moisture.freshness).toBe("missing");
  });
});
