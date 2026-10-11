import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BADGE_AWARD_COPY } from "@/constants/badgeAwardCopy";
import { ownerBadgeShelfEnabled } from "@/lib/badgeAwardFlags";
import {
  BADGE_AWARD_PLACEHOLDER_NOTE,
  FIRST_DIARY_ENTRY_BADGE_KEY,
  badgeCopyAvoidsRankLanguage,
  selectVisibleOwnerBadgeAwards,
} from "@/lib/badgeAwardRules";

describe("badge award display rules", () => {
  it("keeps the shelf flag off", () => {
    expect(ownerBadgeShelfEnabled).toBe(false);
  });

  it("uses the Quick Log placeholder sentence the evaluator compares", () => {
    expect(BADGE_AWARD_PLACEHOLDER_NOTE).toBe("Photo attached from Quick Log.");
    expect(FIRST_DIARY_ENTRY_BADGE_KEY).toBe("first_diary_entry");
    const migration = readFileSync(
      "supabase/migrations/20261011120000_owner_badge_awards.sql",
      "utf8",
    );
    expect(migration).toContain("btrim(entry.note) <> 'Photo attached from Quick Log.'");
  });

  it("describes documentation and not skill, rank, yield, safety, or verified", () => {
    expect(badgeCopyAvoidsRankLanguage(Object.values(BADGE_AWARD_COPY))).toBe(true);
  });

  it("shows only a visible first diary entry award", () => {
    const awards = [
      { badgeKey: "first_diary_entry", hiddenAt: null },
      { badgeKey: "first_diary_entry", hiddenAt: "2026-10-10T00:00:00Z" },
      { badgeKey: "first_tent", hiddenAt: null },
    ];
    expect(selectVisibleOwnerBadgeAwards(awards)).toEqual([
      { badgeKey: "first_diary_entry", hiddenAt: null },
    ]);
  });

  it("returns no shelf rows for null hidden markers that are not this badge", () => {
    expect(selectVisibleOwnerBadgeAwards([])).toEqual([]);
    expect(
      selectVisibleOwnerBadgeAwards([{ badgeKey: "first_recorded_harvest", hiddenAt: null }]),
    ).toEqual([]);
  });
});
