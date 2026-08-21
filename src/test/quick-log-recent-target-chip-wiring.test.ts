// Tranche B+ slice D5 — wiring pins for the "Continue with <plant>?" chip.
//
// The remembered target returns ONLY as a visible suggestion the grower
// accepts. These pins hold the two properties that make that true in the
// component: it is offered only where the launcher has not already named a
// plant AND the revalidated scope agrees, and accepting it performs the same
// explicit selection the target Select performs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QUICKLOG = readFileSync("src/components/QuickLog.tsx", "utf8");
const RECENT_TARGET_STORE = readFileSync("src/lib/quickLogRecentTargetStore.ts", "utf8");
const PLANT_QUICK_LOG = readFileSync("src/components/PlantQuickLog.tsx", "utf8");
const DAILY_CHECK = readFileSync("src/pages/DailyCheck.tsx", "utf8");
// Prettier reflows these expressions as they grow, and a pin that breaks on a
// line wrap teaches people to relax it. Collapse runs of whitespace so the
// assertions stay about SEMANTICS; the negative pins below keep them strict.
const FLAT = QUICKLOG.replace(/\s+/g, " ");

describe("D5 — remembered target is a suggestion, never a default", () => {
  it("keeps the fence name banned — no readLastTarget( in the dialog", () => {
    expect(QUICKLOG).not.toContain("readLastTarget(");
  });

  it("offers the chip only when no plant is named and the scope agrees", () => {
    // Renegotiated twice, never loosened.
    //
    // Round 1 replaced `!prefill`. That truthiness test answered the wrong
    // question: AppShell sends an activity-only prefill (`{ eventType }`) for a
    // context-free Fast Add, which names no target at all, and the old gate
    // withheld the suggestion on exactly that open.
    //
    // Round 2 replaces "names ANY target". A prefill naming only a grow or tent
    // has NOT answered "which plant?" — `GrowRecoveryPrompt` sends `{ growId }`
    // and leaves the Select empty, which is the very dialog the approved S6
    // target expects this chip to reduce to one tap. Scope agreement is now
    // decided by a pure rule against the revalidated suggestion instead of by
    // rejecting every scoped open.
    expect(FLAT).toMatch(
      /const showRecentTargetSuggestion = !prefillNamesPlant && !recentSuggestionDismissed && !plantId && recentTargetSuggestionFitsPrefillScope\(recentTargetSuggestion, prefill\);/,
    );
    expect(FLAT).toMatch(/const prefillNamesPlant = quickLogPrefillNamesPlant\(prefill\);/);
    // Reading is gated on the same narrower question, so a plant-named open
    // never even looks — but a grow-scoped one does, and must.
    expect(FLAT).toMatch(
      /open && !prefillNamesPlant \? loadRecentTargetRecord\(user\?\.id \?\? null\) : null/,
    );
    // Acceptance re-asserts scope as well as identity: the render that produced
    // the button is not evidence about the record at click time.
    expect(FLAT).toMatch(/if \(!recentTargetSuggestionFitsPrefillScope\(current, prefill\)\) \{/);
    // No retired gate can come back — neither the bare truthiness test on the
    // prefill object, nor the any-target form that suppressed grow-scoped opens.
    expect(FLAT).not.toMatch(/showRecentTargetSuggestion = !prefill &&/);
    expect(FLAT).not.toMatch(/open && !prefill \? loadRecentTargetRecord/);
    expect(FLAT).not.toMatch(/quickLogPrefillNamesAnyTarget/);
    expect(FLAT).not.toMatch(/!prefillNamesTarget/);
  });

  it("revalidates the stored target against visible plants, active grows AND live tents", () => {
    // Renegotiated to the new exact shape, and strengthened twice: a plant in
    // an archived grow stays in `usePlants()`, and a plant whose TENT was
    // archived or moved keeps its `tent_id`. Neither list alone proves the
    // target is one the write path would accept.
    expect(QUICKLOG).toMatch(
      /resolveRecentTargetSuggestion\(\{[\s\S]{0,240}visiblePlants: plants,[\s\S]{0,140}visibleGrows: grows,[\s\S]{0,80}visibleTents: activeTents/,
    );
    // Neither pre-fix form can come back at either call site.
    expect(QUICKLOG).not.toMatch(
      /resolveRecentTargetSuggestion\(\{[^}]*visiblePlants: plants,\s*\}\)/,
    );
    expect(QUICKLOG).not.toMatch(
      /resolveRecentTargetSuggestion\(\{[^}]*visibleGrows: grows,\s*\}\)/,
    );
  });

  it("tracks only the signed-in account's storage key while the dialog is open", () => {
    expect(FLAT).toMatch(/window\.addEventListener\("storage", handleRecentTargetStorage\)/);
    expect(FLAT).toMatch(/event\.key !== null && event\.key !== recentTargetStorageKey/);
    expect(FLAT).toMatch(
      /handleRecentTargetStorage[\s\S]{0,350}const record = loadRecentTargetRecord\(user\?\.id \?\? null\)/,
    );
    expect(FLAT).toMatch(/window\.removeEventListener\("storage", handleRecentTargetStorage\)/);
    // A snapshot is paired with its account key so the old account's value is
    // ineligible even for the render before the subscription effect reloads.
    expect(FLAT).toMatch(
      /recentTargetSnapshot\.storageKey === recentTargetStorageKey \? recentTargetSnapshot\.record : null/,
    );
  });

  it("accepting the chip runs the same explicit selection as the Select", () => {
    // Renegotiated: acceptance now re-derives the suggestion against the
    // CURRENT clock before applying it, so the handler selects from that
    // re-derived value rather than the one captured when the dialog opened.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1500}const latestRecord = loadRecentTargetRecord\(user\?\.id \?\? null\);[\s\S]{0,300}resolveRecentTargetSuggestion\(\{ record: latestRecord, now: Date\.now\(\), visiblePlants: plants, visibleGrows: grows, visibleTents: activeTents, \}\)/,
    );
    // Window widened from 1600 to the measured 1900: acceptance now also
    // re-asserts prefill scope before applying, which sits between the
    // testid and this call. Measured span at this commit is 1823 characters.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1900}setPlantId\(current\.plantId\)/,
    );
    // Scope is re-asserted BEFORE the plant is applied, not after.
    expect(FLAT).toMatch(
      /if \(!recentTargetSuggestionFitsPrefillScope\(current, prefill\)\) \{[\s\S]{0,300}record: latestRecord,[\s\S]{0,80}return; \}[\s\S]{0,600}setPlantId\(current\.plantId\)/,
    );
    // An expired or no-longer-visible target retires the offer instead.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1800}if \(!current\) \{[\s\S]{0,300}setRecentSuggestionDismissed\(true\); return; \}/,
    );
    // If storage changed from A to B before its event arrived, the A-labelled
    // click redraws B and returns. It cannot silently reinterpret consent.
    expect(FLAT).toMatch(
      /if \(current\.plantId !== recentTargetSuggestion\.plantId\) \{[\s\S]{0,300}record: latestRecord,[\s\S]{0,80}return; \}/,
    );
    // Same lock guards the Select honors.
    expect(FLAT).toMatch(
      /quick-log-recent-target-accept[\s\S]{0,500}targetSelectionLocked \|\| isMainDraftMutationLocked\(\)/,
    );
    // The open-time value must never be what gets applied.
    // Widening a NEGATIVE window strengthens it — the retired form is now
    // forbidden across a larger span, not a smaller one.
    expect(FLAT).not.toMatch(
      /quick-log-recent-target-accept[\s\S]{0,1900}setPlantId\(recentTargetSuggestion\.plantId\)/,
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

describe("D5 — every plant-scoped save surface updates the memory", () => {
  // These are WIRING pins, and that is the right tool for exactly this claim:
  // "a call site exists / has not been deleted". They do not prove the write
  // lands — the resolved-value coverage for that is in the suggestion rules
  // and RTL suites. Stated so nobody mistakes them for behavioural proof.
  //
  // Why the pins exist at all: a remembered target that misses a save surface
  // does not fail loudly. It silently offers an OLDER plant, which is valid
  // and wrong, and only a grower who noticed would ever report it.
  const FLAT_PLANT_QUICK_LOG = PLANT_QUICK_LOG.replace(/\s+/g, " ");
  const FLAT_DAILY_CHECK = DAILY_CHECK.replace(/\s+/g, " ");

  it("PlantQuickLog remembers the plant on a confirmed save", () => {
    expect(PLANT_QUICK_LOG).toContain(
      'import { rememberRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore"',
    );
    // After the save is confirmed, never before it.
    expect(FLAT_PLANT_QUICK_LOG).toMatch(
      /toast\.success\("Log saved to timeline\."\);[\s\S]{0,600}rememberRecentQuickLogTarget\(/,
    );
    // Guarded on a real grow, and scoped to the signed-in account.
    expect(FLAT_PLANT_QUICK_LOG).toMatch(
      /if \(growId\) \{ rememberRecentQuickLogTarget\( \{ plantId, growId, tentId: tentId \?\? null,[\s\S]{0,120}user\?\.id \?\? null,/,
    );
  });

  it("Daily Check remembers the plant, and only when the save named one", () => {
    expect(DAILY_CHECK).toContain(
      'import { rememberRecentQuickLogTarget } from "@/lib/quickLogRecentTargetStore"',
    );
    expect(FLAT_DAILY_CHECK).toMatch(
      /onSaveSuccess=\{\(result\) => \{ if \(!result\.target\.plantId\) return; rememberRecentQuickLogTarget\(/,
    );
    // A tent-scoped save must leave the previous record alone, not clear it.
    expect(FLAT_DAILY_CHECK).not.toMatch(
      /onSaveSuccess=\{\(result\) => \{ rememberRecentQuickLogTarget\(/,
    );
  });
});
