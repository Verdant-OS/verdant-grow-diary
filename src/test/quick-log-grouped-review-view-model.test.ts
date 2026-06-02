/**
 * quickLogGroupedReviewViewModel — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_REVIEW_ACTION_SECTION_TITLE,
  QUICK_LOG_REVIEW_CLOSE_LABEL,
  QUICK_LOG_REVIEW_ENVIRONMENT_SECTION_TITLE,
  QUICK_LOG_REVIEW_OPEN_LABEL,
  QUICK_LOG_REVIEW_PANEL_TITLE,
  buildQuickLogReviewActionSection,
  isReviewableQuickLogEntry,
  reviewTriggerLabel,
} from "@/lib/quickLogGroupedReviewViewModel";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

function grouped(
  kind: "water" | "note",
  opts: { noteText?: string | null; volumeMl?: number | null } = {},
): QuickLogTimelineEntry {
  return {
    kind: "grouped",
    occurredAt: "2026-05-01T10:00:00.000Z",
    actionSourceLabel: "Manual",
    environmentSourceLabel: "Manual",
    action: {
      id: "a1",
      kind,
      source: "manual",
      plantId: "p1",
      tentId: "t1",
      occurredAt: "2026-05-01T10:00:00.000Z",
      noteText: opts.noteText ?? null,
      volumeMl: opts.volumeMl ?? null,
    },
    environment: { id: "e1" } as never,
    environmentCard: {} as never,
  };
}

const standaloneAction: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-05-01T10:00:00.000Z",
  actionSourceLabel: "Manual",
  action: {
    id: "a2",
    kind: "water",
    source: "manual",
    plantId: "p1",
    tentId: "t1",
    occurredAt: "2026-05-01T10:00:00.000Z",
  },
};
const standaloneEnv: QuickLogTimelineEntry = {
  kind: "environment",
  occurredAt: "2026-05-01T10:00:00.000Z",
  environmentSourceLabel: "Manual",
  environment: { id: "e9" } as never,
  environmentCard: {} as never,
};

describe("quickLogGroupedReviewViewModel", () => {
  it("exposes honest labels (no 'linked')", () => {
    expect(QUICK_LOG_REVIEW_OPEN_LABEL).toBe("Review details");
    expect(QUICK_LOG_REVIEW_CLOSE_LABEL).toBe("Close details");
    expect(QUICK_LOG_REVIEW_PANEL_TITLE).toBe("Grouped timeline details");
    expect(QUICK_LOG_REVIEW_ACTION_SECTION_TITLE).toBe("QuickLog action");
    expect(QUICK_LOG_REVIEW_ENVIRONMENT_SECTION_TITLE).toBe(
      "Manual environment snapshot",
    );
    expect(QUICK_LOG_REVIEW_PANEL_TITLE).not.toMatch(/linked/i);
    expect(QUICK_LOG_REVIEW_OPEN_LABEL).not.toMatch(/linked/i);
  });

  it("reviewTriggerLabel toggles deterministically", () => {
    expect(reviewTriggerLabel(false)).toBe(QUICK_LOG_REVIEW_OPEN_LABEL);
    expect(reviewTriggerLabel(true)).toBe(QUICK_LOG_REVIEW_CLOSE_LABEL);
  });

  it("isReviewableQuickLogEntry is true only for grouped entries", () => {
    expect(isReviewableQuickLogEntry(grouped("water"))).toBe(true);
    expect(isReviewableQuickLogEntry(standaloneAction)).toBe(false);
    expect(isReviewableQuickLogEntry(standaloneEnv)).toBe(false);
  });

  it("builds an action section with kind label, source Manual, and optional note/volume", () => {
    const w = buildQuickLogReviewActionSection(
      grouped("water", { volumeMl: 250 }),
    );
    expect(w).toEqual({
      kindLabel: "Water",
      occurredAt: "2026-05-01T10:00:00.000Z",
      sourceLabel: "Manual",
      noteText: null,
      volumeMl: 250,
    });

    const n = buildQuickLogReviewActionSection(
      grouped("note", { noteText: "Top dressed." }),
    );
    expect(n).toEqual({
      kindLabel: "Note",
      occurredAt: "2026-05-01T10:00:00.000Z",
      sourceLabel: "Manual",
      noteText: "Top dressed.",
      volumeMl: null,
    });
  });

  it("returns null when the entry is not grouped", () => {
    expect(buildQuickLogReviewActionSection(standaloneAction)).toBeNull();
    expect(buildQuickLogReviewActionSection(standaloneEnv)).toBeNull();
  });

  it("never invents values (missing note/volume stay null)", () => {
    const out = buildQuickLogReviewActionSection(grouped("water"));
    expect(out?.noteText).toBeNull();
    expect(out?.volumeMl).toBeNull();
  });

  it("is pure — does not mutate input", () => {
    const e = grouped("water", { volumeMl: 500, noteText: "x" });
    const snap = JSON.stringify(e);
    buildQuickLogReviewActionSection(e);
    expect(JSON.stringify(e)).toBe(snap);
  });
});
