import { describe, it, expect } from "vitest";
import { buildTimelineSensorSnapshotViewModel } from "@/lib/timelineSensorSnapshotViewModel";

describe("buildTimelineSensorSnapshotViewModel", () => {
  it("returns none for null/undefined", () => {
    expect(buildTimelineSensorSnapshotViewModel(null).kind).toBe("none");
    expect(buildTimelineSensorSnapshotViewModel(undefined).kind).toBe("none");
  });

  it("returns invalid for non-object input", () => {
    const vm = buildTimelineSensorSnapshotViewModel("not an object");
    expect(vm.kind).toBe("invalid");
    if (vm.kind === "invalid") {
      expect(vm.message).toMatch(/unavailable/i);
    }
  });

  it("renders Temp/RH/VPD chips for a valid snapshot", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: 75.4,
      humidity: 55.2,
      vpd: 1.234,
    });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    const metrics = vm.chips.map((c) => c.metric);
    expect(metrics).toEqual(["temp_f", "rh", "vpd"]);
    expect(vm.chips[0].display).toBe("75.4°F");
    expect(vm.chips[1].display).toBe("55.2%");
    expect(vm.chips[2].display).toBe("1.23 kPa");
  });

  it("renders soil moisture and CO2 only when present", () => {
    const a = buildTimelineSensorSnapshotViewModel({ temp_f: 70 });
    expect(a.kind === "chips" && a.chips.some((c) => c.metric === "soil_moisture")).toBe(
      false,
    );
    expect(a.kind === "chips" && a.chips.some((c) => c.metric === "co2")).toBe(false);

    const b = buildTimelineSensorSnapshotViewModel({
      temp_c: 24,
      soil_moisture: 42,
      co2_ppm: 850.6,
    });
    expect(b.kind).toBe("chips");
    if (b.kind !== "chips") return;
    expect(b.chips.find((c) => c.metric === "soil_moisture")?.display).toBe("42%");
    expect(b.chips.find((c) => c.metric === "co2")?.display).toBe("851 ppm");
    expect(b.chips.find((c) => c.metric === "temp_c")?.display).toBe("24°C");
  });

  it("omits non-finite sensor values", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: Number.NaN,
      humidity: Number.POSITIVE_INFINITY,
      vpd: "1.2",
      soil_moisture: null,
      co2: 600,
    });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((c) => c.metric)).toEqual(["co2"]);
  });

  it("returns invalid when object contains no usable values", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: "abc",
      humidity: null,
    });
    expect(vm.kind).toBe("invalid");
  });

  it("renders source label honestly for manual/csv/demo/stale/invalid", () => {
    const cases = [
      { source: "manual", expect: "Manual", live: false },
      { source: "csv", expect: "CSV", live: false },
      { source: "demo", expect: "Demo", live: false },
      { source: "stale", expect: "Stale", live: false },
      { source: "invalid", expect: "Invalid", live: false },
    ] as const;
    for (const c of cases) {
      const vm = buildTimelineSensorSnapshotViewModel({
        temp_f: 70,
        source: c.source,
      });
      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") continue;
      expect(vm.sourceLabel).toBe(c.expect);
      expect(vm.isLive).toBe(c.live);
    }
  });

  it("never promotes non-live sources to Live even with vendor lineage", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: 70,
      source: "manual",
      vendor: "ecowitt",
    });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.sourceLabel).toBe("Manual");
    expect(vm.isLive).toBe(false);
  });

  it("marks isLive only when source resolves to live", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: 70,
      source: "live",
    });
    expect(vm.kind === "chips" && vm.isLive).toBe(true);
  });

  it("unknown source resolves to null label, never Live", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: 70,
      source: "synced",
    });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.sourceLabel).toBeNull();
    expect(vm.isLive).toBe(false);
  });
});
