import { describe, expect, it } from "vitest";
import { buildPlantEnvironmentReadView } from "@/lib/plantTentEnvironmentRules";

describe("buildPlantEnvironmentReadView", () => {
  it("treats disabled reads as unassigned with no stage assessment", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: false,
        hasCachedReadings: true,
        isFetching: true,
      }),
    ).toMatchObject({
      kind: "unassigned",
      message: null,
      summaryLabel: "No tent",
      canAssessCurrent: false,
      canRetry: false,
    });
  });

  it("prefers paused over error when fetchStatus is paused", () => {
    const view = buildPlantEnvironmentReadView({
      enabled: true,
      hasCachedReadings: false,
      fetchStatus: "paused",
      isError: true,
      isFetching: false,
    });
    expect(view).toMatchObject({
      kind: "paused",
      summaryLabel: "Waiting for connection",
      canAssessCurrent: false,
      canRetry: false,
    });
    expect(view.message).toMatch(/Waiting for connection to load sensor readings/);
  });

  it.each([
    [true, "Waiting for connection · Cached"],
    [false, "Waiting for connection"],
  ] as const)(
    "prefers paused over loading when fetchStatus is paused (%s cache)",
    (cached, summaryLabel) => {
      const view = buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: cached,
        fetchStatus: "paused",
        isPending: true,
        isLoading: true,
        isFetching: true,
      });
      expect(view).toMatchObject({
        kind: "paused",
        summaryLabel,
        canAssessCurrent: false,
        canRetry: false,
      });
      expect(view.message).toMatch(/Waiting for connection/);
    },
  );

  it.each([
    [true, /cached readings/i],
    [false, /Sensor readings unavailable/i],
  ] as const)("surfaces error before refresh/loading states (%s cache)", (cached, message) => {
    const view = buildPlantEnvironmentReadView({
      enabled: true,
      hasCachedReadings: cached,
      isError: true,
      isPending: true,
      isFetching: true,
    });
    expect(view).toMatchObject({
      kind: "error",
      canAssessCurrent: false,
    });
    expect(view.message).toMatch(message);
    expect(view.canRetry).toBe(false);
  });

  it("allows retry only for failed reads that are not actively fetching", () => {
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: false,
        isError: true,
        isFetching: false,
      }).canRetry,
    ).toBe(true);
    expect(
      buildPlantEnvironmentReadView({
        enabled: true,
        hasCachedReadings: true,
        isError: true,
        isFetching: true,
      }).canRetry,
    ).toBe(false);
  });

  it.each([
    ["isPending", { isPending: true }],
    ["isLoading", { isLoading: true }],
    ["isFetching", { isFetching: true }],
  ] as const)("withholds assessment while %s without cache", (_label, flags) => {
    const view = buildPlantEnvironmentReadView({
      enabled: true,
      hasCachedReadings: false,
      ...flags,
    });
    expect(view).toMatchObject({
      kind: "loading",
      summaryLabel: "Loading…",
      canAssessCurrent: false,
      canRetry: false,
    });
    expect(view.message).toMatch(/Loading latest readings/);
  });

  it.each([
    ["isPending", { isPending: true }],
    ["isLoading", { isLoading: true }],
    ["isFetching", { isFetching: true }],
  ] as const)("shows refreshing with cached readings during %s", (_label, flags) => {
    const view = buildPlantEnvironmentReadView({
      enabled: true,
      hasCachedReadings: true,
      ...flags,
    });
    expect(view).toMatchObject({
      kind: "refreshing",
      summaryLabel: "Refreshing · Cached",
      canAssessCurrent: false,
      canRetry: false,
    });
    expect(view.message).toMatch(/Refreshing sensor readings/);
  });

  it("permits stage assessment only when the read is fully ready", () => {
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

  it("is deterministic for identical inputs", () => {
    const input = {
      enabled: true,
      hasCachedReadings: true,
      isFetching: true,
    } as const;
    expect(buildPlantEnvironmentReadView(input)).toEqual(buildPlantEnvironmentReadView(input));
  });
});
