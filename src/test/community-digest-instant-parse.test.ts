import { describe, expect, it } from "vitest";
import { readCommunityInstant } from "@/lib/communityDigestRules";

describe("readCommunityInstant", () => {
  it("parses explicit-offset instants and preserves sub-millisecond digits", () => {
    expect(readCommunityInstant("2026-10-21T09:00:00.123456Z")).toEqual({
      ms: Date.parse("2026-10-21T09:00:00.123Z"),
      subMs: 456_000,
    });
    expect(readCommunityInstant("2026-10-21 09:00:00.000001+00:00")).toEqual({
      ms: Date.parse("2026-10-21T09:00:00.000Z"),
      subMs: 1_000,
    });
  });

  it("rejects timestamps without an explicit offset (host-local ambiguity)", () => {
    expect(readCommunityInstant("2026-10-21T09:00:00")).toBeNull();
    expect(readCommunityInstant("2026-10-21 09:00:00")).toBeNull();
  });

  it("rejects non-strings, impossible dates, and out-of-range clock parts", () => {
    for (const bad of [
      null,
      undefined,
      1,
      "2026-02-30T00:00:00Z",
      "2026-10-21T24:00:00Z",
      "2026-10-21T09:60:00Z",
      "not-a-timestamp",
    ]) {
      expect(readCommunityInstant(bad as unknown as string)).toBeNull();
    }
  });
});
