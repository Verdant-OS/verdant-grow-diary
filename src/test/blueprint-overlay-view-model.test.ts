/**
 * Tests for blueprintOverlayViewModel — the pure view-model that fuses the
 * three data sources (SensorSnapshot, feeding logs, DLI) plus the tent light
 * state into scored overlay rows with provenance and missing-metric nudges.
 */
import { describe, it, expect } from "vitest";

import {
  buildBlueprintOverlayViewModel,
  type BlueprintSnapshotInput,
  type BuildBlueprintOverlayInput,
} from "@/lib/blueprintOverlayViewModel";

const METRIC_ORDER = ["vpdKpa", "tempC", "rh", "ppfd", "dli", "ec", "ph"] as const;

function baseInput(
  overrides: Partial<BuildBlueprintOverlayInput> = {},
): BuildBlueprintOverlayInput {
  return {
    stage: "seedling",
    snapshot: null,
    latestFeeding: null,
    dli: null,
    isDay: true,
    ...overrides,
  };
}

/** A fully in-band seedling reading (lights on) from all three sources. */
function healthySeedling(): BuildBlueprintOverlayInput {
  const snapshot: BlueprintSnapshotInput = {
    source: "live",
    temp: 25, // seedling day band 24-26
    rh: 75, // 70-80
    vpd: 0.6, // seedling VPD 0.4-0.8
    ppfd: 200, // 100-250
  };
  return baseInput({
    stage: "seedling",
    snapshot,
    latestFeeding: { ec: 0.7, ph: 6.0 }, // ec 0.6-0.8, ph 5.8-6.2
    dli: null, // seedling has no DLI band
    isDay: true,
  });
}

describe("buildBlueprintOverlayViewModel — stage", () => {
  it("labels a known stage and marks it known", () => {
    const vm = buildBlueprintOverlayViewModel(baseInput({ stage: "seedling" }));
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Seedling");
  });

  it("labels the real drying/curing stages as 'Dry & cure'", () => {
    for (const stage of ["harvest", "cure"]) {
      const vm = buildBlueprintOverlayViewModel(baseInput({ stage }));
      expect(vm.stageKnown).toBe(true);
      expect(vm.stageLabel).toBe("Dry & cure");
    }
  });

  it("labels flush as late flower", () => {
    expect(buildBlueprintOverlayViewModel(baseInput({ stage: "flush" })).stageLabel).toBe(
      "Late flower / flush",
    );
  });

  it("falls back to 'Stage not set' and marks unknown for a bad stage", () => {
    for (const stage of ["banana", "", null, undefined]) {
      const vm = buildBlueprintOverlayViewModel(baseInput({ stage }));
      expect(vm.stageKnown).toBe(false);
      expect(vm.stageLabel).toBe("Stage not set");
    }
  });
});

describe("buildBlueprintOverlayViewModel — rows", () => {
  it("always returns all seven metrics in the defined order", () => {
    const vm = buildBlueprintOverlayViewModel(baseInput());
    expect(vm.rows.map((r) => r.metricKey)).toEqual([...METRIC_ORDER]);
  });

  it("pulls each value from its correct source", () => {
    const vm = buildBlueprintOverlayViewModel(healthySeedling());
    const byKey = Object.fromEntries(vm.rows.map((r) => [r.metricKey, r.value]));
    expect(byKey.vpdKpa).toBe(0.6);
    expect(byKey.tempC).toBe(25);
    expect(byKey.rh).toBe(75);
    expect(byKey.ppfd).toBe(200);
    expect(byKey.ec).toBe(0.7);
    expect(byKey.ph).toBe(6.0);
    expect(byKey.dli).toBeNull();
  });

  it("scores an all-in-band reading green (6 green, dli missing)", () => {
    const vm = buildBlueprintOverlayViewModel(healthySeedling());
    expect(vm.summary).toEqual({ green: 6, amber: 0, red: 0, missing: 1 });
    const { green, amber, red, missing } = vm.summary;
    expect(green + amber + red + missing).toBe(METRIC_ORDER.length);
  });

  it("annotates the temperature row with day/night context", () => {
    const day = buildBlueprintOverlayViewModel(healthySeedling());
    expect(day.isDay).toBe(true);
    expect(day.rows.find((r) => r.metricKey === "tempC")?.context).toMatch(/Day target/);
    const night = buildBlueprintOverlayViewModel({ ...healthySeedling(), isDay: false });
    expect(night.rows.find((r) => r.metricKey === "tempC")?.context).toMatch(/Night target/);
  });
});

