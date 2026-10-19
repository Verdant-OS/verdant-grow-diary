import { describe, expect, it } from "vitest";
import type { SensorReading } from "@/mock";
import {
  buildSharedVpdStabilityInputs,
  mergeVpdStabilityInputs,
  quickLogManualsForTent,
  vpdStabilityInputsFromWideReadings,
} from "@/lib/vpdStabilityInputRules";
import { mergeSensorsSeriesWithQuickLogManuals } from "@/lib/sensorsQuickLogManualSeriesRules";

function reading(overrides: Partial<SensorReading>): SensorReading {
  return {
    ts: "2026-10-15T12:00:00.000Z",
    tentId: "tent-1",
    temp: 24,
    rh: 55,
    vpd: 1.2,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh", "vpd"],
    source: "manual",
    status: "usable",
    capturedAt: "2026-10-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("vpdStabilityInputsFromWideReadings", () => {
  it("keeps observed manual VPD and skips rows that never observed VPD", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({}),
      reading({
        ts: "2026-10-15T11:00:00.000Z",
        capturedAt: "2026-10-15T11:00:00.000Z",
        vpd: 0,
        observedMetrics: ["temp", "rh"],
      }),
    ]);
    expect(inputs).toEqual([
      {
        ts: "2026-10-15T12:00:00.000Z",
        vpd: 1.2,
        source: "manual",
        stale: false,
      },
    ]);
  });

  it("drops invalid VPD", () => {
    expect(
      vpdStabilityInputsFromWideReadings([reading({ source: "invalid", status: "invalid" })]),
    ).toEqual([]);
  });
});

describe("mergeVpdStabilityInputs", () => {
  it("adds manual VPD timestamps the stored series does not have", () => {
    const merged = mergeVpdStabilityInputs(
      [],
      [
        {
          ts: "2026-10-15T12:00:00.000Z",
          vpd: 1.4,
          source: "manual",
          stale: false,
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.vpd).toBe(1.4);
  });

  it("lets the manual value win at the same timestamp", () => {
    const merged = mergeVpdStabilityInputs(
      [{ ts: "2026-10-15T12:00:00.000Z", vpd: 0.4, source: "manual" }],
      [{ ts: "2026-10-15T12:00:00.000Z", vpd: 1.4, source: "manual" }],
    );
    expect(merged).toEqual([{ ts: "2026-10-15T12:00:00.000Z", vpd: 1.4, source: "manual" }]);
  });
});

// Repair of #2148 review findings (Codex P1 4288338449, Copilot 4286153360,
// Copilot 4286153508 / CodeRabbit 4288347197).
describe("vpdStabilityInputsFromWideReadings keeps history and applies sensor truth", () => {
  it("keeps an older live reading whose cached status is only time-stale", () => {
    // groupSensorReadingRows marks a live row older than 15 minutes `stale`
    // from capture time alone; its persisted floor stays null.
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({
        source: "live",
        status: "stale",
        freshness: { floor: null, timeSources: ["live"] },
        ts: "2026-10-15T06:00:00.000Z",
        capturedAt: "2026-10-15T06:00:00.000Z",
      }),
    ]);
    expect(inputs).toEqual([
      { ts: "2026-10-15T06:00:00.000Z", vpd: 1.2, source: "live", stale: false },
    ]);
  });

  it("keeps an older Quick Log manual reading whose status is time-stale", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({
        source: "manual",
        status: "stale",
        ts: "2026-10-13T12:00:00.000Z",
        capturedAt: "2026-10-13T12:00:00.000Z",
      }),
    ]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.stale).toBe(false);
  });

  it("still marks stale lineage stale (persisted floor or stale source)", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({
        source: "live",
        status: "stale",
        freshness: { floor: "stale", timeSources: [] },
      }),
      reading({
        source: "stale",
        status: "stale",
        ts: "2026-10-15T11:00:00.000Z",
        capturedAt: "2026-10-15T11:00:00.000Z",
      }),
    ]);
    expect(inputs.map((row) => row.stale)).toEqual([true, true]);
  });

  it("drops VPD when an observed RH or temperature fails realism", () => {
    expect(vpdStabilityInputsFromWideReadings([reading({ source: "live", rh: 150 })])).toEqual([]);
    expect(vpdStabilityInputsFromWideReadings([reading({ source: "live", temp: 95 })])).toEqual([]);
  });

  it("drops an unrealistic VPD value", () => {
    expect(vpdStabilityInputsFromWideReadings([reading({ vpd: 9 })])).toEqual([]);
  });

  it("keeps VPD when temperature and RH were simply not observed", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({ temp: 0, rh: 0, observedMetrics: ["vpd"] }),
    ]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.vpd).toBe(1.2);
  });

  it("orders mixed timestamp spellings by time, newest first", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({ ts: "2026-10-15T12:00:00Z", capturedAt: "2026-10-15T12:00:00Z", vpd: 1.0 }),
      // 13:00 at +02:00 is 11:00Z, older than 12:00Z.
      reading({
        ts: "2026-10-15T13:00:00+02:00",
        capturedAt: "2026-10-15T13:00:00+02:00",
        vpd: 1.1,
      }),
    ]);
    expect(inputs.map((row) => row.vpd)).toEqual([1.0, 1.1]);
  });
});

