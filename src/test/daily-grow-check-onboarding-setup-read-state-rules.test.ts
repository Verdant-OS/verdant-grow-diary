import { describe, expect, it } from "vitest";
import {
  deriveDailyGrowCheckSetupReadState,
  type OnboardingStep,
} from "@/lib/dailyGrowCheckOnboardingRules";

type SetupRead = {
  data: unknown;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  isPlaceholderData?: boolean;
};

function read(overrides: Partial<SetupRead> = {}): SetupRead {
  return {
    data: [],
    status: "success",
    fetchStatus: "idle",
    ...overrides,
  };
}

function reads(
  overrides: Partial<Record<"tents" | "plants" | "sensors" | "diary", Partial<SetupRead>>> = {},
) {
  return {
    tents: read(overrides.tents),
    plants: read(overrides.plants),
    sensors: read(overrides.sensors),
    diary: read(overrides.diary),
  };
}

describe("deriveDailyGrowCheckSetupReadState · pure rules", () => {
  it("returns ready when every required read for the step succeeds with array data", () => {
    expect(deriveDailyGrowCheckSetupReadState(reads(), "add-tent")).toMatchObject({
      state: "ready",
      hasCachedData: false,
      isFetching: false,
    });
  });

  it.each([
    ["add-tent", { sensors: { status: "error" as const, data: undefined } }],
    ["add-plant", { sensors: { status: "error" as const }, diary: { status: "pending" as const } }],
    [
      "assign-plant",
      {
        diary: { status: "error" as const, data: undefined },
        sensors: { fetchStatus: "paused" as const, status: "pending" as const, data: undefined },
      },
    ],
    ["add-manual-snapshot", { diary: { status: "error" as const, data: undefined } }],
  ] satisfies Array<
    [OnboardingStep, Partial<Record<"tents" | "plants" | "sensors" | "diary", Partial<SetupRead>>>]
  >)("does not let later history reads block an earlier setup step (%s)", (step, patch) => {
    expect(deriveDailyGrowCheckSetupReadState(reads(patch), step).state).toBe("ready");
  });

  it.each(["add-quicklog", "run-daily-check", "ready", "add-grow"] as const)(
    "requires all four reads before %s guidance can render",
    (step) => {
      const result = deriveDailyGrowCheckSetupReadState(
        reads({ diary: { status: "error", data: undefined } }),
        step,
      );
      expect(result.state).toBe("unavailable");
    },
  );

  it("marks unavailable when a required read errors", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({ tents: { status: "error", data: undefined } }),
        "add-tent",
      ).state,
    ).toBe("unavailable");
  });

  it.each([null, {}])(
    "marks unavailable when a required read succeeds with non-array data: %j",
    (data) => {
      expect(
        deriveDailyGrowCheckSetupReadState(
          reads({ plants: { status: "success", data } }),
          "add-plant",
        ).state,
      ).toBe("unavailable");
    },
  );

  it("prefers unavailable over loading when one required read failed and another is pending", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({
          tents: { status: "error", data: undefined },
          plants: { status: "pending", fetchStatus: "fetching", data: undefined },
        }),
        "add-plant",
      ).state,
    ).toBe("unavailable");
  });

  it("reports loading while a required read is still pending", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({ tents: { status: "pending", fetchStatus: "fetching", data: undefined } }),
        "add-tent",
      ).state,
    ).toBe("loading");
  });

  it("reports paused when an unresolved required read is paused offline", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({
          tents: { status: "pending", fetchStatus: "paused", data: undefined },
        }),
        "add-tent",
      ).state,
    ).toBe("paused");
  });

  it("does not treat placeholder data as a completed required read", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({ sensors: { status: "success", isPlaceholderData: true } }),
        "add-manual-snapshot",
      ).state,
    ).toBe("loading");
  });

  it("surfaces cached array data on a failed required read", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({
          tents: { status: "error", data: [{ id: "cached-tent" }] },
        }),
        "add-tent",
      ),
    ).toMatchObject({ state: "unavailable", hasCachedData: true });
  });

  it("does not claim cached data when the failed read has no array payload", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(
        reads({ tents: { status: "error", data: undefined } }),
        "add-tent",
      ).hasCachedData,
    ).toBe(false);
  });

  it("tracks background fetching on any contributing read, not only required ones", () => {
    expect(
      deriveDailyGrowCheckSetupReadState(reads({ diary: { fetchStatus: "fetching" } }), "add-tent")
        .isFetching,
    ).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const input = reads({
      plants: { status: "pending", fetchStatus: "fetching", data: undefined },
      sensors: { status: "error", data: [] },
    });
    const first = deriveDailyGrowCheckSetupReadState(input, "add-manual-snapshot");
    const second = deriveDailyGrowCheckSetupReadState(input, "add-manual-snapshot");
    expect(second).toEqual(first);
  });
});
