import { describe, it, expect } from "vitest";
import {
  parseTimelineHighlightToken,
  diaryEntryMatchesHighlight,
  highlightIsMissingFromList,
  TIMELINE_HIGHLIGHT_NOT_VISIBLE_COPY,
  TIMELINE_HIGHLIGHT_ARIA_LABEL,
} from "@/lib/timelineHighlightRules";

const KIND = "action_queue_trace" as const;
const ACTION_ID = "aq-42";
const KEY_APPROVED = `action-queue:${ACTION_ID}:approved`;
const KEY_REJECTED = `action-queue:${ACTION_ID}:rejected`;

function entry(extra: Record<string, unknown> = {}) {
  return {
    id: "diary-1",
    entry_at: "2024-01-01T00:00:00.000Z",
    details: {
      kind: KIND,
      idempotency_key: KEY_APPROVED,
      trace_kind: "approved",
      action_id: ACTION_ID,
      ...extra,
    },
  };
}

describe("parseTimelineHighlightToken", () => {
  it("parses approved/rejected tokens", () => {
    const a = parseTimelineHighlightToken(KEY_APPROVED);
    expect(a?.actionId).toBe(ACTION_ID);
    expect(a?.traceKind).toBe("approved");
    expect(a?.idempotencyKey).toBe(KEY_APPROVED);
    const r = parseTimelineHighlightToken(KEY_REJECTED);
    expect(r?.traceKind).toBe("rejected");
  });

  it("rejects malformed / unsafe tokens", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "garbage",
      "action-queue:aq-1",
      "action-queue:aq-1:wat",
      "other:aq-1:approved",
      `action-queue:${"x".repeat(100)}:approved`,
      "action-queue:has space:approved",
      "action-queue:../../etc:approved",
    ]) {
      expect(parseTimelineHighlightToken(bad as string)).toBeNull();
    }
  });
});

describe("diaryEntryMatchesHighlight", () => {
  it("matches only when details.idempotency_key equals the token", () => {
    const h = parseTimelineHighlightToken(KEY_APPROVED);
    expect(diaryEntryMatchesHighlight(entry(), h)).toBe(true);
    expect(
      diaryEntryMatchesHighlight(entry({ idempotency_key: KEY_REJECTED }), h),
    ).toBe(false);
  });

  it("never matches by visible note text alone", () => {
    const h = parseTimelineHighlightToken(KEY_APPROVED);
    const noteOnly = {
      details: { kind: "other", note: `Action approved ${KEY_APPROVED}` },
    };
    expect(diaryEntryMatchesHighlight(noteOnly, h)).toBe(false);
  });

  it("returns false for null highlight or missing details", () => {
    expect(diaryEntryMatchesHighlight(entry(), null)).toBe(false);
    expect(diaryEntryMatchesHighlight(null, parseTimelineHighlightToken(KEY_APPROVED))).toBe(false);
    expect(
      diaryEntryMatchesHighlight({ details: null }, parseTimelineHighlightToken(KEY_APPROVED)),
    ).toBe(false);
  });

});

describe("highlightIsMissingFromList", () => {
  it("returns false when at least one entry matches", () => {
    const h = parseTimelineHighlightToken(KEY_APPROVED);
    expect(highlightIsMissingFromList([entry()], h)).toBe(false);
  });
  it("returns true when highlight is set and nothing matches", () => {
    const h = parseTimelineHighlightToken(KEY_APPROVED);
    expect(
      highlightIsMissingFromList(
        [entry({ idempotency_key: KEY_REJECTED })],
        h,
      ),
    ).toBe(true);
  });
  it("returns false when no highlight is requested", () => {
    expect(highlightIsMissingFromList([entry()], null)).toBe(false);
  });
});

describe("user-visible highlight copy", () => {
  it("never exposes raw action ids or back-pointer tokens", () => {
    const blob = [TIMELINE_HIGHLIGHT_ARIA_LABEL, TIMELINE_HIGHLIGHT_NOT_VISIBLE_COPY].join(" ");
    expect(blob.includes(ACTION_ID)).toBe(false);
    expect(blob.includes("action-queue:")).toBe(false);
    expect(blob.toLowerCase().includes("uuid")).toBe(false);
  });
});
