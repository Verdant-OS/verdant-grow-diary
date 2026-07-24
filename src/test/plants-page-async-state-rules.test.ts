import { describe, expect, it } from "vitest";
import {
  classifyPlantsScopeState,
  classifyPlantsPageAsyncState,
  resolvePlantsTentFilter,
  selectCurrentPlantsQueryData,
  snapshotPlantsQuery,
  type PlantsQuerySnapshot,
} from "@/lib/plantsPageAsyncStateRules";

const READY: PlantsQuerySnapshot = {
  hasData: true,
  isLoading: false,
  isPending: false,
  isError: false,
  isPlaceholderData: false,
};

function classify(
  primary: PlantsQuerySnapshot,
  supplemental = [{ key: "tents" as const, query: READY }],
) {
  return classifyPlantsPageAsyncState({ primary, supplemental });
}

describe("plantsPageAsyncStateRules", () => {
  it("fails closed to loading when data is absent without a settled status", () => {
    const missing = snapshotPlantsQuery({});
    const nullish = snapshotPlantsQuery({ data: null });

    expect(classify(missing).kind).toBe("loading");
    expect(classify(nullish).kind).toBe("loading");
  });

  it("treats cached placeholder data as loading for a new scope", () => {
    const placeholder = snapshotPlantsQuery({
      data: [{ id: "old-scope" }],
      isPlaceholderData: true,
    });

    expect(classify(placeholder)).toMatchObject({
      kind: "loading",
      primaryRefreshFailed: false,
    });
  });

  it("gives loading precedence over a contradictory pending error snapshot", () => {
    expect(
      classify({
        ...READY,
        hasData: false,
        isLoading: true,
        isError: true,
      }).kind,
    ).toBe("loading");
  });

  it("classifies a settled primary failure without data as error", () => {
    expect(
      classify({
        ...READY,
        hasData: false,
        isError: true,
      }).kind,
    ).toBe("error");
  });

  it("allows an established empty array to reach the presenter as usable", () => {
    const emptySuccess = snapshotPlantsQuery({ data: [] });

    expect(classify(emptySuccess)).toEqual({
      kind: "usable",
      primaryRefreshFailed: false,
      failedSupplementalKeys: [],
      staleSupplementalKeys: [],
      pendingSupplementalKeys: [],
    });
  });

  it("preserves cached primary data as limited when a refresh fails", () => {
    expect(classify({ ...READY, isError: true })).toMatchObject({
      kind: "limited",
      primaryRefreshFailed: true,
    });
  });

  it("reports supplemental failures and pending states in stable input order", () => {
    const input = {
      primary: READY,
      supplemental: [
        { key: "sensors" as const, query: { ...READY, isError: true } },
        { key: "tents" as const, query: { ...READY, hasData: false, isPending: true } },
        { key: "diary" as const, query: { ...READY, isError: true } },
      ],
    };

    const first = classifyPlantsPageAsyncState(input);
    const second = classifyPlantsPageAsyncState(input);

    expect(first).toEqual(second);
    expect(first).toEqual({
      kind: "limited",
      primaryRefreshFailed: false,
      failedSupplementalKeys: [],
      staleSupplementalKeys: ["sensors", "diary"],
      pendingSupplementalKeys: ["tents"],
    });
  });

  it("distinguishes unavailable supplements from cached refresh failures", () => {
    expect(
      classifyPlantsPageAsyncState({
        primary: READY,
        supplemental: [
          { key: "tents", query: { ...READY, hasData: false, isError: true } },
          { key: "diary", query: { ...READY, isError: true } },
        ],
      }),
    ).toMatchObject({
      failedSupplementalKeys: ["tents"],
      staleSupplementalKeys: ["diary"],
    });
  });

  it("never exposes placeholder data as current-scope data", () => {
    expect(
      selectCurrentPlantsQueryData({
        data: [{ id: "old-scope" }],
        isPlaceholderData: true,
      }),
    ).toBeUndefined();
    expect(selectCurrentPlantsQueryData({ data: [{ id: "current" }] })).toEqual([
      { id: "current" },
    ]);
  });

  it("reconciles a remembered tent filter against current-scope tent ids", () => {
    expect(resolvePlantsTentFilter("all", ["tent-b"])).toBe("all");
    expect(resolvePlantsTentFilter("tent-b", ["tent-b"])).toBe("tent-b");
    expect(resolvePlantsTentFilter("tent-a", ["tent-b"])).toBe("all");
    expect(resolvePlantsTentFilter("tent-a", [])).toBe("all");
  });

  it("classifies requested scope with loading and error precedence", () => {
    expect(
      classifyPlantsScopeState({
        hasRequestedGrow: false,
        isLoading: true,
        hasError: true,
        isValid: false,
      }),
    ).toBe("unscoped");
    expect(
      classifyPlantsScopeState({
        hasRequestedGrow: true,
        isLoading: true,
        hasError: true,
        isValid: false,
      }),
    ).toBe("loading");
    expect(
      classifyPlantsScopeState({
        hasRequestedGrow: true,
        isLoading: false,
        hasError: true,
        isValid: false,
      }),
    ).toBe("error");
    expect(
      classifyPlantsScopeState({
        hasRequestedGrow: true,
        isLoading: false,
        hasError: false,
        isValid: false,
      }),
    ).toBe("invalid");
    expect(
      classifyPlantsScopeState({
        hasRequestedGrow: true,
        isLoading: false,
        hasError: false,
        isValid: true,
      }),
    ).toBe("valid");
  });
});
