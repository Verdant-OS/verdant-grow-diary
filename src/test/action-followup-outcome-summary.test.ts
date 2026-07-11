/**
 * Slice 4a — Shared follow-up outcome label integration across diary
 * and timeline summary surfaces.
 *
 * Verifies:
 *  - The shared `actionFollowUpOutcomeLabel` helper maps every
 *    grower-selectable outcome and rejects invalid / missing values.
 *  - `composeActionFollowUpTitle` produces "Follow-up · <Outcome>" for
 *    valid outcomes and the legacy "Follow-up" for missing/invalid.
 *  - `diaryTimelineActionLabel` renders the same shared mapping for
 *    `action_followup` kinds and preserves backward-compatible legacy
 *    behavior for callers that don't pass `details`.
 *  - `growDiaryTimelineRules.toTimelineItem` renders the same shared
 *    mapping in the title field when `details.extras.outcome` is
 *    present, and preserves the legacy "Follow-up" title otherwise.
 *  - Outcome is never labeled as AI or device execution.
 *  - Outcome ordering is deterministic — no hidden branch reorders
 *    the mapping.
 */
import { describe, it, expect } from "vitest";
import {
  actionFollowUpOutcomeLabel,
  composeActionFollowUpTitle,
  ACTION_FOLLOWUP_LEGACY_LABEL,
} from "@/lib/actionFollowUpEvidenceViewModel";
import { diaryTimelineActionLabel } from "@/lib/diaryTimelineViewModel";
import { toTimelineItem } from "@/lib/growDiaryTimelineRules";
import { normalizeDiaryEntry } from "@/lib/diaryEntryRules";
import { ACTION_FOLLOWUP_OUTCOMES } from "@/lib/actionFollowUpEvidenceRules";

const EXPECTED_LABELS: Record<string, string> = {
  improved: "Improved",
  unchanged: "No clear change",
  declined: "Declined",
  too_soon: "Too soon to tell",
  unclear: "Unclear",
};

describe("actionFollowUpOutcomeLabel — shared mapping", () => {
  it.each(Object.entries(EXPECTED_LABELS))(
    "maps %s → %s",
    (outcome, label) => {
      expect(actionFollowUpOutcomeLabel(outcome)).toBe(label);
    },
  );

  it("returns null for missing outcome", () => {
    expect(actionFollowUpOutcomeLabel(undefined)).toBeNull();
    expect(actionFollowUpOutcomeLabel(null)).toBeNull();
  });

  it("returns null for invalid outcome (never leaks unknown labels)", () => {
    expect(actionFollowUpOutcomeLabel("succeeded")).toBeNull();
    expect(actionFollowUpOutcomeLabel("AI-inferred")).toBeNull();
    expect(actionFollowUpOutcomeLabel(42)).toBeNull();
    expect(actionFollowUpOutcomeLabel({})).toBeNull();
  });

  it("covers every canonical outcome exactly once (no drift)", () => {
    const covered = new Set(Object.keys(EXPECTED_LABELS));
    for (const o of ACTION_FOLLOWUP_OUTCOMES) {
      expect(covered.has(o)).toBe(true);
    }
    expect(covered.size).toBe(ACTION_FOLLOWUP_OUTCOMES.length);
  });

  it("never labels the outcome as AI or automation", () => {
    for (const o of ACTION_FOLLOWUP_OUTCOMES) {
      const label = actionFollowUpOutcomeLabel(o) ?? "";
      expect(label.toLowerCase()).not.toContain("ai");
      expect(label.toLowerCase()).not.toContain("auto");
      expect(label.toLowerCase()).not.toContain("device");
    }
  });
});

describe("composeActionFollowUpTitle — shared title builder", () => {
  it("emits Follow-up · <Outcome> for valid outcomes", () => {
    expect(composeActionFollowUpTitle("improved")).toBe("Follow-up · Improved");
    expect(composeActionFollowUpTitle("declined")).toBe("Follow-up · Declined");
    expect(composeActionFollowUpTitle("too_soon")).toBe(
      "Follow-up · Too soon to tell",
    );
  });

  it("falls back to legacy marker for missing outcome", () => {
    expect(composeActionFollowUpTitle(undefined)).toBe(
      ACTION_FOLLOWUP_LEGACY_LABEL,
    );
    expect(composeActionFollowUpTitle(null)).toBe(ACTION_FOLLOWUP_LEGACY_LABEL);
  });

  it("falls back to legacy marker for invalid outcome", () => {
    expect(composeActionFollowUpTitle("succeeded")).toBe(
      ACTION_FOLLOWUP_LEGACY_LABEL,
    );
    expect(composeActionFollowUpTitle(123)).toBe(ACTION_FOLLOWUP_LEGACY_LABEL);
  });
});

describe("diaryTimelineActionLabel — action_followup outcome integration", () => {
  it("renders the shared outcome label when details.outcome is valid", () => {
    expect(
      diaryTimelineActionLabel("action_followup", { outcome: "improved" }),
    ).toBe("Follow-up · Improved");
    expect(
      diaryTimelineActionLabel("action_followup", { outcome: "unchanged" }),
    ).toBe("Follow-up · No clear change");
    expect(
      diaryTimelineActionLabel("action_followup", { outcome: "unclear" }),
    ).toBe("Follow-up · Unclear");
  });

  it("preserves legacy marker when details is omitted", () => {
    expect(diaryTimelineActionLabel("action_followup")).toBe("Follow-up");
  });

  it("preserves legacy marker for invalid outcome", () => {
    expect(
      diaryTimelineActionLabel("action_followup", { outcome: "bogus" }),
    ).toBe("Follow-up");
  });

  it("leaves other kinds untouched", () => {
    expect(diaryTimelineActionLabel("watering")).toBe("Watering");
    expect(diaryTimelineActionLabel("harvest")).toBe("Harvest");
  });
});

describe("growDiaryTimelineRules.toTimelineItem — action_followup title", () => {
  const RAW_BASE = {
    id: "e-1",
    grow_id: "g-1",
    plant_id: "p-1",
    tent_id: "t-1",
    event_type: "action_followup",
    created_at: "2026-07-11T12:00:00Z",
    stage: "veg",
    note: "",
  };

  it("renders Follow-up · <Outcome> when outcome is present in details", () => {
    const normalized = normalizeDiaryEntry({
      ...RAW_BASE,
      details: {
        event_type: "action_followup",
        action_queue_id: "aq-1",
        outcome: "improved",
        observed_at: "2026-07-11T12:00:00Z",
      },
    });
    const item = toTimelineItem(normalized);
    expect(item.title).toBe("Follow-up · Improved");
  });

  it("renders legacy Follow-up for marker-only entries (no outcome)", () => {
    const normalized = normalizeDiaryEntry({
      ...RAW_BASE,
      details: {
        event_type: "action_followup",
        action_queue_id: "aq-1",
      },
    });
    const item = toTimelineItem(normalized);
    expect(item.title).toBe("Follow-up");
  });

  it("renders legacy Follow-up when details.outcome is invalid", () => {
    const normalized = normalizeDiaryEntry({
      ...RAW_BASE,
      details: {
        event_type: "action_followup",
        outcome: "AI-inferred",
      },
    });
    const item = toTimelineItem(normalized);
    expect(item.title).toBe("Follow-up");
  });

  it("does not affect non-followup event titles", () => {
    const normalized = normalizeDiaryEntry({
      ...RAW_BASE,
      event_type: "watering",
      details: {},
    });
    const item = toTimelineItem(normalized);
    expect(item.title).toBe("Watering");
  });
});
