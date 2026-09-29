import { describe, it, expect } from "vitest";
import {
  buildTimelineCardSensorSnapshotViewModel,
  buildTimelineSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
  resolveTimelineCardVpdStageValue,
} from "@/lib/timelineSensorSnapshotViewModel";

describe("persisted Timeline card metric validation", () => {
  const sources = ["csv", "demo", "stale", "invalid", "live"] as const;

  it.each(sources)(
    "rejects implausible %s metrics while retaining the valid survivor",
    (source) => {
      const result = buildTimelineCardSensorSnapshotViewModel({
        sensor_snapshot: {
          source,
          temp_f: 76,
          rh: 150,
          soil: 101,
          vpd: 20,
          co2: 10001,
          ph: 15,
          ec: 1000,
        },
      });
      expect(result.sensorViewModel.kind).toBe("chips");
      if (result.sensorViewModel.kind !== "chips") return;
      expect(result.sensorViewModel.chips.map((chip) => chip.display)).toEqual(["76°F"]);
      expect(result.sensorViewModel.errors.length).toBeGreaterThan(0);
      expect(result.reviewMessage).toBe(
        "Review sensor snapshot — invalid readings were not shown.",
      );
    },
  );

  it.each(sources)("retains valid %s boundaries and legacy numeric precision", (source) => {
    const { sensorViewModel } = buildTimelineCardSensorSnapshotViewModel({
      sensor: { source, temp: 27.78, rh: 55.55, soil: 42.42, vpd: 1.234, co2: 850.6 },
    });
    expect(sensorViewModel.kind).toBe("chips");
    if (sensorViewModel.kind !== "chips") return;
    expect(sensorViewModel.chips.map((chip) => chip.display)).toEqual([
      "82.0°F",
      "55.55%",
      "1.234 kPa",
      "42.42%",
      "850.6 ppm",
    ]);
    expect(sensorViewModel.errors).toEqual([]);
  });

  it.each([0.2, 3])("retains the canonical VPD boundary %s for every source", (vpd) => {
    for (const source of sources) {
      const { sensorViewModel } = buildTimelineCardSensorSnapshotViewModel({
        sensor_snapshot: { source, vpd },
      });
      expect(sensorViewModel.kind).toBe("chips");
      if (sensorViewModel.kind !== "chips") continue;
      expect(sensorViewModel.chips.map((chip) => chip.value)).toEqual([vpd]);
      expect(sensorViewModel.errors).toEqual([]);
    }
  });

  it.each([0, 10000])("retains the canonical CO2 boundary %s for every source", (co2) => {
    for (const source of sources) {
      const { sensorViewModel } = buildTimelineCardSensorSnapshotViewModel({
        sensor: { source, co2 },
      });
      expect(sensorViewModel.kind).toBe("chips");
      if (sensorViewModel.kind !== "chips") continue;
      expect(sensorViewModel.chips.map((chip) => chip.value)).toEqual([co2]);
      expect(sensorViewModel.errors).toEqual([]);
    }
  });

  it.each(sources)("retains %s history when every reading is invalid", (source) => {
    const result = buildTimelineCardSensorSnapshotViewModel({
      sensor_snapshot: { source, temp_f: 115, rh: 150, soil: 101, vpd: 20, co2: 10001 },
    });
    expect(result.sensor).toBeDefined();
    expect(result.sensorViewModel.kind).toBe("invalid");
    expect(result.reviewMessage).toContain("Review sensor snapshot");
  });

  it.each([0, 100])("discloses pinned humidity %s without calling it healthy", (rh) => {
    const result = buildTimelineCardSensorSnapshotViewModel({ sensor: { source: "csv", rh } });
    expect(result.sensorViewModel.kind).toBe("chips");
    if (result.sensorViewModel.kind !== "chips") return;
    expect(
      result.sensorViewModel.warnings.some((warning) => warning.includes("stuck sensor")),
    ).toBe(true);
    expect(result.warningMessage).toBe("Check sensor snapshot — a reading may need confirmation.");
  });

  it.each([null, undefined, {}, { sensor_snapshot: { source: "csv" } }])(
    "is null-safe and does not accuse empty envelopes of invalid readings: %j",
    (details) => {
      expect(buildTimelineCardSensorSnapshotViewModel(details).sensorViewModel).toEqual({
        kind: "none",
      });
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, "150"])(
    "never renders non-numeric or non-finite persisted readings: %s",
    (value) => {
      const { sensorViewModel } = buildTimelineCardSensorSnapshotViewModel({
        sensor: { source: "csv", temp_f: 76, rh: value, soil: value, vpd: value, co2: value },
      });
      expect(sensorViewModel.kind).toBe("chips");
      if (sensorViewModel.kind !== "chips") return;
      expect(sensorViewModel.chips.map((chip) => chip.display)).toEqual(["76°F"]);
    },
  );

  it("preserves envelope precedence, inputs, deterministic output and manual copy", () => {
    const sensor_snapshot = Object.freeze({ source: "manual", temp_f: 76, rh: 150 });
    const details = Object.freeze({
      sensor_snapshot,
      sensor: Object.freeze({ source: "csv", rh: 55 }),
    });
    const before = JSON.stringify(details);
    const a = buildTimelineCardSensorSnapshotViewModel(details);
    expect(a).toEqual(buildTimelineCardSensorSnapshotViewModel(details));
    expect(a.sensor).toBe(sensor_snapshot);
    expect(a.reviewMessage).toBe("Review manual snapshot — invalid readings were not shown.");
    expect(a.warningMessage).toBe("Check manual snapshot — a reading may need confirmation.");
    expect(JSON.stringify(details)).toBe(before);
  });

  it.each(["vpd_kpa", "vpdKpa"])(
    "assesses a non-manual alias only with its rendered chip: %s",
    (key) => {
      const result = buildTimelineCardSensorSnapshotViewModel({
        sensor: { source: "csv", [key]: 1.2 },
      });
      const evidence = { ...result, canAssessStage: true, hasFutureTimestamp: false };
      expect(resolveTimelineCardVpdStageValue(evidence)).toBe(1.2);
      expect(resolveTimelineCardVpdStageValue({ ...evidence, sensorViewModel: null })).toBeNull();
      expect(resolveTimelineCardVpdStageValue({ ...evidence, canAssessStage: false })).toBeNull();
      expect(
        resolveTimelineCardVpdStageValue({ ...evidence, hasFutureTimestamp: true }),
      ).toBeNull();
    },
  );
});

