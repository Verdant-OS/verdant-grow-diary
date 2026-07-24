import { describe, expect, it } from "vitest";
import {
  countUpdatedFollows,
  hasCultivarGuideUpdate,
  summarizeFollowedUpdates,
  type CultivarFollowRow,
} from "@/lib/cultivarFollowRules";

describe("hasCultivarGuideUpdate", () => {
  it("is true only when current version is strictly newer", () => {
    expect(hasCultivarGuideUpdate(1, 2)).toBe(true);
    expect(hasCultivarGuideUpdate(2, 2)).toBe(false);
    expect(hasCultivarGuideUpdate(3, 2)).toBe(false);
  });
  it("guards non-finite input", () => {
    expect(hasCultivarGuideUpdate(NaN, 2)).toBe(false);
    expect(hasCultivarGuideUpdate(1, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("summarizeFollowedUpdates", () => {
  const follows: CultivarFollowRow[] = [
    { cultivarSlug: "og-kush", seenGuideVersion: 1 },
    { cultivarSlug: "gg4", seenGuideVersion: 2 },
    { cultivarSlug: "unpublished-x", seenGuideVersion: 1 },
  ];
  const versions = { "og-kush": 3, gg4: 2, "blue-dream": 1 };

  it("drops follows whose slug is no longer published", () => {
    const rows = summarizeFollowedUpdates(follows, versions);
    expect(rows.map((r) => r.cultivarSlug)).not.toContain("unpublished-x");
    expect(rows).toHaveLength(2);
  });

  it("orders updated follows first, then by slug", () => {
    const rows = summarizeFollowedUpdates(follows, versions);
    expect(rows[0]).toMatchObject({ cultivarSlug: "og-kush", hasUpdate: true });
    expect(rows[1]).toMatchObject({ cultivarSlug: "gg4", hasUpdate: false });
  });

  it("counts pending updates", () => {
    expect(countUpdatedFollows(follows, versions)).toBe(1);
    expect(countUpdatedFollows([], versions)).toBe(0);
  });
});
