import { describe, expect, it } from "vitest";
import { readCommunityInstant } from "@/lib/communityDigestRules";

/**
 * Extra instant-parse cases kept out of community-digest-instant-parse.test.ts
 * (scorer-locked with PR #2301 / #2375). Covers compact offsets and short fractions.
 */
describe("readCommunityInstant supplement", () => {
  it("rejects empty and whitespace-only strings", () => {
    for (const bad of ["", "   "]) {
      expect(readCommunityInstant(bad)).toBeNull();
    }
  });

  it("accepts compact numeric offsets without a colon", () => {
    const withColon = readCommunityInstant("2026-10-21T09:00:00+05:30");
    const compact = readCommunityInstant("2026-10-21T09:00:00+0530");
    expect(withColon).not.toBeNull();
    expect(compact).toEqual(withColon);
  });

  it("treats one- and two-digit fractional seconds as whole milliseconds only", () => {
    expect(readCommunityInstant("2026-10-21T09:00:00.1Z")).toEqual({
      ms: Date.parse("2026-10-21T09:00:00.1Z"),
      subMs: 0,
    });
    expect(readCommunityInstant("2026-10-21T09:00:00.12Z")).toEqual({
      ms: Date.parse("2026-10-21T09:00:00.12Z"),
      subMs: 0,
    });
  });
});
