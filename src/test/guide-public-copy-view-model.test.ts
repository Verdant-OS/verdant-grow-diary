import { describe, expect, it } from "vitest";

import { isPublicGuideHref, splitAroundAnchor } from "@/lib/guidePublicCopyViewModel";

describe("splitAroundAnchor", () => {
  it("returns plain text with no link target when the anchor is missing", () => {
    const split = splitAroundAnchor("See plans.", undefined);
    expect(split).toEqual({ kind: "plain", text: "See plans." });
    expect("href" in split).toBe(false);
  });

  it("returns plain text with no link target when the href is not public", () => {
    const split = splitAroundAnchor("See plans.", { label: "plans", href: "javascript:x" });
    expect(split).toEqual({ kind: "plain", text: "See plans." });
  });

  it("returns plain text with no link target when the label is not in the copy", () => {
    const split = splitAroundAnchor("See pricing.", { label: "plans", href: "/pricing" });
    expect(split).toEqual({ kind: "plain", text: "See pricing." });
  });

  it("splits around a matched public anchor", () => {
    expect(splitAroundAnchor("See plans now.", { label: "plans", href: "/pricing" })).toEqual({
      kind: "linked",
      text: "See plans now.",
      before: "See ",
      label: "plans",
      href: "/pricing",
      after: " now.",
    });
  });
});

describe("isPublicGuideHref", () => {
  it("rejects empty, protocol-relative and foreign URLs", () => {
    expect(isPublicGuideHref("")).toBe(false);
    expect(isPublicGuideHref("//evil.example")).toBe(false);
    expect(isPublicGuideHref("https://evil.example/auth")).toBe(false);
    expect(isPublicGuideHref("/pricing")).toBe(true);
    expect(isPublicGuideHref("https://verdantgrowdiary.com/auth?mode=signup")).toBe(true);
  });
});
