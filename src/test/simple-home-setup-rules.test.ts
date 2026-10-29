/**
 * Simple home setup card — pure rules.
 *
 * Start vs continue, the grow → tent → plant checklist, when `/start-room`
 * may resume the room (one grow, matching active grow, the tent count the
 * next step needs) versus the plain list page, an allowance line that never
 * guesses, and the grow-name bound shared with the setup flow.
 */
import { describe, expect, it } from "vitest";
import {
  buildSimpleHomeSetupProgress,
  canResumeSetupWizard,
  explainGrowAllowance,
  isValidGrowName,
  SIMPLE_HOME_SETUP_COPY,
} from "@/lib/simpleHomeSetupRules";

const GROW = "11111111-1111-4111-8111-111111111111";
const GROW_2 = "22222222-2222-4222-8222-222222222222";
const FREE = { maxActiveGrows: 1 };
const PRO = { maxActiveGrows: null };

describe("buildSimpleHomeSetupProgress", () => {
  it("no grow → start: nothing done, Start setup to /start-room, nothing created by visiting", () => {
    const p = buildSimpleHomeSetupProgress({
      state: { kind: "no-grow" },
      grows: [],
      activeGrowId: null,
      tentCount: 0,
      capabilities: FREE,
    });
    expect(p.kind).toBe("start");
    expect(p.nextStep).toBe("grow");
    expect(p.steps.map((s) => [s.key, s.done])).toEqual([
      ["grow", false],
      ["tent", false],
      ["plant", false],
    ]);
    expect(p.primary).toEqual({ label: "Start setup", href: "/start-room" });
    expect(p.secondary).toBeNull();
    expect(p.canRename).toBe(false);
    expect(p.growHref).toBeNull();
    expect(p.body).toContain("Nothing is created by visiting this page");
    expect(p.allowance).toBe(SIMPLE_HOME_SETUP_COPY.allowanceOneFree);
  });

  it("one grow, no tent → continue: resumes the wizard, offers the Tents page second, offers rename", () => {
    const p = buildSimpleHomeSetupProgress({
      state: { kind: "no-tent", growId: GROW, href: `/tents?growId=${GROW}` },
      grows: [{ id: GROW, name: " My grow " }],
      activeGrowId: null,
      tentCount: 0,
      capabilities: FREE,
    });
    expect(p.kind).toBe("continue");
    expect(p.nextStep).toBe("tent");
    expect(p.steps[0]).toMatchObject({ key: "grow", done: true, detail: "My grow" });
    expect(p.steps[1]).toMatchObject({ key: "tent", done: false });
    expect(p.primary).toEqual({ label: "Continue setup", href: "/start-room" });
    expect(p.secondary).toEqual({
      label: SIMPLE_HOME_SETUP_COPY.secondaryTent,
      href: `/tents?growId=${GROW}`,
    });
    expect(p.growName).toBe("My grow");
    expect(p.growHref).toBe(`/grows/${GROW}`);
    expect(p.canRename).toBe(true);
    expect(p.allowance).toBe(SIMPLE_HOME_SETUP_COPY.allowanceOneInUse("My grow"));
  });

  it("one grow, one tent, no plant → continue on the wizard; a blank grow name reads Untitled grow", () => {
    const p = buildSimpleHomeSetupProgress({
      state: { kind: "no-plant", growId: GROW, href: `/plants?growId=${GROW}` },
      grows: [{ id: GROW, name: "" }],
      activeGrowId: GROW,
      tentCount: 1,
      capabilities: FREE,
    });
    expect(p.nextStep).toBe("plant");
    expect(p.steps.map((s) => s.done)).toEqual([true, true, false]);
    expect(p.steps[1].detail).toBe("1 tent");
    expect(p.primary).toEqual({ label: "Continue setup", href: "/start-room" });
    expect(p.secondary?.href).toBe(`/plants?growId=${GROW}`);
    expect(p.growName).toBe("Untitled grow");
  });

  it("a plan that can still add a grow (or is unverified) gets the plain page, because the wizard would open at create-a-grow", () => {
    for (const capabilities of [PRO, { maxActiveGrows: 3 }, null]) {
      const tent = buildSimpleHomeSetupProgress({
        state: { kind: "no-tent", growId: GROW, href: `/tents?growId=${GROW}` },
        grows: [{ id: GROW, name: "A" }],
        activeGrowId: null,
        tentCount: 0,
        capabilities,
      });
      expect(tent.primary).toEqual({ label: "Add a tent", href: `/tents?growId=${GROW}` });
      expect(tent.secondary).toBeNull();
      const plant = buildSimpleHomeSetupProgress({
        state: { kind: "no-plant", growId: GROW, href: `/plants?growId=${GROW}` },
        grows: [{ id: GROW, name: "A" }],
        activeGrowId: null,
        tentCount: 1,
        capabilities,
      });
      expect(plant.primary).toEqual({ label: "Add a plant", href: `/plants?growId=${GROW}` });
    }
  });

  it("several grows: the wizard cannot resume, so the plain page is the primary and no rename is offered", () => {
    const p = buildSimpleHomeSetupProgress({
      state: { kind: "no-tent", growId: GROW_2, href: `/tents?growId=${GROW_2}` },
      grows: [
        { id: GROW, name: "A" },
        { id: GROW_2, name: "B" },
      ],
      activeGrowId: GROW_2,
      tentCount: 0,
      capabilities: { maxActiveGrows: 3 },
    });
    expect(p.primary).toEqual({ label: "Add a tent", href: `/tents?growId=${GROW_2}` });
    expect(p.secondary).toBeNull();
    expect(p.canRename).toBe(false);
    expect(p.allowance).toBe(SIMPLE_HOME_SETUP_COPY.allowanceMany(3, 2));
  });

  it("two tents and no plant: the wizard's plant step cannot bind, so the Plants page is primary", () => {
    const p = buildSimpleHomeSetupProgress({
      state: { kind: "no-plant", growId: GROW, href: `/plants?growId=${GROW}` },
      grows: [{ id: GROW, name: "A" }],
      activeGrowId: null,
      tentCount: 2,
      capabilities: null,
    });
    expect(p.primary).toEqual({ label: "Add a plant", href: `/plants?growId=${GROW}` });
    expect(p.steps[1].detail).toBe("2 tents");
    expect(p.allowance).toBeNull();
  });

  it("is deterministic", () => {
    const input = {
      state: { kind: "no-tent", growId: GROW, href: `/tents?growId=${GROW}` } as const,
      grows: [{ id: GROW, name: "A" }],
      activeGrowId: null,
      tentCount: 0,
      capabilities: FREE,
    };
    expect(buildSimpleHomeSetupProgress(input)).toEqual(buildSimpleHomeSetupProgress(input));
  });
});

