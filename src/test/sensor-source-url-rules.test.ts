/**
 * sensor-source-url-rules — pure helper tests for parsing & encoding
 * the shared `?sensorSources=` / `?from=` / `?to=` URL filters.
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelineFilterUrl,
  encodeSensorSourcesParam,
  parseDateRangeParam,
  parseSensorSourcesParam,
  sensorSourcesEqual,
  SENSOR_SOURCES_PARAM,
  SENSOR_RANGE_FROM_PARAM,
  SENSOR_RANGE_TO_PARAM,
} from "@/lib/sensorSourceUrlRules";

describe("parseSensorSourcesParam", () => {
  it("returns empty for null / blank / non-string input", () => {
    expect(parseSensorSourcesParam(null)).toEqual([]);
    expect(parseSensorSourcesParam(undefined)).toEqual([]);
    expect(parseSensorSourcesParam("")).toEqual([]);
    expect(parseSensorSourcesParam("   ")).toEqual([]);
  });

  it("parses canonical kinds preserving order", () => {
    expect(parseSensorSourcesParam("live,csv,manual")).toEqual([
      "live",
      "csv",
      "manual",
    ]);
  });

  it("drops unknown tokens silently without crashing", () => {
    expect(parseSensorSourcesParam("live,foo,bar,csv,xss<script>")).toEqual([
      "live",
      "csv",
    ]);
  });

  it("normalizes case and de-duplicates", () => {
    expect(parseSensorSourcesParam("LIVE,live,Manual,manual")).toEqual([
      "live",
      "manual",
    ]);
  });

  it("recognizes the full canonical set", () => {
    expect(parseSensorSourcesParam("live,manual,csv,demo,stale,invalid")).toEqual(
      ["live", "manual", "csv", "demo", "stale", "invalid"],
    );
  });
});

describe("encodeSensorSourcesParam", () => {
  it("returns empty string for empty / nullish input", () => {
    expect(encodeSensorSourcesParam(null)).toBe("");
    expect(encodeSensorSourcesParam(undefined)).toBe("");
    expect(encodeSensorSourcesParam([])).toBe("");
  });
  it("joins kinds with comma preserving order and dropping dupes", () => {
    expect(encodeSensorSourcesParam(["csv", "live", "csv"])).toBe("csv,live");
  });
});

describe("parseDateRangeParam", () => {
  it("validates YYYY-MM-DD", () => {
    expect(parseDateRangeParam("2026-06-17")).toBe("2026-06-17");
  });
  it("rejects malformed values", () => {
    expect(parseDateRangeParam(null)).toBeNull();
    expect(parseDateRangeParam("not-a-date")).toBeNull();
    expect(parseDateRangeParam("2026/06/17")).toBeNull();
    expect(parseDateRangeParam("2026-13-01")).toBeNull();
  });
});

describe("sensorSourcesEqual", () => {
  it("ignores order", () => {
    expect(sensorSourcesEqual(["live", "csv"], ["csv", "live"])).toBe(true);
  });
  it("detects subset diff", () => {
    expect(sensorSourcesEqual(["live"], ["csv", "live"])).toBe(false);
  });
  it("treats null/undefined as empty", () => {
    expect(sensorSourcesEqual(null, [])).toBe(true);
  });
});

describe("buildTimelineFilterUrl", () => {
  it("returns base path with no params when input is empty", () => {
    expect(buildTimelineFilterUrl({})).toBe("/timeline");
  });

  it("adds canonical params for sources + date + plant", () => {
    const url = buildTimelineFilterUrl({
      sources: ["live", "csv"],
      from: "2026-06-01",
      to: "2026-06-17",
      plantId: "p1",
    });
    expect(url).toContain(`${SENSOR_SOURCES_PARAM}=live%2Ccsv`);
    expect(url).toContain(`${SENSOR_RANGE_FROM_PARAM}=2026-06-01`);
    expect(url).toContain(`${SENSOR_RANGE_TO_PARAM}=2026-06-17`);
    expect(url).toContain("plantId=p1");
  });

  it("drops invalid dates rather than emitting them", () => {
    const url = buildTimelineFilterUrl({
      sources: ["manual"],
      from: "bad",
      to: "2026-06-17",
    });
    expect(url).not.toContain("from=");
    expect(url).toContain(`${SENSOR_RANGE_TO_PARAM}=2026-06-17`);
  });

  it("supports an alternate base path", () => {
    expect(
      buildTimelineFilterUrl({ sources: ["live"], base: "/logs" }),
    ).toBe(`/logs?${SENSOR_SOURCES_PARAM}=live`);
  });
});
