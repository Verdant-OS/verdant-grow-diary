// Tranche B+ slice D5 — wiring pins for the "Continue with <plant>?" chip.
//
// The remembered target returns ONLY as a visible suggestion the grower
// accepts. These pins hold the two properties that make that true in the
// component: it is offered only on a genuinely unscoped open, and accepting
// it performs the same explicit selection the target Select performs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUICKLOG = readFileSync("src/components/QuickLog.tsx", "utf8");

describe("D5 — remembered target is a suggestion, never a default", () => {
  it("keeps the fence name banned — no readLastTarget( in the dialog", () => {
    expect(QUICKLOG).not.toContain("readLastTarget(");
  });

  it("offers the chip only on a genuinely unscoped open with no plant chosen", () => {
    expect(QUICKLOG).toMatch(
      /const showRecentTargetSuggestion =\s*!prefill && !recentSuggestionDismissed && !plantId && recentTargetSuggestion !== null;/,
    );
    // Reading is gated the same way, so a prefilled open never even looks.
    expect(QUICKLOG).toMatch(
      /open && !prefill \? loadRecentTargetRecord\(user\?\.id \?\? null\) : null/,
    );
  });

  it("revalidates the stored target against the grower's visible plants", () => {
    expect(QUICKLOG).toMatch(/resolveRecentTargetSuggestion\(\{[\s\S]{0,200}visiblePlants: plants/);
  });

  it("accepting the chip runs the same explicit selection as the Select", () => {
    expect(QUICKLOG).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,700}setPlantId\(recentTargetSuggestion\.plantId\)/,
    );
    // Same lock guards the Select honors.
    expect(QUICKLOG).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,500}targetSelectionLocked \|\| isMainDraftMutationLocked\(\)/,
    );
  });

  it("offers a dismissal that leaves the editor empty", () => {
    expect(QUICKLOG).toContain('data-testid="quick-log-recent-target-dismiss"');
    expect(QUICKLOG).toContain("Choose another");
  });

  it("stores an account-scoped copy alongside the pinned v1 key", () => {
    expect(QUICKLOG).toContain("buildRecentTargetStorageKey");
    expect(QUICKLOG).toMatch(/verdant\.quickLog\.lastTarget\.v1/);
    expect(QUICKLOG).toMatch(/rememberLastTarget\([\s\S]{0,260}user\?\.id \?\? null,/);
  });

  it("keeps the suggestion copy calm and free of certainty claims", () => {
    expect(QUICKLOG).toContain("Continue with {recentTargetSuggestion.plantName}?");
    const chipRegion = QUICKLOG.slice(
      QUICKLOG.indexOf("quick-log-recent-target-suggestion"),
      QUICKLOG.indexOf("quick-log-recent-target-dismiss"),
    );
    expect(chipRegion).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });
});
