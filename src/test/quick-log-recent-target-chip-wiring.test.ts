// Tranche B+ slice D5 — wiring pins for the "Continue with <plant>?" chip.
//
// The remembered target returns ONLY as a visible suggestion the grower
// accepts. These pins hold the two properties that make that true in the
// component: it is offered only on a genuinely unscoped open, and accepting
// it performs the same explicit selection the target Select performs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUICKLOG = readFileSync("src/components/QuickLog.tsx", "utf8");
const RECENT_TARGET_STORE = readFileSync("src/lib/quickLogRecentTargetStore.ts", "utf8");
// Prettier reflows these expressions as they grow, and a pin that breaks on a
// line wrap teaches people to relax it. Collapse runs of whitespace so the
// assertions stay about SEMANTICS; the negative pins below keep them strict.
const FLAT = QUICKLOG.replace(/\s+/g, " ");

describe("D5 — remembered target is a suggestion, never a default", () => {
  it("keeps the fence name banned — no readLastTarget( in the dialog", () => {
    expect(QUICKLOG).not.toContain("readLastTarget(");
  });

  it("offers the chip only on a genuinely unscoped open with no plant chosen", () => {
    // Renegotiated from `!prefill`. That truthiness test answered the wrong
    // question: AppShell sends an activity-only prefill (`{ eventType }`) for a
    // context-free Fast Add, which names no target at all, and the old gate
    // withheld the suggestion on exactly that open. "Unscoped" now means the
    // prefill names no plant, grow, or tent.
    expect(FLAT).toMatch(
      /const showRecentTargetSuggestion = !prefillNamesTarget && !recentSuggestionDismissed && !plantId && recentTargetSuggestion !== null;/,
    );
    expect(FLAT).toMatch(/const prefillNamesTarget = quickLogPrefillNamesAnyTarget\(prefill\);/);
    // Reading is gated the same way, so a scoped open never even looks.
    expect(FLAT).toMatch(
      /open && !prefillNamesTarget \? loadRecentTargetRecord\(user\?\.id \?\? null\) : null/,
    );
    // And the retired gate cannot come back: a bare truthiness test on the
    // prefill object must never guard either the read or the render.
    expect(FLAT).not.toMatch(/showRecentTargetSuggestion = !prefill &&/);
    expect(FLAT).not.toMatch(/open && !prefill \? loadRecentTargetRecord/);
  });

  it("revalidates the stored target against the grower's visible plants AND active grows", () => {
    // Renegotiated to the new exact shape, and strengthened: the active-grow
    // list is now part of the contract. A plant in an archived grow stays in
    // `usePlants()`, so `visiblePlants` alone cannot prove the grow is live.
    expect(QUICKLOG).toMatch(
      /resolveRecentTargetSuggestion\(\{[\s\S]{0,240}visiblePlants: plants,[\s\S]{0,80}visibleGrows: grows/,
    );
    // The pre-archived-grow form cannot come back at either call site.
    expect(QUICKLOG).not.toMatch(
      /resolveRecentTargetSuggestion\(\{[^}]*visiblePlants: plants,\s*\}\)/,
    );
  });

  it("accepting the chip runs the same explicit selection as the Select", () => {
    // Renegotiated: acceptance now re-derives the suggestion against the
    // CURRENT clock before applying it, so the handler selects from that
    // re-derived value rather than the one captured when the dialog opened.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1500}resolveRecentTargetSuggestion\(\{ record: recentTargetRecord, now: Date\.now\(\), visiblePlants: plants, visibleGrows: grows, \}\)/,
    );
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1600}setPlantId\(current\.plantId\)/,
    );
    // An expired or no-longer-visible target retires the offer instead.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1500}if \(!current\) \{ setRecentSuggestionDismissed\(true\); return; \}/,
    );
    // Same lock guards the Select honors.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,500}targetSelectionLocked \|\| isMainDraftMutationLocked\(\)/,
    );
    // The open-time value must never be what gets applied.
    expect(FLAT).not.toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1600}setPlantId\(recentTargetSuggestion\.plantId\)/,
    );
  });

  it("offers a dismissal that leaves the editor empty", () => {
    expect(QUICKLOG).toContain('data-testid="quick-log-recent-target-dismiss"');
    expect(QUICKLOG).toContain("Choose another");
  });

  it("stores ONLY the account-scoped record — the v1 write is retired", () => {
    // This pin previously asserted the unscoped `.v1` key was written
    // "alongside" the scoped one. That was the wrong behavior: the approved
    // D5 map retires the v1 write, it had zero readers, and because it ran
    // before the user check an anonymous session stored a plant id anyway —
    // contradicting this slice's own account-scoped boundary. Inverted here.
    expect(QUICKLOG).toContain("buildRecentTargetStorageKey");
    expect(QUICKLOG).not.toMatch(/verdant\.quickLog\.lastTarget\.v1/);
    expect(QUICKLOG).toMatch(/rememberLastTarget\([\s\S]{0,260}user\?\.id \?\? null,/);
    expect(QUICKLOG).toContain("rememberRecentQuickLogTarget(target, userId ?? null)");
    // The one shared writer used by legacy and V2 saves keeps the account
    // guard at the storage boundary. With no user there is no key and no
    // write, regardless of which confirmed-save presenter called it.
    expect(RECENT_TARGET_STORE).toMatch(
      /const scopedKey = buildRecentTargetStorageKey[\s\S]{0,120}if \(!scopedKey\) return;/,
    );
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
