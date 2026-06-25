import { describe, it, expect } from "vitest";
import { buildJumpToHighlightedTraceLink } from "@/lib/actionQueueTimelineLinkRules";

describe("buildJumpToHighlightedTraceLink — actionsReturn round-trip", () => {
  const token = "action-queue:aq-42:approved";

  it("appends safe actionsReturn from current /actions params", () => {
    const sp = new URLSearchParams("q=mold&status=pending&page=3&pageSize=25");
    const link = buildJumpToHighlightedTraceLink(token, sp);
    expect(link).not.toBeNull();
    const url = new URL(`http://x${link!.href}`);
    expect(url.searchParams.get("highlight")).toBe(token);
    const ret = url.searchParams.get("actionsReturn") ?? "";
    expect(ret).toContain("/actions?");
    expect(ret).toContain("q=mold");
    expect(ret).toContain("status=pending");
    expect(ret).toContain("page=3");
    expect(ret).toContain("pageSize=25");
    expect(link!.actionsReturn).toBe(ret);
  });

  it("omits actionsReturn when current params carry nothing safe", () => {
    const sp = new URLSearchParams("secret=abc&service_role=zz");
    const link = buildJumpToHighlightedTraceLink(token, sp);
    expect(link).not.toBeNull();
    const url = new URL(`http://x${link!.href}`);
    expect(url.searchParams.get("actionsReturn")).toBeNull();
    expect(link!.actionsReturn).toBeUndefined();
  });

  it("preserves only allow-listed keys (drops unknowns)", () => {
    const sp = new URLSearchParams(
      "q=mold&focus=raw-id&alert=raw-uuid&secret=x",
    );
    const link = buildJumpToHighlightedTraceLink(token, sp);
    const ret = new URL(`http://x${link!.href}`).searchParams.get(
      "actionsReturn",
    ) ?? "";
    expect(ret).toContain("q=mold");
    expect(ret).not.toContain("focus=");
    expect(ret).not.toContain("alert=");
    expect(ret).not.toContain("secret=");
  });

  it("returns null for malformed highlight tokens (irrespective of params)", () => {
    const sp = new URLSearchParams("q=mold");
    expect(buildJumpToHighlightedTraceLink("garbage", sp)).toBeNull();
    expect(
      buildJumpToHighlightedTraceLink("action-queue:bad id:approved", sp),
    ).toBeNull();
  });
});
