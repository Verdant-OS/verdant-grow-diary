import { describe, it, expect } from "vitest";
import {
  buildEnvironmentCheckInsightsViewModel,
  ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER,
  ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH,
  ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE,
  ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS,
  ENVIRONMENT_CHECK_INSIGHTS_MISSING_DATA,
} from "@/lib/environmentCheckInsightsViewModel";
import type { EnvironmentCheckTimelineRawEntry } from "@/lib/environmentCheckTimelineViewModel";

function makeEntry(
  id: string,
  occurredAt: string,
  env: Record<string, unknown> | null,
): EnvironmentCheckTimelineRawEntry {
  return {
    id,
    entry_at: occurredAt,
    event_type: "environment_check",
    note: "",
    details: env ? { environment_check: env } : {},
  };
}

describe("environmentCheckInsightsViewModel", () => {
  it("returns 'not enough history' for 0 or 1 entries", () => {
    const empty = buildEnvironmentCheckInsightsViewModel([]);
    expect(empty.hasEnoughHistory).toBe(false);
    expect(empty.summary).toBe(ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH);
    expect(empty.count).toBe(0);

    const one = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-17T10:00:00Z", { temp_c: 24, humidity_pct: 55 }),
    ]);
    expect(one.hasEnoughHistory).toBe(false);
    expect(one.summary).toBe(ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH);
    expect(one.count).toBe(1);
  });

  it("uses diary entries only — pure input, never touches sensor_readings", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24, humidity_pct: 55 }),
      makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 25, humidity_pct: 56 }),
    ]);
    expect(vm.count).toBe(2);
    expect(vm.hasEnoughHistory).toBe(true);
    expect(vm.disclaimer).toBe(ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER);
  });

  it("emits cautious trend hints with 2+ entries (no danger language)", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-10T10:00:00Z", { temp_c: 23 }),
      makeEntry("b", "2026-06-15T10:00:00Z", { temp_c: 25 }),
      makeEntry("c", "2026-06-17T10:00:00Z", { temp_c: 27 }),
    ]);
    expect(vm.summary).toMatch(/Environment Checks logged in view/i);
    expect(vm.summary).not.toMatch(/danger|fix immediately|unhealthy/i);
  });

  it("computes min/max/average over numeric samples", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-10T10:00:00Z", { temp_c: 22, humidity_pct: 50 }),
      makeEntry("b", "2026-06-15T10:00:00Z", { temp_c: 24, humidity_pct: 55 }),
      makeEntry("c", "2026-06-17T10:00:00Z", { temp_c: 26, humidity_pct: 60 }),
    ]);
    const temp = vm.metrics.find((m) => m.key === "temp");
    expect(temp).toBeDefined();
    expect(temp!.min).toBe(22);
    expect(temp!.max).toBe(26);
    expect(temp!.avg).toBe(24);
    expect(temp!.count).toBe(3);
  });

  it("flags out-of-range latest values with cautious copy", () => {
    // Latest temp 35°C, way above default 28°C max.
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24 }),
      makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 35 }),
    ]);
    const temp = vm.metrics.find((m) => m.key === "temp")!;
    expect(temp.outOfRange).toBe(true);
    expect(temp.rangeDirection).toBe("high");
    expect(vm.outOfRangeNote).toBe(ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE);
    // Cautious copy only.
    expect(vm.outOfRangeNote).not.toMatch(/danger|critical|fix immediately/i);
  });

  it("emits a generic-targets warning by default", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24 }),
      makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 25 }),
    ]);
    expect(vm.usingGenericTargets).toBe(true);
    expect(vm.genericTargetsNote).toBe(ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS);
  });

  it("suppresses the generic-targets warning when plantSpecificTargets is true", () => {
    const vm = buildEnvironmentCheckInsightsViewModel(
      [
        makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24 }),
        makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 25 }),
      ],
      { plantSpecificTargets: true },
    );
    expect(vm.usingGenericTargets).toBe(false);
    expect(vm.genericTargetsNote).toBeNull();
  });

  it("omits missing/malformed values safely (no throw, no fake values)", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-15T10:00:00Z", {
        temp_c: 24,
        humidity_pct: "not a number",
        vpd_kpa: null,
      }),
      makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 25 }),
      makeEntry("c", "2026-06-18T10:00:00Z", null),
    ]);
    // Two entries had usable env data; one had nothing usable.
    expect(vm.count).toBe(3); // count is total env-check diary entries
    const temp = vm.metrics.find((m) => m.key === "temp")!;
    expect(temp.count).toBe(2);
    const rh = vm.metrics.find((m) => m.key === "humidity");
    expect(rh).toBeUndefined();
    expect(vm.missingDataNote).toBe(ENVIRONMENT_CHECK_INSIGHTS_MISSING_DATA);
  });

  it("returns latest values formatted with units", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([
      makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24, humidity_pct: 55 }),
      makeEntry("b", "2026-06-17T10:00:00Z", {
        temp_c: 26,
        humidity_pct: 60,
        vpd_kpa: 1.2,
        co2_ppm: 800,
      }),
    ]);
    expect(vm.latest).not.toBeNull();
    const map = new Map(vm.latest!.values.map((v) => [v.key, v.value]));
    expect(map.get("temp")).toBe("26.0°C");
    expect(map.get("humidity")).toBe("60%");
    expect(map.get("vpd")).toBe("1.20 kPa");
    expect(map.get("co2")).toBe("800 ppm");
  });

  it("always returns the not-live disclaimer", () => {
    const vm = buildEnvironmentCheckInsightsViewModel([]);
    expect(vm.disclaimer).toBe(ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER);
    expect(vm.disclaimer).toMatch(/not live sensor telemetry/i);
  });

  it("is deterministic for the same input", () => {
    const entries = [
      makeEntry("a", "2026-06-15T10:00:00Z", { temp_c: 24, humidity_pct: 55 }),
      makeEntry("b", "2026-06-17T10:00:00Z", { temp_c: 26, humidity_pct: 60 }),
    ];
    const a = buildEnvironmentCheckInsightsViewModel(entries);
    const b = buildEnvironmentCheckInsightsViewModel(entries);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
