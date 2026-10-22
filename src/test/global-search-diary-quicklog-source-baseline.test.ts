/**
 * Global search diary spec — Quick Log source baseline (PR #2351 requirement 1).
 *
 * Current writers do not share one companion rule. Naive diary_entries-only
 * search misses live `quicklog_save_event` note-only spines; a substring match
 * of the `'(quick log)'` placeholder treats empty-note mirrors as grower text.
 * Exclusion is `isQuickLogPlaceholderNote` (exact), not `includes("quick")`.
 */
import { describe, expect, it } from "vitest";

import { isQuickLogPlaceholderNote } from "@/lib/plantFeedingDisplayRules";

describe("global search diary Quick Log source baseline", () => {
  it("treats only the exact placeholder as non-authored; 'quick' is a substring trap", () => {
    expect(isQuickLogPlaceholderNote("(quick log)")).toBe(true);
    expect(isQuickLogPlaceholderNote("  (Quick Log)  ")).toBe(true);
    expect(isQuickLogPlaceholderNote("topped in the quick log")).toBe(false);
    expect("(quick log)".toLowerCase().includes("quick")).toBe(true);
  });
});
