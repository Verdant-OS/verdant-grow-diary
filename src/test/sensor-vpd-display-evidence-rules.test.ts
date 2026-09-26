import { describe, expect, it } from "vitest";
import type { SensorReading } from "@/mock";
import {
  retainDisplayedVpdEvidence,
  selectSensorVpdDisplayEvidence,
} from "@/lib/sensorVpdDisplayEvidenceRules";

const reading: SensorReading = {
  tentId: "tent-a",
  source: "live",
  status: "usable",
  ts: "2026-09-24T12:00:00Z",
  capturedAt: "2026-09-24T12:00:00Z",
  temp: 25,
  rh: 55,
  vpd: 0,
  co2: 0,
  soil: 0,
  observedMetrics: ["temp", "rh"],
};

describe("Sensor Data cached derived VPD evidence", () => {
  it("selects usable inputs and preserves identity when they are unchanged", () => {
    const result = selectSensorVpdDisplayEvidence([reading], null);
    expect(result).toEqual({ reading, temperatureC: 25, humidityPct: 55 });
    expect(selectSensorVpdDisplayEvidence([reading], result)).toBe(result);
    expect(selectSensorVpdDisplayEvidence([{ ...reading }], result)).toBe(result);
  });

  it("retains the displayed estimate with current stale trust but never derives it on a fresh visit", () => {
    const previous = selectSensorVpdDisplayEvidence([reading], null);
    const stale: SensorReading = { ...reading, status: "stale" };
    expect(selectSensorVpdDisplayEvidence([stale], null)).toBeNull();
    const retained = selectSensorVpdDisplayEvidence([stale], previous);
    expect(retained).toEqual({ reading: stale, temperatureC: 25, humidityPct: 55 });
    expect(selectSensorVpdDisplayEvidence([stale], retained)).toBe(retained);
    expect(selectSensorVpdDisplayEvidence([{ ...stale }], retained)).toBe(retained);
    expect(previous?.reading.status).toBe("usable");
  });

  it.each(["invalid", "needs_review", "no_data"] as const)(
    "discards an estimate when its inputs become %s",
    (status) => {
      const previous = selectSensorVpdDisplayEvidence([reading], null);
      expect(selectSensorVpdDisplayEvidence([{ ...reading, status }], previous)).toBeNull();
    },
  );

  it.each([
    { tentId: "tent-b" },
    { capturedAt: "2026-09-24T12:01:00Z" },
    { source: "manual" as const },
    { temp: 26 },
    { rh: 56 },
    { observedMetrics: ["temp"] as SensorReading["observedMetrics"] },
  ])("discards stale inputs changed by a correction, new capture or scope: %j", (changes) => {
    const previous = selectSensorVpdDisplayEvidence([reading], null);
    expect(
      selectSensorVpdDisplayEvidence([{ ...reading, status: "stale", ...changes }], previous),
    ).toBeNull();
  });

  it("clears removed inputs and tolerates missing reads without mutation", () => {
    const previous = selectSensorVpdDisplayEvidence([reading], null);
    const before = structuredClone(previous);
    for (const rows of [[], null, undefined]) {
      expect(selectSensorVpdDisplayEvidence(rows, previous)).toBeNull();
    }
    expect(previous).toEqual(before);
  });

  it("prefers usable evidence over a retained stale estimate", () => {
    const previous = selectSensorVpdDisplayEvidence([reading], null);
    const fresh: SensorReading = { ...reading, source: "manual", temp: 24 };
    expect(
      selectSensorVpdDisplayEvidence([{ ...reading, status: "stale" }, fresh], previous)?.reading,
    ).toBe(fresh);
  });
});

describe("retainDisplayedVpdEvidence", () => {
  const evidence = { reading, temperatureC: 25, humidityPct: 55 };

  it("keeps the same evidence object while its derived estimate is displayed", () => {
    expect(retainDisplayedVpdEvidence(evidence, 1.27)).toBe(evidence);
    expect(retainDisplayedVpdEvidence(evidence, 0)).toBe(evidence);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    "remembers nothing when no derived estimate was displayed (%s)",
    (displayed) => {
      expect(retainDisplayedVpdEvidence(evidence, displayed)).toBeNull();
    },
  );

  it("remembers nothing without evidence and does not mutate its input", () => {
    const before = structuredClone(evidence);
    expect(retainDisplayedVpdEvidence(null, 1.27)).toBeNull();
    retainDisplayedVpdEvidence(evidence, null);
    expect(evidence).toEqual(before);
  });

  it("an observed-VPD visit leaves no cache, so a corrected-away value cannot derive from stale inputs", () => {
    const observed: SensorReading = {
      ...reading,
      vpd: 1.2,
      observedMetrics: ["temp", "rh", "vpd"],
    };
    const shown = selectSensorVpdDisplayEvidence([observed], null);
    expect(shown).not.toBeNull();
    const cache = retainDisplayedVpdEvidence(shown, null);
    expect(cache).toBeNull();
    const corrected: SensorReading = {
      ...observed,
      status: "stale",
      observedMetrics: ["temp", "rh"],
    };
    expect(selectSensorVpdDisplayEvidence([corrected], cache)).toBeNull();
  });
});