describe("canResumeSetupWizard", () => {
  it("grow step always resumes (the wizard starts there)", () => {
    expect(
      canResumeSetupWizard({
        grows: [],
        activeGrowId: null,
        tentCount: 0,
        nextStep: "grow",
        capabilities: FREE,
      }),
    ).toBe(true);
  });
  it("partial steps resume only when a verified plan limit blocks another grow", () => {
    const base = {
      grows: [{ id: GROW }],
      activeGrowId: null,
      tentCount: 0,
      nextStep: "tent" as const,
    };
    expect(canResumeSetupWizard({ ...base, capabilities: FREE })).toBe(true);
    expect(canResumeSetupWizard({ ...base, capabilities: PRO })).toBe(false);
    expect(canResumeSetupWizard({ ...base, capabilities: { maxActiveGrows: 2 } })).toBe(false);
    expect(canResumeSetupWizard({ ...base, capabilities: null })).toBe(false);
    expect(canResumeSetupWizard({ ...base, nextStep: "grow", capabilities: null })).toBe(true);
  });
  it("tent step needs exactly one grow, an unset or matching active grow, and zero tents", () => {
    const one = [{ id: GROW }];
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: null,
        tentCount: 0,
        nextStep: "tent",
        capabilities: FREE,
      }),
    ).toBe(true);
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: GROW,
        tentCount: 0,
        nextStep: "tent",
        capabilities: FREE,
      }),
    ).toBe(true);
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: GROW_2,
        tentCount: 0,
        nextStep: "tent",
        capabilities: FREE,
      }),
    ).toBe(false);
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: null,
        tentCount: 1,
        nextStep: "tent",
        capabilities: FREE,
      }),
    ).toBe(false);
    expect(
      canResumeSetupWizard({
        grows: [{ id: GROW }, { id: GROW_2 }],
        activeGrowId: null,
        tentCount: 0,
        nextStep: "tent",
        capabilities: { maxActiveGrows: 2 },
      }),
    ).toBe(false);
  });
  it("plant step needs exactly one tent", () => {
    const one = [{ id: GROW }];
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: null,
        tentCount: 1,
        nextStep: "plant",
        capabilities: FREE,
      }),
    ).toBe(true);
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: null,
        tentCount: 0,
        nextStep: "plant",
        capabilities: FREE,
      }),
    ).toBe(false);
    expect(
      canResumeSetupWizard({
        grows: one,
        activeGrowId: null,
        tentCount: 2,
        nextStep: "plant",
        capabilities: FREE,
      }),
    ).toBe(false);
  });
});

