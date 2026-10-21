import { describe, expect, it } from "vitest";
import {
  COMMUNITY_RESERVED_USERNAMES,
  normalizeCommunityProfile,
} from "@/lib/communityProfileRules";
import type { CommunityProfileDraft } from "@/lib/communityTypes";

const draft = (overrides: Partial<CommunityProfileDraft> = {}): CommunityProfileDraft => ({
  username: "grower_1",
  displayName: "Grower One",
  bio: "",
  ...overrides,
});

describe("community profile rules", () => {
  it("trims and lowercases the username", () => {
    expect(normalizeCommunityProfile(draft({ username: " AbC_12 " }))).toEqual({
      ok: true,
      value: { username: "abc_12", displayName: "Grower One", bio: "" },
    });
  });

  it("accepts usernames of exactly 3 and 30 characters", () => {
    expect(normalizeCommunityProfile(draft({ username: "abc" })).ok).toBe(true);
    expect(normalizeCommunityProfile(draft({ username: "a".repeat(30) })).ok).toBe(true);
  });

  it("rejects too-short, too-long, empty and non-ASCII usernames", () => {
    for (const username of ["ab", "a".repeat(31), "", "   ", "grôwer", "grower-1", "gro wer"]) {
      expect(normalizeCommunityProfile(draft({ username }))).toEqual({
        ok: false,
        code: "invalid",
      });
    }
  });

  it("rejects every reserved username, whatever its case or padding", () => {
    expect([...COMMUNITY_RESERVED_USERNAMES].sort()).toEqual([
      "admin",
      "deleted",
      "moderator",
      "support",
      "system",
      "verdant",
    ]);
    for (const reserved of COMMUNITY_RESERVED_USERNAMES) {
      expect(normalizeCommunityProfile(draft({ username: ` ${reserved.toUpperCase()} ` }))).toEqual(
        { ok: false, code: "invalid" },
      );
    }
  });

  it("requires a display name of 1 to 60 characters after trimming", () => {
    expect(normalizeCommunityProfile(draft({ displayName: "  Ann  " }))).toEqual({
      ok: true,
      value: { username: "grower_1", displayName: "Ann", bio: "" },
    });
    expect(normalizeCommunityProfile(draft({ displayName: "x".repeat(60) })).ok).toBe(true);
    expect(normalizeCommunityProfile(draft({ displayName: "x".repeat(61) })).ok).toBe(false);
    expect(normalizeCommunityProfile(draft({ displayName: "   " })).ok).toBe(false);
  });

  it("counts characters, not UTF-16 units, at the display name and bio limits", () => {
    expect(normalizeCommunityProfile(draft({ displayName: "🌱".repeat(60) })).ok).toBe(true);
    expect(normalizeCommunityProfile(draft({ displayName: "🌱".repeat(61) })).ok).toBe(false);
    expect(normalizeCommunityProfile(draft({ bio: "🌱".repeat(280) })).ok).toBe(true);
  });

  it("allows an empty bio and caps it at 280 characters", () => {
    expect(normalizeCommunityProfile(draft({ bio: "  " }))).toEqual({
      ok: true,
      value: { username: "grower_1", displayName: "Grower One", bio: "" },
    });
    expect(normalizeCommunityProfile(draft({ bio: "b".repeat(280) })).ok).toBe(true);
    expect(normalizeCommunityProfile(draft({ bio: "b".repeat(281) })).ok).toBe(false);
  });

  it("keeps markup as plain text and does not mutate the input", () => {
    const input = draft({ displayName: "<b>Ann</b>", bio: "<script>x</script>" });
    const snapshot = { ...input };
    const result = normalizeCommunityProfile(input);
    expect(result).toEqual({
      ok: true,
      value: { username: "grower_1", displayName: "<b>Ann</b>", bio: "<script>x</script>" },
    });
    expect(input).toEqual(snapshot);
  });

  it("returns the same result for the same input", () => {
    const input = draft({ username: " Repeat_Me " });
    expect(normalizeCommunityProfile(input)).toEqual(normalizeCommunityProfile(input));
  });
});
