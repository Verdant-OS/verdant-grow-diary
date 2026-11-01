import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BADGE_AWARD_COPY } from "@/constants/badgeAwardCopy";
import { ownerBadgeShelfEnabled } from "@/lib/badgeAwardFlags";
import { isOwnerBadgeLocalSupabaseHost } from "@/lib/badgeAwardLocalHostRules";
import {
  FIRST_DIARY_ENTRY_BADGE_KEY,
  badgeCopyAvoidsRankLanguage,
  selectVisibleOwnerBadgeAwards,
} from "@/lib/badgeAwardRules";

describe("badge award display rules", () => {
  it("keeps the shelf flag off", () => {
    expect(ownerBadgeShelfEnabled).toBe(false);
  });

  it("accepts bracketed IPv6 loopback and refuses every other host", () => {
    expect(new URL("http://[::1]:54321").hostname).toBe("[::1]");
    expect(isOwnerBadgeLocalSupabaseHost("[::1]")).toBe(true);
    expect(isOwnerBadgeLocalSupabaseHost("::1")).toBe(true);
    expect(isOwnerBadgeLocalSupabaseHost("127.0.0.1")).toBe(true);
    expect(isOwnerBadgeLocalSupabaseHost("localhost")).toBe(true);
    expect(isOwnerBadgeLocalSupabaseHost("verdantgrowdiary.com")).toBe(false);
    expect(isOwnerBadgeLocalSupabaseHost("example.com")).toBe(false);
  });

  it("qualifies any owned diary photo and does not read the note", () => {
    expect(FIRST_DIARY_ENTRY_BADGE_KEY).toBe("first_diary_entry");
    expect(BADGE_AWARD_COPY.firstDiaryEntry).toBe("You saved a diary entry with a photo attached.");
    expect(BADGE_AWARD_COPY.firstDiaryEntry.toLowerCase()).not.toContain("relevant photo");
    const migration = readFileSync(
      "supabase/migrations/20261027235000_owner_badge_awards.sql",
      "utf8",
    );
    expect(migration).toContain("added later to that same entry qualifies on the next evaluation");
    expect(migration).not.toContain("btrim(entry.note)");
    expect(migration).not.toContain("Photo attached from Quick Log.");
    expect(migration).toContain("grow.user_id = uid");
    expect(migration).toContain("object.owner = badge_awards_owned_diary_photo_name.owner_id");
    expect(migration).toContain("IF revoked_at IS NOT NULL THEN");
    expect(migration).toContain(
      "GRANT UPDATE (revoked_at) ON TABLE public.badge_awards TO service_role",
    );
    expect(migration).toContain("subject_kind IN ('diary_entry', 'tent', 'setup', 'harvest')");
    expect(migration).toContain("'setup_documented'");
    expect(migration).toContain("'first_recorded_harvest'");
  });

  it("describes documentation and not skill, rank, yield, safety, or verified", () => {
    expect(badgeCopyAvoidsRankLanguage(Object.values(BADGE_AWARD_COPY))).toBe(true);
  });

  it("shows only a visible first diary entry award", () => {
    const awards = [
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: null,
        userId: "user-shelf-a",
      },
      { badgeKey: "first_diary_entry", hiddenAt: "2026-10-10T00:00:00Z", userId: "user-shelf-a" },
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: "2026-10-10T00:00:00Z",
        userId: "user-shelf-a",
      },
      { badgeKey: "first_tent", hiddenAt: null, userId: "user-shelf-a" },
    ];
    expect(selectVisibleOwnerBadgeAwards(awards, "user-shelf-a")).toEqual([
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: null,
        userId: "user-shelf-a",
      },
    ]);
  });

  it("returns no shelf rows for null hidden markers that are not this badge", () => {
    expect(selectVisibleOwnerBadgeAwards([], "user-shelf-a")).toEqual([]);
    expect(
      selectVisibleOwnerBadgeAwards(
        [{ badgeKey: "first_recorded_harvest", hiddenAt: null, userId: "user-shelf-a" }],
        "user-shelf-a",
      ),
    ).toEqual([]);
  });

  it("returns no shelf rows when the owner user id is null or undefined", () => {
    const awards = [
      {
        badgeKey: "first_diary_entry",
        hiddenAt: null,
        revokedAt: null,
        userId: "user-shelf-a",
      },
    ];
    expect(selectVisibleOwnerBadgeAwards(awards, null)).toEqual([]);
    expect(selectVisibleOwnerBadgeAwards(awards, undefined)).toEqual([]);
    expect(selectVisibleOwnerBadgeAwards(awards)).toEqual([]);
  });

  it("returns no shelf rows when the owner user id is empty", () => {
    expect(
      selectVisibleOwnerBadgeAwards(
        [
          {
            badgeKey: "first_diary_entry",
            hiddenAt: null,
            revokedAt: null,
            userId: "user-shelf-a",
          },
        ],
        "",
      ),
    ).toEqual([]);
  });
});
