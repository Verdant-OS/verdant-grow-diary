import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BADGE_AWARD_COPY } from "@/constants/badgeAwardCopy";

describe("badge tent setup harvest migration contract", () => {
  it("earns from earliest subject rows, ignores yield, and keeps evidence scoped", () => {
    const migration = readFileSync(
      "supabase/migrations/20261027235500_badge_awards_tent_setup_harvest.sql",
      "utf8",
    );
    expect(migration).toContain(
      "The account's earliest tent, not the earliest tent that has a photo.",
    );
    expect(migration).toContain(
      "The account's earliest harvest, not the earliest harvest that has a photo.",
    );
    expect(migration).toContain("Does not read yield_grams");
    expect(migration).toContain("harvest_id uuid");
    expect(migration).toContain("subject_kind := 'setup'");
    expect(migration).toContain("badge_awards_evaluate_photo_subject");
    expect(BADGE_AWARD_COPY.firstTent.toLowerCase()).not.toContain("rank");
    expect(BADGE_AWARD_COPY.setupDocumented.toLowerCase()).not.toContain("verified");
    expect(BADGE_AWARD_COPY.firstRecordedHarvest.toLowerCase()).not.toContain("yield");
  });
});
