/**
 * Simple home guidance (Phase 3) — What next? steps, the one tip card, and the
 * account value's shape. Steps come only from reads that succeeded and are
 * about using Verdant, never cultivation advice.
 */
import { describe, expect, it } from "vitest";
import {
  applyGuidanceNoticeAction,
  buildWhatNextSteps,
  DEFAULT_GUIDANCE_STATE,
  GUIDANCE_METADATA_KEY,
  readGuidanceFromMetadata,
  selectGuidanceCardStep,
  serializeGuidanceState,
  type GuidanceState,
} from "@/lib/simpleHomeGuidanceRules";
import { timelinePath } from "@/lib/routes";

const GROW = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-29T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const linked = { name: "Blue", href: "/plants/p1", quickLogTargetKey: "plant:p1" };
const unlinked = { name: "Legacy", href: "/plants/p2", quickLogTargetKey: null };

const ids = (input: Parameters<typeof buildWhatNextSteps>[0]) =>
  buildWhatNextSteps(input).map((s) => s.id);

describe("buildWhatNextSteps", () => {
  it("no observations yet: first observation, then Advanced tools; no Timeline step", () => {
    expect(ids({ growId: GROW, plants: [linked], observationTimes: [], now: NOW })).toEqual([
      "first-observation",
      "advanced-tools",
    ]);
  });

  it("a loading or failed recent read adds no observation steps", () => {
    expect(ids({ growId: GROW, plants: [linked], observationTimes: null, now: NOW })).toEqual([
      "advanced-tools",
    ]);
  });

  it("gap step appears at 3 days, not at 2, and names the days", () => {
    expect(
      ids({ growId: GROW, plants: [linked], observationTimes: [daysAgo(2.9)], now: NOW }),
    ).toEqual(["look-back", "advanced-tools"]);
    const steps = buildWhatNextSteps({
      growId: GROW,
      plants: [linked],
      observationTimes: [daysAgo(10), daysAgo(3)],
      now: NOW,
    });
    expect(steps.map((s) => s.id)).toEqual(["observation-gap", "look-back", "advanced-tools"]);
    expect(steps[0].body).toContain("3 days ago");
  });

  it("a plant with no grow comes first and links to that plant", () => {
    const steps = buildWhatNextSteps({
      growId: GROW,
      plants: [linked, unlinked],
      observationTimes: [],
      now: NOW,
    });
    expect(steps[0]).toMatchObject({
      id: "plant-needs-grow",
      title: "Link Legacy to a grow",
      action: { kind: "link", href: "/plants/p2" },
    });
  });

  it("no loggable plant: no Quick Log steps are offered", () => {
    expect(ids({ growId: GROW, plants: [unlinked], observationTimes: [], now: NOW })).toEqual([
      "plant-needs-grow",
      "advanced-tools",
    ]);
  });

  it("links are scoped to the grow and the Advanced link writes nothing", () => {
    const steps = buildWhatNextSteps({
      growId: GROW,
      plants: [linked],
      observationTimes: [daysAgo(0)],
      now: NOW,
    });
    expect(steps.find((s) => s.id === "look-back")?.action).toEqual({
      kind: "link",
      href: timelinePath(GROW),
    });
    expect(steps.find((s) => s.id === "advanced-tools")?.action).toEqual({
      kind: "link",
      href: `/dashboard?growId=${GROW}`,
    });
  });

  it("is deterministic", () => {
    const input = { growId: GROW, plants: [linked], observationTimes: [daysAgo(5)], now: NOW };
    expect(buildWhatNextSteps(input)).toEqual(buildWhatNextSteps(input));
  });
});

describe("selectGuidanceCardStep", () => {
  const steps = buildWhatNextSteps({
    growId: GROW,
    plants: [linked],
    observationTimes: [daysAgo(4)],
    now: NOW,
  });

  it("shows the first actionable step when tips are on and the account answered", () => {
    expect(
      selectGuidanceCardStep({ steps, state: DEFAULT_GUIDANCE_STATE, status: "ready", now: NOW })
        ?.id,
    ).toBe("observation-gap");
  });

  it("shows nothing while the account read is pending or failed, or with tips off", () => {
    for (const status of ["loading", "unavailable"] as const) {
      expect(
        selectGuidanceCardStep({ steps, state: DEFAULT_GUIDANCE_STATE, status, now: NOW }),
      ).toBeNull();
    }
    expect(
      selectGuidanceCardStep({
        steps,
        state: { ...DEFAULT_GUIDANCE_STATE, tips: "off" },
        status: "ready",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("discovery steps never reach the card: an up-to-date grower sees none", () => {
    const upToDate = buildWhatNextSteps({
      growId: GROW,
      plants: [linked],
      observationTimes: [daysAgo(0)],
      now: NOW,
    });
    expect(upToDate.length).toBeGreaterThan(0);
    expect(
      selectGuidanceCardStep({
        steps: upToDate,
        state: DEFAULT_GUIDANCE_STATE,
        status: "ready",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("a dismissed step is skipped and a retired one stays gone", () => {
    const dismissed = applyGuidanceNoticeAction(
      DEFAULT_GUIDANCE_STATE,
      "observation-gap",
      "dismiss",
      NOW,
    );
    expect(
      selectGuidanceCardStep({ steps, state: dismissed, status: "ready", now: NOW }),
    ).toBeNull();
    const nextDay = new Date(NOW.getTime() + 86_400_000);
    expect(
      selectGuidanceCardStep({ steps, state: dismissed, status: "ready", now: nextDay })?.id,
    ).toBe("observation-gap");
  });
});

describe("account value", () => {
  it("reads absent or malformed values as null and drops unknown notice ids", () => {
    expect(readGuidanceFromMetadata(null)).toBeNull();
    expect(readGuidanceFromMetadata({})).toBeNull();
    expect(readGuidanceFromMetadata({ [GUIDANCE_METADATA_KEY]: [] })).toBeNull();
    expect(
      readGuidanceFromMetadata({
        [GUIDANCE_METADATA_KEY]: {
          tips: "off",
          notices: {
            "first-observation": {
              dismissCount: 1,
              dismissedAt: NOW.toISOString(),
              snoozedUntil: null,
            },
            "made-up": { dismissCount: 1 },
            "look-back": "garbage",
          },
        },
      }),
    ).toEqual({
      tips: "off",
      notices: {
        "first-observation": {
          dismissCount: 1,
          dismissedAt: NOW.toISOString(),
          snoozedUntil: null,
        },
      },
    });
  });

  it("an unknown tips value reads as on, never as off", () => {
    expect(readGuidanceFromMetadata({ [GUIDANCE_METADATA_KEY]: { tips: "maybe" } })?.tips).toBe(
      "on",
    );
  });

  it("round-trips through serialize and restore clears one notice", () => {
    const state: GuidanceState = applyGuidanceNoticeAction(
      DEFAULT_GUIDANCE_STATE,
      "first-observation",
      "snooze",
      NOW,
    );
    const stored = { [GUIDANCE_METADATA_KEY]: serializeGuidanceState(state) };
    expect(readGuidanceFromMetadata(stored)).toEqual(state);
    expect(applyGuidanceNoticeAction(state, "first-observation", "restore", NOW).notices).toEqual(
      {},
    );
  });
});
