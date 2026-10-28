/**
 * Global search diary spec — merge-order hazard (docs/specs/global-search-diary-entries.md requirement 7).
 *
 * `mergeGlobalSearchResults` sorts same-type equal-rank rows by label, then
 * arrival index. Diary excerpts that share rank/score would therefore render
 * alphabetically, not newest-first. The implementing slice must compose diary
 * rows after that merge and assert the final list, not only the helper.
 */
import { describe, expect, it } from "vitest";

import { mergeGlobalSearchResults, type PrivateSearchRow } from "@/lib/globalSearchResults";

const equalRankPlant = (id: string, label: string): PrivateSearchRow => ({
  entity_type: "plant",
  id,
  label,
  sublabel: "",
  match_kind: "exact",
  rank: 0,
  score: 1,
});

describe("global search diary merge-order hazard", () => {
  it("puts equal-rank 'alpha' before newer 'zeta' when both go through mergeGlobalSearchResults", () => {
    const entity: PrivateSearchRow = {
      entity_type: "grow",
      id: "g1",
      label: "Alpha Grow",
      sublabel: "",
      match_kind: "exact",
      rank: 0,
      score: 1,
    };
    const newerZeta = equalRankPlant("newer-zeta", "zeta yellow leaves");
    const olderAlpha = equalRankPlant("older-alpha", "alpha yellow leaves");

    const merged = mergeGlobalSearchResults([entity, newerZeta, olderAlpha], []);

    expect(merged.map((row) => row.id)).toEqual(["g1", "older-alpha", "newer-zeta"]);
  });
});