describe("explainGrowAllowance", () => {
  it("says nothing when capabilities are unknown or unlimited", () => {
    expect(
      explainGrowAllowance({ capabilities: null, activeGrowCount: 0, growName: null }),
    ).toBeNull();
    expect(
      explainGrowAllowance({ capabilities: undefined, activeGrowCount: 1, growName: "A" }),
    ).toBeNull();
    expect(
      explainGrowAllowance({ capabilities: PRO, activeGrowCount: 4, growName: "A" }),
    ).toBeNull();
    expect(
      explainGrowAllowance({
        capabilities: { maxActiveGrows: 0 },
        activeGrowCount: 0,
        growName: null,
      }),
    ).toBeNull();
  });
  it("one-grow plans: free slot vs the named grow that holds it", () => {
    expect(explainGrowAllowance({ capabilities: FREE, activeGrowCount: 0, growName: null })).toBe(
      SIMPLE_HOME_SETUP_COPY.allowanceOneFree,
    );
    expect(
      explainGrowAllowance({ capabilities: FREE, activeGrowCount: 1, growName: "Starter Grow" }),
    ).toBe(
      "Your plan includes 1 active grow, and “Starter Grow” is it. Finish setting it up here, or rename it.",
    );
    // In use but no name to show: fall back to the count form rather than inventing a name.
    expect(explainGrowAllowance({ capabilities: FREE, activeGrowCount: 1, growName: null })).toBe(
      SIMPLE_HOME_SETUP_COPY.allowanceMany(1, 1),
    );
  });
  it("larger limits report the count; negative counts clamp to zero", () => {
    expect(
      explainGrowAllowance({
        capabilities: { maxActiveGrows: 5 },
        activeGrowCount: -2,
        growName: null,
      }),
    ).toBe("Your plan includes 5 active grows (0 in use).");
  });
});

describe("isValidGrowName", () => {
  it("accepts 1–80 trimmed characters and rejects blanks, non-strings and overlong names", () => {
    expect(isValidGrowName("A")).toBe(true);
    expect(isValidGrowName("  My grow  ")).toBe(true);
    expect(isValidGrowName("x".repeat(80))).toBe(true);
    expect(isValidGrowName("x".repeat(81))).toBe(false);
    expect(isValidGrowName("   ")).toBe(false);
    expect(isValidGrowName("")).toBe(false);
    expect(isValidGrowName(null)).toBe(false);
    expect(isValidGrowName(42)).toBe(false);
  });
});