describe("mergeVpdStabilityInputs matches observations by instant", () => {
  it("lets the manual value replace a stored row at the same instant in another spelling", () => {
    const merged = mergeVpdStabilityInputs(
      [{ ts: "2026-10-15T12:00:00Z", vpd: 0.4, source: "live" }],
      [{ ts: "2026-10-15T12:00:00.000+00:00", vpd: 1.4, source: "manual" }],
    );
    expect(merged).toEqual([{ ts: "2026-10-15T12:00:00.000+00:00", vpd: 1.4, source: "manual" }]);
  });

  it("sorts merged rows numerically by instant", () => {
    const merged = mergeVpdStabilityInputs(
      [
        { ts: "2026-10-15T13:00:00+02:00", vpd: 1.1, source: "live" },
        { ts: Date.parse("2026-10-15T11:30:00Z"), vpd: 1.2, source: "live" },
      ],
      [{ ts: "2026-10-15T12:00:00Z", vpd: 1.0, source: "manual" }],
    );
    expect(merged.map((row) => row.vpd)).toEqual([1.0, 1.2, 1.1]);
  });
});

describe("buildSharedVpdStabilityInputs (Codex P2 at 1936029e)", () => {
  const at = "2026-10-15T12:00:00.000Z";
  const storedStale = reading({
    source: "live",
    vpd: 1.0,
    temp: 80,
    freshness: { floor: "stale" } as SensorReading["freshness"],
  });
  const manual = reading({ vpd: 1.3, observedMetrics: ["vpd"], capturedAt: at, ts: at });

  it("keeps a colliding manual VPD that the stored row's stale floor or invalid sibling would taint", () => {
    // The old path merged the manual into the stored object first, so it
    // inherited freshness.floor "stale" (and the invalid stored temperature).
    const inherited = vpdStabilityInputsFromWideReadings(
      mergeSensorsSeriesWithQuickLogManuals([storedStale], [manual]),
    );
    expect(inherited.some((r) => r.vpd === 1.3 && r.stale !== true)).toBe(false);
    expect(buildSharedVpdStabilityInputs([storedStale], [manual])).toEqual([
      { ts: at, vpd: 1.3, source: "manual", stale: false },
    ]);
  });
});

describe("quickLogManualsForTent (Codex P1 at 1936029e)", () => {
  it("partitions a multi-tent manual read by tent", () => {
    const a = reading({ tentId: "tent-a", vpd: 1.1 });
    const b = reading({ tentId: "tent-b", vpd: 2.4 });
    expect(quickLogManualsForTent([a, b], "tent-b")).toEqual([b]);
    expect(quickLogManualsForTent(null, "tent-b")).toEqual([]);
  });
});
