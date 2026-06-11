import { describe, it, expect } from "vitest";
import {
  ENVIRONMENT_SUMMARY_REPORT_PATH,
  buildEnvironmentSummaryReportUrl,
  defaultEnvironmentSummaryRange,
  isValidEnvironmentSummaryRange,
} from "@/lib/environmentSummaryNavigationRules";

describe("buildEnvironmentSummaryReportUrl", () => {
  it("returns bare path with no params", () => {
    expect(buildEnvironmentSummaryReportUrl()).toBe(ENVIRONMENT_SUMMARY_REPORT_PATH);
    expect(buildEnvironmentSummaryReportUrl({})).toBe(ENVIRONMENT_SUMMARY_REPORT_PATH);
  });

  it("includes start/end query params", () => {
    expect(
      buildEnvironmentSummaryReportUrl({
        startDate: "2026-06-01",
        endDate: "2026-06-07",
      }),
    ).toBe("/diary/environment-summary?start=2026-06-01&end=2026-06-07");
  });

  it("includes issue drilldown param", () => {
    expect(
      buildEnvironmentSummaryReportUrl({
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        issueId: "climate.vpd",
      }),
    ).toBe(
      "/diary/environment-summary?start=2026-06-01&end=2026-06-07&issue=climate.vpd",
    );
  });

  it("ignores invalid date formats", () => {
    expect(
      buildEnvironmentSummaryReportUrl({
        startDate: "06/01/2026" as any,
        endDate: "bad" as any,
        issueId: "x",
      }),
    ).toBe("/diary/environment-summary?issue=x");
  });
});

describe("defaultEnvironmentSummaryRange", () => {
  it("returns last 7 days ending today", () => {
    const r = defaultEnvironmentSummaryRange(new Date("2026-06-11T12:00:00Z"));
    // 7 days inclusive: 2026-06-05 .. 2026-06-11
    expect(r.endDate).toBe("2026-06-11");
    expect(r.startDate).toBe("2026-06-05");
  });
});

describe("isValidEnvironmentSummaryRange", () => {
  it("accepts start <= end", () => {
    expect(isValidEnvironmentSummaryRange("2026-06-01", "2026-06-07")).toBe(true);
    expect(isValidEnvironmentSummaryRange("2026-06-07", "2026-06-07")).toBe(true);
  });
  it("rejects invalid or reversed ranges", () => {
    expect(isValidEnvironmentSummaryRange("2026-06-08", "2026-06-07")).toBe(false);
    expect(isValidEnvironmentSummaryRange(null, "2026-06-07")).toBe(false);
    expect(isValidEnvironmentSummaryRange("bad", "2026-06-07")).toBe(false);
  });
});
