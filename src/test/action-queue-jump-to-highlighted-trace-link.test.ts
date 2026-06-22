import { describe, it, expect } from "vitest";
import {
  buildJumpToHighlightedTraceLink,
  JUMP_TO_HIGHLIGHTED_TRACE_LABEL,
} from "@/lib/actionQueueTimelineLinkRules";

describe("buildJumpToHighlightedTraceLink", () => {
  it("returns null for missing/invalid tokens", () => {
    expect(buildJumpToHighlightedTraceLink(null)).toBeNull();
    expect(buildJumpToHighlightedTraceLink("")).toBeNull();
    expect(buildJumpToHighlightedTraceLink("garbage")).toBeNull();
    expect(buildJumpToHighlightedTraceLink("action-queue:bad id:approved")).toBeNull();
    expect(buildJumpToHighlightedTraceLink("alerts:abc:approved")).toBeNull();
    expect(buildJumpToHighlightedTraceLink("action-queue:aq-1:other")).toBeNull();
  });

  it("builds a /timeline?highlight=... link for valid approved/rejected tokens", () => {
    const a = buildJumpToHighlightedTraceLink("action-queue:aq-42:approved");
    expect(a).not.toBeNull();
    expect(a!.href).toBe("/timeline?highlight=action-queue%3Aaq-42%3Aapproved");
    expect(a!.label).toBe(JUMP_TO_HIGHLIGHTED_TRACE_LABEL);
    const r = buildJumpToHighlightedTraceLink("action-queue:aq-42:rejected");
    expect(r!.href).toContain("highlight=action-queue%3Aaq-42%3Arejected");
  });

  it("label never includes raw IDs", () => {
    expect(JUMP_TO_HIGHLIGHTED_TRACE_LABEL).not.toMatch(/aq-|uuid|[0-9a-f]{8}-/i);
  });
});
