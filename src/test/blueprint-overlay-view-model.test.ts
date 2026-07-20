/**
 * Tests for blueprintOverlayViewModel — the pure view-model that fuses the
 * three data sources (SensorSnapshot, feeding logs, DLI) into scored overlay
 * rows with provenance and missing-metric nudges.
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
    ...overrides,
  };
}

/** A fully in-band seedling reading from all three sources. */
function healthySeedling(): BuildBlueprintOverlayInput {
  const snapshot: BlueprintSnapshotInput = {
    source: "live",
    temp: 25, // band 24-26
    rh: 75, // band 70-80
    vpd: 0.6, // VPD_STAGE_TARGETS.seedling 0.4-0.8
    ppfd: 200, // band 100-250
  };
  return baseInput({
    stage: "seedling",
    snapshot,
    latestFeeding: { ec: 0.7, ph: 6.0 }, // ec 0.6-0.8, ph 5.8-6.2
    dli: null, // seedling has no DLI band anyway
  });
}

describe("buildBlueprintOverlayViewModel — stage", () => {
  it("labels a known stage and marks it known", () => {
    const vm = buildBlueprintOverlayViewModel(baseInput({ stage: "seedling" }));
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Seedling");
  });

  it("maps a legacy stage name through to its canonical label", () => {
    const vm = buildBlueprintOverlayViewModel(baseInput({ stage: "flower" }));
    expect(vm.stageKnown).toBe(true);
    expect(vm.stageLabel).toBe("Mid–late flower");
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
    // sums to the full metric set
    const { green, amber, red, missing } = vm.summary;
    expect(green + amber + red + missing).toBe(METRIC_ORDER.length);
  });
});

describe("buildBlueprintOverlayViewModel — provenance", () => {
  it("marks live temp/rh as live only when the snapshot source is live", () => {
    const live = buildBlueprintOverlayViewModel(healthySeedling());
    expect(live.rows.find((r) => r.metricKey === "tempC")?.provenance).toBe("live");
    expect(live.rows.find((r) => r.metricKey === "rh")?.provenance).toBe("live");

    const csv = buildBlueprintOverlayViewModel(
      baseInput({
        snapshot: { source: "csv", temp: 25, rh: 75, vpd: 0.6, ppfd: 200 },
      }),
    );
    expect(csv.rows.find((r) => r.metricKey === "tempC")?.provenance).toBe("manual");
    expect(csv.rows.find((r) => r.metricKey === "rh")?.provenance).toBe("manual");
  });

  it("marks vpd and dli as derived, ppfd/ec/ph as manual", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "early_veg", // has a DLI band
        snapshot: { source: "live", temp: 25, rh: 67, vpd: 0.9, ppfd: 500 },
        latestFeeding: { ec: 1.1, ph: 5.85 },
        dli: 25,
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
    // a present value carries no nudge
    const healthy = buildBlueprintOverlayViewModel(healthySeedling());
    const temp = healthy.rows.find((r) => r.metricKey === "tempC");
    expect(temp?.provenance).toBe("live");
    expect(temp?.nudge).toBeUndefined();
  });
});

describe("buildBlueprintOverlayViewModel — scoring & summary", () => {
  it("counts amber and red excursions", () => {
    const vm = buildBlueprintOverlayViewModel(
      baseInput({
        stage: "seedling",
        // temp 27 vs band 24-26 (width 2, margin 0.3) → out_high (red)
        // rh 81 vs band 70-80 (width 10, margin 1.5) → warn_high (amber)
        snapshot: { source: "live", temp: 27, rh: 81, vpd: 0.6, ppfd: 200 },
        latestFeeding: { ec: 0.7, ph: 6.0 },
      }),
    );
    const byKey = Object.fromEntries(vm.rows.map((r) => [r.metricKey, r.result.classification]));
    expect(byKey.tempC).toBe("out_high");
    expect(byKey.rh).toBe("warn_high");
    expect(vm.summary.red).toBe(1);
    expect(vm.summary.amber).toBe(1);
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
    // values are still surfaced even though they cannot be scored
    expect(vm.rows.find((r) => r.metricKey === "tempC")?.value).toBe(25);
    for (const row of vm.rows) {
      expect(row.result.classification).toBe("stage_unknown");
    }
  });

  it("threads warnMargin through to the evaluator", () => {
    const input = baseInput({
      stage: "seedling",
      // ec 0.5 vs band 0.6-0.8 (width 0.2): default margin 0.03 → out_low (red)
      latestFeeding: { ec: 0.5, ph: 6.0 },
    });
    const strict = buildBlueprintOverlayViewModel(input);
    expect(strict.rows.find((r) => r.metricKey === "ec")?.result.classification).toBe("out_low");
    // wide margin (1.0 → 0.2) pulls 0.5 into the amber zone
    const lenient = buildBlueprintOverlayViewModel({ ...input, warnMargin: 1.0 });
    expect(lenient.rows.find((r) => r.metricKey === "ec")?.result.classification).toBe("warn_low");
  });
});
