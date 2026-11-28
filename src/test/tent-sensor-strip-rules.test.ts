import { describe, expect, it } from "vitest";
import {
  TENT_SENSOR_STRIP_COPY,
  resolveTentSensorStripFreshness,
  resolveTentSensorStripVpd,
  type TentSensorStripFreshnessInput,
} from "@/lib/tentSensorStripRules";

const SENSOR_AT = "2026-11-28T10:00:00.000Z";
const MANUAL_AT = "2026-11-28T12:00:00.000Z";

function input(over: Partial<TentSensorStripFreshnessInput> = {}): TentSensorStripFreshnessInput {
  return {
    displayed: {
      snapshot: { ts: SENSOR_AT },
      fromManual: false,
      manualMetrics: { temp: false, rh: false },
      stale: false,
    },
    sensorHeader: {
      hasReadings: true,
      capturedAt: SENSOR_AT,
      sourceLabel: "EcoWitt",
      stale: false,
    },
    chipStale: { temp: false, rh: false },
    ...over,
  };
}

describe("resolveTentSensorStripFreshness", () => {
  it("shows the sensor's own source and time", () => {
    expect(resolveTentSensorStripFreshness(input())).toEqual({
      kind: "single",
      sourceLabel: "EcoWitt",
      capturedAt: SENSOR_AT,
      stale: false,
    });
  });

  it("marks a stale sensor reading stale, never healthy", () => {
    const out = resolveTentSensorStripFreshness(
      input({
        sensorHeader: { hasReadings: true, capturedAt: SENSOR_AT, sourceLabel: "CSV", stale: true },
      }),
    );
    expect(out).toMatchObject({ kind: "single", sourceLabel: "CSV", stale: true });
  });

  it("says no readings when there are none", () => {
    expect(
      resolveTentSensorStripFreshness(
        input({
          displayed: {
            snapshot: null,
            fromManual: false,
            manualMetrics: { temp: false, rh: false },
            stale: false,
          },
          sensorHeader: { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false },
        }),
      ),
    ).toEqual({ kind: "none" });
  });

  it("labels both climate chips from a manual entry as manual, with its time and staleness", () => {
    const out = resolveTentSensorStripFreshness(
      input({
        displayed: {
          snapshot: { ts: MANUAL_AT },
          fromManual: true,
          manualMetrics: { temp: true, rh: true },
          stale: true,
        },
      }),
    );
    expect(out).toEqual({
      kind: "single",
      sourceLabel: TENT_SENSOR_STRIP_COPY.manual,
      capturedAt: MANUAL_AT,
      stale: true,
    });
  });

  it("does not give one time to a split manual and sensor reading", () => {
    const out = resolveTentSensorStripFreshness(
      input({
        displayed: {
          snapshot: { ts: SENSOR_AT },
          fromManual: true,
          manualMetrics: { temp: true, rh: false },
          stale: false,
        },
        chipStale: { temp: false, rh: true },
      }),
    );
    expect(out).toEqual({ kind: "mixed", stale: true });
  });

  it("treats a manual-only tent with one manual metric as manual", () => {
    const out = resolveTentSensorStripFreshness(
      input({
        displayed: {
          snapshot: { ts: MANUAL_AT },
          fromManual: true,
          manualMetrics: { temp: true, rh: false },
          stale: false,
        },
        sensorHeader: { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false },
      }),
    );
    expect(out).toMatchObject({ kind: "single", sourceLabel: "Manual entry", capturedAt: MANUAL_AT });
  });

  it("drops an unparseable time instead of showing it", () => {
    const out = resolveTentSensorStripFreshness(
      input({
        sensorHeader: {
          hasReadings: true,
          capturedAt: "not-a-date",
          sourceLabel: null,
          stale: false,
        },
      }),
    );
    expect(out).toEqual({
      kind: "single",
      sourceLabel: TENT_SENSOR_STRIP_COPY.sensorFallback,
      capturedAt: null,
      stale: false,
    });
  });
});

describe("resolveTentSensorStripVpd", () => {
  const observation = {
    value: 1.16,
    capturedAt: SENSOR_AT,
    stale: false,
    calculated: false,
  };

  it("passes the page's own VPD through with its source and time", () => {
    expect(resolveTentSensorStripVpd({ observation, sourceLabel: "EcoWitt" })).toEqual({
      value: 1.16,
      calculated: false,
      freshness: { kind: "single", sourceLabel: "EcoWitt", capturedAt: SENSOR_AT, stale: false },
    });
  });

  it("keeps stale and calculated as they came", () => {
    expect(
      resolveTentSensorStripVpd({
        observation: { ...observation, stale: true, calculated: true },
        sourceLabel: null,
      }),
    ).toEqual({
      value: 1.16,
      calculated: true,
      freshness: {
        kind: "single",
        sourceLabel: TENT_SENSOR_STRIP_COPY.sensorFallback,
        capturedAt: SENSOR_AT,
        stale: true,
      },
    });
  });

  it("is unavailable when there is no trustworthy VPD", () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveTentSensorStripVpd({ observation: { ...observation, value }, sourceLabel: "x" }),
      ).toEqual({ value: null, calculated: false, freshness: { kind: "none" } });
    }
    expect(TENT_SENSOR_STRIP_COPY.vpdUnavailable).toBe("VPD unavailable.");
  });

  it("keeps a zero VPD as a value, not as missing", () => {
    expect(
      resolveTentSensorStripVpd({ observation: { ...observation, value: 0 }, sourceLabel: "x" })
        .value,
    ).toBe(0);
  });
});