describe("buildTimelineSensorSnapshotViewModel", () => {
  it("returns none for null/undefined", () => {
    expect(buildTimelineSensorSnapshotViewModel(null).kind).toBe("none");
    expect(buildTimelineSensorSnapshotViewModel(undefined).kind).toBe("none");
  });

  describe("resolveTimelineCardSensorResolution", () => {
    it("keeps canonical precedence while enabling manual validation for manual sources", () => {
      const resolved = resolveTimelineCardSensorResolution({
        source: "manual",
        sensor_snapshot: { temp_c: 24, source: "manual" },
        sensor: { temp: 10, source: "live" },
        manual_sensor_snapshot: { temp_f: 100, source: "manual" },
      });
      expect(resolved.sensor).toEqual({ temp_c: 24, source: "manual" });
      expect(resolved.useManualValidation).toBe(true);
    });

    it("uses manual validation for manual compatibility envelopes even when source is missing", () => {
      const resolved = resolveTimelineCardSensorResolution({
        manual_sensor_snapshot: { temp_f: 82 },
      });
      expect(resolved.sensor).toEqual({ temp_f: 82 });
      expect(resolved.useManualValidation).toBe(true);
    });

    it("does not enable manual validation for non-manual snapshots", () => {
      const resolved = resolveTimelineCardSensorResolution({
        sensor_snapshot: { temp: 24, source: "live" },
        source: "live",
      });
      expect(resolved.sensor).toEqual({ temp: 24, source: "live" });
      expect(resolved.useManualValidation).toBe(false);
    });

    it.each([
      [{ sensor_snapshot: { rh: 150, source: "manual" }, source: "manual" }, true],
      [{ sensor_snapshot: { soil: 150, source: "manual" }, source: "manual" }, true],
      [{ sensor_snapshot: { rh: 55, source: "manual" }, source: "manual" }, true],
    ])("enables manual validation for canonical manual rh/soil keys", (details, expected) => {
      const resolved = resolveTimelineCardSensorResolution(details);
      expect(resolved.useManualValidation).toBe(expected);
    });

    it("validates legacy generic temp/rh/soil snapshots like their manual badge", () => {
      const resolved = resolveTimelineCardSensorResolution({
        sensor_snapshot: { temp: 27.8, rh: 55, soil: 42, source: "manual" },
        source: "manual",
      });
      expect(resolved.useManualValidation).toBe(true);
    });
    it.each([undefined, "manual", "user", "entry", "log", " MANUAL "])(
      "uses badge source normalization for legacy source %s",
      (source) => {
        const resolved = resolveTimelineCardSensorResolution({ sensor: { source, rh: 150 } });
        expect(resolved.useManualValidation).toBe(true);
      },
    );
    it.each([null, undefined])("resolves an absent envelope %s without throwing", (details) => {
      expect(resolveTimelineCardSensorResolution(details)).toEqual({
        sensor: undefined,
        useManualValidation: false,
      });
    });
  });

  it.each([0.19, 3.01, 20, -1])(
    "hides out-of-range manual VPD %s kPa with review evidence",
    (vpd) => {
      const vm = buildTimelineSensorSnapshotViewModel(
        { temp_f: 76, rh: 55, vpd },
        { validateManualCompatibility: true },
      );
      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") return;
      expect(vm.chips.map((chip) => chip.metric)).toEqual(["temp_f", "rh"]);
      expect(vm.errors.some((error) => error.includes("VPD"))).toBe(true);
    },
  );

  it.each([0.2, 3])("keeps the valid manual VPD boundary %s kPa", (vpd) => {
    const vm = buildTimelineSensorSnapshotViewModel({ vpd }, { validateManualCompatibility: true });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips[0]?.value).toBe(vpd);
    expect(vm.errors).toEqual([]);
  });

  it.each([-1, 10001])("hides implausible manual CO2 %s ppm with review evidence", (co2) => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { rh: 55, co2 },
      { validateManualCompatibility: true },
    );
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.metric)).toEqual(["rh"]);
    expect(vm.errors.some((error) => error.includes("CO₂"))).toBe(true);
  });

  it.each([0, 10000])("keeps the canonical plausible CO2 boundary %s ppm", (co2) => {
    const vm = buildTimelineSensorSnapshotViewModel({ co2 }, { validateManualCompatibility: true });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips[0]?.value).toBe(co2);
    expect(vm.errors).toEqual([]);
  });

  it("validates known legacy Celsius without changing existing display precision", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { temp: 27.78, rh: 55, vpd: 1.234, co2: 850.6 },
      { validateManualCompatibility: true, genericTempUnit: "C" },
    );
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.display)).toEqual([
      "82.0°F",
      "55%",
      "1.234 kPa",
      "850.6 ppm",
    ]);
  });

  it("does not infer a generic temperature unit while still validating other metrics", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { temp: 24, rh: 55, soil: 101 },
      { validateManualCompatibility: true },
    );
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.metric)).toEqual(["rh"]);
    expect(vm.errors).toContain("Soil moisture must be between 0% and 100%.");
    expect(vm.warnings).toContain(
      "Temperature unit unverified; the generic temperature was not shown.",
    );
  });

  it.each([{}, { source: "manual", ts: "2026-09-28T00:00:00Z" }, { temp_f: null, rh: undefined }])(
    "does not produce invalid-readings copy for an empty envelope %j",
    (snapshot) => {
      expect(
        buildTimelineSensorSnapshotViewModel(snapshot, { validateManualCompatibility: true }),
      ).toEqual({ kind: "none" });
    },
  );

  describe("stage-hint evidence fence", () => {
    const sensor = Object.freeze({ vpd: 1.2, temp_f: 76, rh: 55 });
    const eligible = {
      sensor,
      useManualValidation: true,
      sensorViewModel: buildTimelineSensorSnapshotViewModel(sensor, {
        validateManualCompatibility: true,
      }),
      canAssessStage: true,
      hasFutureTimestamp: false,
    };
    it("is deterministic and does not mutate eligible inputs", () => {
      const before = JSON.stringify(eligible);
      expect(resolveTimelineCardVpdStageValue(eligible)).toBe(1.2);
      expect(resolveTimelineCardVpdStageValue(eligible)).toBe(1.2);
      expect(JSON.stringify(eligible)).toBe(before);
    });
    it.each([null, undefined])("fails closed for missing inputs %s", (input) => {
      expect(resolveTimelineCardVpdStageValue(input)).toBeNull();
    });
    it.each([
      { canAssessStage: false },
      { hasFutureTimestamp: true },
      { sensor: null },
      { sensorViewModel: { kind: "none" } as const },
      {
        sensorViewModel: buildTimelineSensorSnapshotViewModel(
          { rh: 55 },
          { validateManualCompatibility: true },
        ),
      },
      { sensor: { vpd: 20 } },
      { sensor: { vpd: 0.199 } },
    ])("rejects inadmissible stage evidence %j", (override) => {
      expect(resolveTimelineCardVpdStageValue({ ...eligible, ...override })).toBeNull();
    });
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

  it("maps Plant Quick Log manual snapshot fields without promoting them to live", () => {
    const vm = buildTimelineSensorSnapshotViewModel({
      temp_f: 82,
      humidity_percent: 48,
      ph: 6.2,
      ec: 1.65,
      source: "manual",
    });

    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.display)).toEqual(["82°F", "48%", "6.2 pH", "1.65 mS/cm"]);
    expect(vm.sourceLabel).toBe("Manual");
    expect(vm.isLive).toBe(false);
  });

  it("keeps the exact legacy soil alias visible", () => {
    const vm = buildTimelineSensorSnapshotViewModel({ temp_f: 70, soil: 42 });

    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.display)).toEqual(["70°F", "42%"]);
  });

  it("fails impossible Plant Quick Log manual values closed", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { humidity_percent: 150, ph: 99, ec: -2, source: "manual" },
      { validateManualCompatibility: true },
    );

    expect(vm.kind).toBe("invalid");
    if (vm.kind !== "invalid") return;
    expect(vm.message).toMatch(/review/i);
    expect(vm.errors).toEqual([
      "Humidity must be between 0% and 100%.",
      "Reservoir EC cannot be negative.",
      "Reservoir pH must be between 0 and 14.",
    ]);
  });

  it("carries realistic-range warnings with otherwise visible manual values", () => {
    const vm = buildTimelineSensorSnapshotViewModel(
      { ph: 4.2, source: "manual" },
      { validateManualCompatibility: true },
    );

    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    expect(vm.chips.map((chip) => chip.display)).toEqual(["4.2 pH"]);
    expect(vm.errors).toEqual([]);
    expect(vm.warnings).toHaveLength(1);
    expect(vm.warnings[0]).toMatch(/outside the realistic/i);
  });

  it.each([0, 100])(
    "flags stuck manual humidity at %s%% without hiding the reading",
    (humidity) => {
      const vm = buildTimelineSensorSnapshotViewModel(
        { humidity_percent: humidity, source: "manual" },
        { validateManualCompatibility: true },
      );

      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") return;
      expect(vm.chips.map((chip) => chip.display)).toEqual([`${humidity}%`]);
      expect(vm.errors).toEqual([]);
      expect(vm.warnings).toEqual([
        `Humidity ${humidity}% may indicate a stuck sensor; review before trusting.`,
      ]);
    },
  );

  it("uses the canonical 40–110°F presentation band for manual temperature", () => {
    for (const temperature of [40, 110]) {
      const vm = buildTimelineSensorSnapshotViewModel(
        { temp_f: temperature, source: "manual" },
        { validateManualCompatibility: true },
      );
      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") continue;
      expect(vm.chips.map((chip) => chip.display)).toEqual([`${temperature}°F`]);
      expect(vm.errors).toEqual([]);
    }

    for (const temperature of [39.9, 110.1, 500]) {
      const vm = buildTimelineSensorSnapshotViewModel(
        { temp_f: temperature, humidity_percent: 48, source: "manual" },
        { validateManualCompatibility: true },
      );
      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") continue;
      expect(vm.chips.map((chip) => chip.display)).toEqual(["48%"]);
      expect(vm.errors).toEqual([
        "Air temperature is outside the realistic 40–110°F grow-room range.",
      ]);
    }
  });

  it("suppresses EC at the canonical 20 mS/cm unit-mismatch threshold", () => {
    const belowThreshold = buildTimelineSensorSnapshotViewModel(
      { ec: 19.99, source: "manual" },
      { validateManualCompatibility: true },
    );
    expect(belowThreshold.kind).toBe("chips");
    if (belowThreshold.kind === "chips") {
      expect(belowThreshold.chips.map((chip) => chip.display)).toEqual(["19.99 mS/cm"]);
      expect(belowThreshold.errors).toEqual([]);
    }

    for (const ec of [20, 25]) {
      const vm = buildTimelineSensorSnapshotViewModel(
        { ec, humidity_percent: 48, source: "manual" },
        { validateManualCompatibility: true },
      );
      expect(vm.kind).toBe("chips");
      if (vm.kind !== "chips") continue;
      expect(vm.chips.map((chip) => chip.display)).toEqual(["48%"]);
      expect(vm.errors).toEqual([
        "EC may use µS/cm while labeled mS/cm; the suspicious value was not shown.",
      ]);
    }
  });

  it("renders soil moisture and CO2 only when present", () => {
    const a = buildTimelineSensorSnapshotViewModel({ temp_f: 70 });
    expect(a.kind === "chips" && a.chips.some((c) => c.metric === "soil_moisture")).toBe(false);
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
    expect(b.chips.find((c) => c.metric === "temp_f")?.display).toBe("75.2°F");
  });

  it("does not double-convert explicit Fahrenheit values", () => {
    const vm = buildTimelineSensorSnapshotViewModel({ temp_f: 75.2, temp_c: 24 });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    const temp = vm.chips.find((c) => c.label === "Temp");
    expect(temp?.metric).toBe("temp_f");
    expect(temp?.display).toBe("75.2°F");
  });

  it("can preserve explicit Celsius when the caller requests Celsius", () => {
    const vm = buildTimelineSensorSnapshotViewModel({ temp_c: 24 }, { preferUnit: "C" });
    expect(vm.kind).toBe("chips");
    if (vm.kind !== "chips") return;
    const temp = vm.chips.find((c) => c.label === "Temp");
    expect(temp?.metric).toBe("temp_c");
    expect(temp?.display).toBe("24°C");
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
