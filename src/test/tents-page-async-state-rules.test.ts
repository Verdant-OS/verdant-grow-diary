import { describe, expect, it } from "vitest";
import {
  classifyTentsPageAsyncState,
  selectCurrentTentsQueryData,
  snapshotTentsQuery,
} from "@/lib/tentsPageAsyncStateRules";
import { classifyRequestedGrowScopeState } from "@/lib/growScopeAsyncStateRules";

const settled = (data: unknown) =>
  snapshotTentsQuery({
    data,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    isPlaceholderData: false,
  });

describe("tents page async-state rules", () => {
  it("orders primary placeholder/loading before error and empty", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({
        data: [],
        isLoading: true,
        isError: true,
        isPlaceholderData: true,
      }),
      primaryRowCount: 0,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {},
    });

    expect(state.kind).toBe("loading");
  });

  it("classifies an uncached primary failure as error", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({ data: undefined, isError: true }),
      primaryRowCount: 0,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {},
    });

    expect(state.kind).toBe("error");
  });

  it("treats a successful empty primary result as established usable state", () => {
    const state = classifyTentsPageAsyncState({
      primary: settled([]),
      primaryRowCount: 0,
      plants: snapshotTentsQuery({ data: undefined, isPending: true }),
      assignments: snapshotTentsQuery({ data: undefined, isPending: true }),
      sensorStatusByTent: {},
    });

    expect(state.kind).toBe("usable");
    expect(state.plantsStatus).toBe("not_needed");
  });

  it("keeps cached primary rows but reports a failed refresh as limited", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({ data: [{ id: "tent-a" }], isError: true }),
      primaryRowCount: 1,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: { "tent-a": "success" },
    });

    expect(state.kind).toBe("limited");
    expect(state.primaryRefreshFailed).toBe(true);
  });

  it("never promotes a failed refresh over cached empty rows to established empty", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({ data: [], isError: true }),
      primaryRowCount: 0,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {},
    });

    expect(state.kind).toBe("error");
  });

  it.each([
    ["loading", { data: undefined, isPending: true }],
    ["error", { data: undefined, isError: true }],
    ["stale", { data: [{ id: "plant-a" }], isError: true }],
    ["ready", { data: [] }],
  ] as const)("classifies plant enrichment as %s", (expected, query) => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-a" }]),
      primaryRowCount: 1,
      plants: snapshotTentsQuery(query),
      assignments: settled([]),
      sensorStatusByTent: { "tent-a": "success" },
    });

    expect(state.plantsStatus).toBe(expected);
    expect(state.kind).toBe(expected === "ready" ? "usable" : "limited");
  });

  it("keeps cached plant rows visible but classifies a background refresh as refreshing", () => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-a" }]),
      primaryRowCount: 1,
      plants: snapshotTentsQuery({ data: [{ id: "plant-a" }], isFetching: true }),
      assignments: settled([{ id: "plant-a" }]),
      sensorStatusByTent: { "tent-a": "success" },
    });

    expect(state.kind).toBe("limited");
    expect(state.plantsStatus).toBe("refreshing");
  });

  it.each([
    ["loading", { data: undefined, isPending: true }],
    ["error", { data: undefined, isError: true }],
    ["stale", { data: [{ id: "plant-a" }], isError: true }],
    ["refreshing", { data: [{ id: "plant-a" }], isFetching: true }],
    ["ready", { data: [] }],
  ] as const)("classifies destructive-action assignments as %s", (expected, query) => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-a" }]),
      primaryRowCount: 1,
      plants: settled([]),
      assignments: snapshotTentsQuery(query),
      sensorStatusByTent: { "tent-a": "success" },
    });

    expect(state.assignmentPlantsStatus).toBe(expected);
    expect(state.kind).toBe(expected === "ready" ? "usable" : "limited");
  });

  it("treats a cached non-empty primary background refresh as limited", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({ data: [{ id: "tent-a" }], isFetching: true }),
      primaryRowCount: 1,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: { "tent-a": "success" },
    });

    expect(state.kind).toBe("limited");
    expect(state.primaryRefreshing).toBe(true);
  });

  it("does not promote cached empty primary rows to Empty during a refresh", () => {
    const state = classifyTentsPageAsyncState({
      primary: snapshotTentsQuery({ data: [], isFetching: true }),
      primaryRowCount: 0,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {},
    });

    expect(state.kind).toBe("loading");
  });

  it("reports sensor loading and error ids deterministically", () => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-b" }, { id: "tent-a" }]),
      primaryRowCount: 2,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {
        "tent-b": "error",
        "tent-a": "loading",
        "tent-ignored": "error",
      },
      primaryTentIds: ["tent-b", "tent-a"],
    });

    expect(state.sensorLoadingTentIds).toEqual(["tent-a"]);
    expect(state.sensorErrorTentIds).toEqual(["tent-b"]);
    expect(state.kind).toBe("limited");
  });

  it("reports cached sensor refresh failures separately from uncached errors", () => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-a" }, { id: "tent-b" }]),
      primaryRowCount: 2,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {
        "tent-a": "refresh_error",
        "tent-b": "error",
      },
      primaryTentIds: ["tent-b", "tent-a"],
    });

    expect(state.sensorRefreshFailedTentIds).toEqual(["tent-a"]);
    expect(state.sensorErrorTentIds).toEqual(["tent-b"]);
    expect(state.kind).toBe("limited");
  });

  it("fails a requested sensor slot closed to loading when status is missing", () => {
    const state = classifyTentsPageAsyncState({
      primary: settled([{ id: "tent-a" }]),
      primaryRowCount: 1,
      plants: settled([]),
      assignments: settled([]),
      sensorStatusByTent: {},
      primaryTentIds: ["tent-a"],
    });

    expect(state.sensorLoadingTentIds).toEqual(["tent-a"]);
    expect(state.kind).toBe("limited");
  });

  it("never returns placeholder data as current-scope rows", () => {
    expect(
      selectCurrentTentsQueryData({
        data: [{ id: "old-scope" }],
        isPlaceholderData: true,
      }),
    ).toBeUndefined();
  });
});

describe("requested grow scope classification", () => {
  it.each([
    ["unscoped", false, true, true, false],
    ["loading", true, true, false, false],
    ["error", true, false, true, false],
    ["valid", true, false, false, true],
    ["invalid", true, false, false, false],
  ] as const)("returns %s", (expected, hasRequestedGrow, isLoading, hasError, isValid) => {
    expect(
      classifyRequestedGrowScopeState({
        hasRequestedGrow,
        isLoading,
        hasError,
        isValid,
      }),
    ).toBe(expected);
  });
});
