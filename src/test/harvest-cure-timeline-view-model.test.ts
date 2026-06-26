import { describe, it, expect } from "vitest";
import {
  buildHarvestCardViewModel,
  buildCureCheckCardViewModel,
  buildSensorCardViewModel,
} from "@/lib/harvestCureTimelineCardViewModel";

describe("buildSensorCardViewModel", () => {
  it("returns undefined when snapshot is null", () => {
    expect(buildSensorCardViewModel(null)).toBeUndefined();
  });

  it("keeps manual snapshots as non-live and not unreliable", () => {
    const vm = buildSensorCardViewModel({
      source: "manual",
      captured_at: "2026-06-26T12:00:00Z",
      metrics: { temp_f: 70, rh: 60 },
    })!;
    expect(vm.source).toBe("manual");
    expect(vm.sourceLabel).toBe("Manual reading");
    expect(vm.isHealthyLive).toBe(false);
    expect(vm.isUnreliable).toBe(false);
    expect(vm.metrics).toEqual({ temp_f: 70, rh: 60 });
  });

  it("flags demo/stale/invalid as unreliable and never healthy", () => {
    for (const source of ["demo", "stale", "invalid"]) {
      const vm = buildSensorCardViewModel({ source, metrics: {} })!;
      expect(vm.isHealthyLive).toBe(false);
      expect(vm.isUnreliable).toBe(true);
    }
  });

  it("rejects unknown source strings as invalid and unreliable", () => {
    const vm = buildSensorCardViewModel({ source: "gateway-pro-v2", metrics: {} })!;
    expect(vm.source).toBe("invalid");
    expect(vm.isUnreliable).toBe(true);
    expect(vm.isHealthyLive).toBe(false);
  });
});

describe("buildHarvestCardViewModel", () => {
  it("always carries the cautious memory note", () => {
    const vm = buildHarvestCardViewModel({ details: {} });
    expect(vm.kind).toBe("harvest");
    expect(vm.memoryNote).toMatch(/grow memory/i);
  });

  it("never infers keeper status when not provided", () => {
    const vm = buildHarvestCardViewModel({
      details: { wet_weight_grams: 500, quality_note: "frosty" },
    });
    expect(vm.keeper_candidate).toBeUndefined();
  });

  it("passes through manual sensor snapshot without claiming live", () => {
    const vm = buildHarvestCardViewModel({
      details: {},
      sensor: { source: "manual", metrics: { temp_f: 72 } },
    });
    expect(vm.sensor?.source).toBe("manual");
    expect(vm.sensor?.isHealthyLive).toBe(false);
  });
});

describe("buildCureCheckCardViewModel", () => {
  it("renders mold concern as caution only (no alert escalation)", () => {
    const vm = buildCureCheckCardViewModel({
      details: { container_label: "Jar 1", mold_check: "concern", cure_day: 3 },
    });
    expect(vm.cautionState).toBe("caution");
    expect(vm.cautionCopy).toMatch(/grower decision required/i);
  });

  it("clear / unknown / missing mold check has no caution copy", () => {
    for (const mold of ["clear", "unknown", undefined] as const) {
      const vm = buildCureCheckCardViewModel({
        details: { mold_check: mold as never },
      });
      expect(vm.cautionState).toBe("none");
      expect(vm.cautionCopy).toBeNull();
    }
  });

  it("stale snapshot does not count as good evidence", () => {
    const vm = buildCureCheckCardViewModel({
      details: {},
      sensor: { source: "stale", metrics: { rh: 62 } },
    });
    expect(vm.sensor?.isUnreliable).toBe(true);
    expect(vm.sensor?.isHealthyLive).toBe(false);
  });
});
