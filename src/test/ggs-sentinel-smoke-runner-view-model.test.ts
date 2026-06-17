import { describe, it, expect } from "vitest";
import {
  FRESHNESS_EXPLANATORY_NOTE,
  buildGgsSentinelSmokeRunnerPanelViewModel,
  formatAgeText,
  formatCapturedText,
} from "@/lib/ggsSentinelSmokeRunnerViewModel";
import { runGgsSentinelSmoke, SPIDER_FARMER_GGS_AGING_MS, type SentinelSensorRow } from "@/lib/ggsSentinelSmokeRunner";
import { SPIDER_FARMER_GGS_PROVIDER, SPIDER_FARMER_GGS_STALE_MS } from "@/lib/spiderFarmerGgsMappingRules";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const fresh = (offsetSec = 60) => new Date(NOW.getTime() - offsetSec * 1000).toISOString();
const aging = () => new Date(NOW.getTime() - (SPIDER_FARMER_GGS_AGING_MS + 60_000)).toISOString();
const stale = () => new Date(NOW.getTime() - (SPIDER_FARMER_GGS_STALE_MS + 60_000)).toISOString();

function row(overrides: Partial<SentinelSensorRow> & Pick<SentinelSensorRow, "metric" | "value">): SentinelSensorRow {
  return {
    source: SPIDER_FARMER_GGS_PROVIDER,
    quality: "live",
    captured_at: fresh(),
    ...overrides,
  };
}

describe("formatAgeText", () => {
  it("returns 'No row found' when state is missing", () => {
    expect(formatAgeText(null, "missing")).toBe("No row found");
    expect(formatAgeText(60_000, "missing")).toBe("No row found");
  });
  it("formats seconds / minutes / hours / days", () => {
    expect(formatAgeText(30_000, "fresh")).toBe("30s ago");
    expect(formatAgeText(5 * 60_000, "fresh_but_aging")).toBe("5m ago");
    expect(formatAgeText(3 * 60 * 60_000, "stale")).toBe("3h ago");
    expect(formatAgeText(2 * 24 * 60 * 60_000, "stale")).toBe("2d ago");
  });
  it("clamps negative ages to 0s", () => {
    expect(formatAgeText(-10_000, "fresh")).toBe("0s ago");
  });
});

describe("formatCapturedText", () => {
  it("returns null for null input", () => {
    expect(formatCapturedText(null)).toBeNull();
  });
  it("returns null for unparseable input", () => {
    expect(formatCapturedText("not-a-date")).toBeNull();
  });
  it("formats ISO timestamps as deterministic UTC strings", () => {
    expect(formatCapturedText("2026-06-17T11:59:00.000Z")).toBe("2026-06-17 11:59Z");
  });
});

describe("buildGgsSentinelSmokeRunnerPanelViewModel", () => {
  it("attaches the verbatim explanatory note that does NOT change verdict priority", () => {
    const verdict = runGgsSentinelSmoke({ rows: [], now: NOW });
    const vm = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    expect(vm.freshnessNote).toBe(FRESHNESS_EXPLANATORY_NOTE);
    expect(vm.freshnessNote).toContain("does not change Sentinel result priority");
    expect(vm.freshnessNote).toContain("explains why each metric is fresh, aging, stale, or missing");
  });

  it("emits exactly one row per required metric", () => {
    const verdict = runGgsSentinelSmoke({ rows: [], now: NOW });
    const vm = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    expect(vm.rows.map((r) => r.metric).sort()).toEqual(["soil_ec", "soil_temp_c"]);
  });

  it("distinguishes Missing from Stale at the row level (label + tone + ageText)", () => {
    const verdict = runGgsSentinelSmoke({
      rows: [
        // soil_temp_c absent → missing
        row({ metric: "soil_ec", value: 1.8, captured_at: stale() }),
      ],
      now: NOW,
    });
    const vm = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    const tempRow = vm.rows.find((r) => r.metric === "soil_temp_c");
    const ecRow = vm.rows.find((r) => r.metric === "soil_ec");
    expect(tempRow?.statusLabel).toBe("Missing");
    expect(tempRow?.tone).toBe("muted");
    expect(tempRow?.ageText).toBe("No row found");
    expect(tempRow?.nextAction).toBe("Paste/ingest a real GGS payload");
    expect(ecRow?.statusLabel).toBe("Stale");
    expect(ecRow?.tone).toBe("destructive");
    expect(ecRow?.ageText).toMatch(/\d+m ago/);
    expect(ecRow?.nextAction).toBe("Ingest a new real GGS reading");
  });

  it("Fresh and Fresh but aging tones are distinct from Stale and Missing", () => {
    const verdict = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22, captured_at: fresh(30) }),
        row({ metric: "soil_ec", value: 1.8, captured_at: aging() }),
      ],
      now: NOW,
    });
    const vm = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    const tempRow = vm.rows.find((r) => r.metric === "soil_temp_c");
    const ecRow = vm.rows.find((r) => r.metric === "soil_ec");
    expect(tempRow?.statusLabel).toBe("Fresh");
    expect(tempRow?.tone).toBe("primary");
    expect(ecRow?.statusLabel).toBe("Fresh but aging");
    expect(ecRow?.tone).toBe("warning");
    const distinctTones = new Set([tempRow?.tone, ecRow?.tone, "destructive", "muted"]);
    expect(distinctTones.size).toBe(4);
  });

  it("pill mirrors the verdict state (PASS gets primary, BLOCKED_* gets destructive)", () => {
    const passVerdict = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8 }),
      ],
      now: NOW,
    });
    expect(buildGgsSentinelSmokeRunnerPanelViewModel(passVerdict).pill.tone).toBe("primary");

    const blockedVerdict = runGgsSentinelSmoke({ rows: [], now: NOW });
    const vm = buildGgsSentinelSmokeRunnerPanelViewModel(blockedVerdict);
    expect(vm.pill.tone).toBe("destructive");
    expect(vm.pill.state).toBe("BLOCKED_NO_GGS_ROWS");
    expect(vm.pill.label).toMatch(/no GGS rows/i);
  });

  it("is deterministic for the same verdict input", () => {
    const verdict = runGgsSentinelSmoke({
      rows: [
        row({ metric: "soil_temp_c", value: 22 }),
        row({ metric: "soil_ec", value: 1.8 }),
      ],
      now: NOW,
    });
    const a = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    const b = buildGgsSentinelSmokeRunnerPanelViewModel(verdict);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
