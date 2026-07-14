/**
 * Contract tests for the learning-loop timeline integration: the three
 * event types render with distinct required labels, are classified together,
 * expose only safe detail keys, and never leak raw join ids.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEventType } from "../lib/diary";
import { classifyTimelineEntry } from "../lib/timelineEntryClassification";

const ROOT = resolve(__dirname, "../..");
const TIMELINE_SRC = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const EVIDENCE_VM_SRC = readFileSync(
  resolve(ROOT, "src/lib/timelineEvidenceDetailViewModel.ts"),
  "utf8",
);

describe("diary.ts event-type registry — required labels", () => {
  it("renders the three learning-loop types with the exact required labels", () => {
    expect(getEventType("action_followup").label).toBe("Follow-up check");
    expect(getEventType("action_outcome").label).toBe("Grower-recorded outcome");
    expect(getEventType("run_learning_decision").label).toBe("Next-run learning decision");
  });

  it("none of the three falls back to the Observation pill", () => {
    for (const t of ["action_followup", "action_outcome", "run_learning_decision"]) {
      expect(getEventType(t).label).not.toBe("Observation");
      expect(getEventType(t).value).toBe(t);
    }
  });
});

describe("timeline classification — the trio stays together, not generic notes", () => {
  it("classifies all three into the reminder (follow-up) bucket, not notes", () => {
    for (const type of ["action_followup", "action_outcome", "run_learning_decision"]) {
      expect(classifyTimelineEntry({ eventType: type })).toBe("reminder");
    }
  });
});

describe("Timeline.tsx — no raw id/token leakage for learning-loop rows", () => {
  it("skips the raw detail-chip loop for learning-loop event types", () => {
    expect(TIMELINE_SRC).toContain("isLearningLoopEvent");
    // The chip loop must be gated so loop rows render [] for `extra`.
    expect(TIMELINE_SRC).toMatch(/isLearningLoopEvent\s*\?\s*\[\]/);
  });

  it("renders friendly back-links via route helpers, never raw ids as text", () => {
    expect(TIMELINE_SRC).toContain("timeline-view-original-action");
    expect(TIMELINE_SRC).toContain("timeline-view-learning-episode");
    expect(TIMELINE_SRC).toContain("actionDetailPath(loopActionId)");
    expect(TIMELINE_SRC).toContain("growLearningPath(loopGrowId)");
  });

  it("surfaces the decision via DECISION_LABELS, never the raw enum-with-ids payload", () => {
    expect(TIMELINE_SRC).toContain("DECISION_LABELS");
    expect(TIMELINE_SRC).toContain("loopDecisionLabel");
  });
});

describe("evidence drawer — safe allowlist only", () => {
  it("labels the two additional event types", () => {
    expect(EVIDENCE_VM_SRC).toMatch(/action_outcome:\s*"Grower-recorded outcome"/);
    expect(EVIDENCE_VM_SRC).toMatch(/run_learning_decision:\s*"Next-run learning decision"/);
  });

  it("adds only safe enum fields to the allowlist — never join ids", () => {
    // decision + outcome_status are safe enums; join ids must NOT be allowlisted.
    expect(EVIDENCE_VM_SRC).toContain('"outcome_status"');
    expect(EVIDENCE_VM_SRC).toContain('"decision"');
    expect(EVIDENCE_VM_SRC).not.toMatch(/SAFE_DETAIL_KEYS[\s\S]*"action_queue_id"/);
    expect(EVIDENCE_VM_SRC).not.toMatch(/SAFE_DETAIL_KEYS[\s\S]*"source_alert_id"/);
    expect(EVIDENCE_VM_SRC).not.toMatch(/SAFE_DETAIL_KEYS[\s\S]*"action_outcome_entry_id"/);
  });
});