describe("buildBlueprintOverlayViewModel — provenance", () => {
  it("marks live temp/rh as live only when the snapshot source is live", () => {
    const live = buildBlueprintOverlayViewModel(healthySeedling());
    expect(live.rows.find((r) => r.metricKey === "tempC")?.provenance).toBe("live");
    const csv = buildBlueprintOverlayViewModel(
      baseInput({ snapshot: { source: "csv", temp: 25, rh: 75, vpd: 0.6, ppfd: 200 } }),
    );
    expect(csv.rows.find((r) => r.metricKey === "tempC")?.provenance).toBe("manual");
  });

  it("marks vpd and dli as derived, ppfd/ec/ph as manual", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "veg",
        snapshot: { source: "live", temp: 25, rh: 67, vpd: 1.0, ppfd: 500 },
        latestFeeding: { ec: 1.2, ph: 5.85 },
        dli: 30,
      }),
    );
    const prov = Object.fromEntries(vm.rows.map((r) => [r.metricKey, r.provenance]));
    expect(prov.vpdKpa).toBe("derived");
    expect(prov.dli).toBe("derived");
    expect(prov.ppfd).toBe("manual");
    expect(prov.ec).toBe("manual");
    expect(prov.ph).toBe("manual");
  });

  it("marks absent values missing and attaches a nudge (only there)", () => {
    const vm = buildBlueprintOverlayViewModel(baseInput()); // everything null
    for (const row of vm.rows) {
      expect(row.provenance).toBe("missing");
      expect(row.nudge).toBeTruthy();
    }
    const healthy = buildBlueprintOverlayViewModel(healthySeedling());
    expect(healthy.rows.find((r) => r.metricKey === "tempC")?.nudge).toBeUndefined();
  });
});

describe("buildBlueprintOverlayViewModel — scoring & summary", () => {
  it("counts amber and red excursions", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "seedling",
        // temp 28 vs day band 24-26 (width 2, margin 0.3) → out_high (red)
        // rh 81 vs band 70-80 (width 10, margin 1.5) → warn_high (amber)
        snapshot: { source: "live", temp: 28, rh: 81, vpd: 0.6, ppfd: 200 },
        latestFeeding: { ec: 0.7, ph: 6.0 },
        isDay: true,
      }),
    );
    const byKey = Object.fromEntries(vm.rows.map((r) => [r.metricKey, r.result.classification]));
    expect(byKey.tempC).toBe("out_high");
    expect(byKey.rh).toBe("warn_high");
    expect(vm.summary.red).toBe(1);
    expect(vm.summary.amber).toBe(1);
  });

  it("scores drying plants against dry-room targets, not stage_unknown", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "cure",
        snapshot: { source: "live", temp: 16, rh: 60, vpd: 1.0, ppfd: null },
        isDay: false,
      }),
    );
    expect(vm.stageKnown).toBe(true);
    const byKey = Object.fromEntries(vm.rows.map((r) => [r.metricKey, r.result.classification]));
    expect(byKey.tempC).toBe("in_band"); // 16 in dry band 15-16
    expect(byKey.rh).toBe("in_band"); // 60 in 58-62
    expect(byKey.vpdKpa).toBe("no_target"); // context-only post-harvest
  });

  it("counts everything as missing when the stage is unknown", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "banana",
        snapshot: { source: "live", temp: 25, rh: 75, vpd: 0.6, ppfd: 200 },
        latestFeeding: { ec: 0.7, ph: 6.0 },
        dli: 30,
      }),
    );
    expect(vm.stageKnown).toBe(false);
    expect(vm.summary.missing).toBe(METRIC_ORDER.length);
    expect(vm.rows.find((r) => r.metricKey === "tempC")?.value).toBe(25);
    for (const row of vm.rows) expect(row.result.classification).toBe("stage_unknown");
  });

  it("threads warnMargin through to the evaluator", () => {
    const input = baseInput({
      stage: "seedling",
      latestFeeding: { ec: 0.5, ph: 6.0 }, // ec 0.6-0.8 (width 0.2, margin 0.03) → out_low
    });
    expect(
      buildBlueprintOverlayViewModel(input).rows.find((r) => r.metricKey === "ec")?.result
        .classification,
    ).toBe("out_low");
    expect(
      buildBlueprintOverlayViewModel({ ...input, warnMargin: 1.0 }).rows.find(
        (r) => r.metricKey === "ec",
      )?.result.classification,
    ).toBe("warn_low");
  });
});
