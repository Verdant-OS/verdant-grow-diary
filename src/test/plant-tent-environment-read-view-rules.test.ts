import { describe, expect, it } from "vitest";
import { buildPlantEnvironmentReadView } from "@/lib/plantTentEnvironmentRules";

describe("buildPlantEnvironmentReadView", () => {
  it("returns unassigned when no tent is linked", () => {
    expect(
      buildPlantEnvironmentReadView({ enabled: false, hasCachedReadings: false }),
    ).toMatchObject({
      kind: "unassigned",
      message: null,
      summaryLabel: "No tent",
      canAssessCurrent: false,
      canRetry: false,
    });
  });

  it("shows loading on the first unresolved fetch", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: false,
        isPending: true,
      }),
    ).toMatchObject({
      kind: "loading",
      message: "Loading latest readings…",
      summaryLabel: "Loading…",
      canAssessCurrent: false,
      canRetry: false,
    });
  });

  it("shows unavailable after a failed first read and allows retry", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: false,
        isError: true,
      }),
    ).toMatchObject({
      kind: "error",
      message: "Sensor readings unavailable.",
      summaryLabel: "Unavailable",
      canAssessCurrent: false,
      canRetry: true,
    });
  });

  it("shows cached refresh warning after a failed refresh", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: true,
        isError: true,
      }),
    ).toMatchObject({
      kind: "error",
      message: "Could not refresh sensor readings. Showing cached readings.",
      summaryLabel: "Unavailable · Cached",
      canAssessCurrent: false,
      canRetry: true,
    });
  });

  it("marks cached values while a refresh is in flight", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: true,
        isFetching: true,
      }),
    ).toMatchObject({
      kind: "refreshing",
      message: "Refreshing sensor readings. Showing cached readings.",
      summaryLabel: "Refreshing · Cached",
      canAssessCurrent: false,
      canRetry: false,
    });
  });

  it("waits for connection without treating cached rows as current", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: true,
        fetchStatus: "paused",
      }),
    ).toMatchObject({
      kind: "paused",
      message: "Waiting for connection to refresh sensor readings. Showing cached readings.",
      summaryLabel: "Waiting for connection · Cached",
      canAssessCurrent: false,
      canRetry: false,
    });
  });

  it("allows stage assessment only on a ready read", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: true,
      }),
    ).toMatchObject({
      kind: "ready",
      message: null,
      summaryLabel: null,
      canAssessCurrent: true,
      canRetry: false,
    });
  });
});
