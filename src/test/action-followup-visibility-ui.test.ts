/**
 * Extends action_followup timeline visibility:
 *  - DiaryEntryBadges renders "24h re-check" caption
 *  - Timeline page exposes a "Follow-ups" filter chip
 *  - ActionDetail surfaces a "View follow-up diary entry" link
 *  - Static safety: no writes, no device control, etc.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BADGES = readFileSync(resolve(ROOT, "src/components/DiaryEntryBadges.tsx"), "utf8");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

describe("DiaryEntryBadges — follow-up caption", () => {
  it("renders 24h re-check + safe caption for action_followup tag", () => {
    expect(BADGES).toMatch(/normalizeFollowupKindLabel\("24h_recheck"\)/);
    expect(BADGES).toMatch(/FOLLOWUP_SAFE_CAPTION/);
    expect(BADGES).toMatch(/diary-entry-followup-caption/);
  });
  it("preserves existing action_outcome tag mapping", () => {
    expect(BADGES).toMatch(/action_outcome:\s*"Outcome"/);
    expect(BADGES).toContain('"action_outcome"');
  });
  it("does not claim causation/resolution", () => {
    expect(BADGES).not.toMatch(/\b(fixed|resolved|confirmed by verdant|proven)\b/i);
  });
});

describe("Timeline — Follow-ups filter chip", () => {
  it("registers followup in EventFilter and detects action_followup entries", () => {
    expect(TIMELINE).toMatch(/"followup"/);
    expect(TIMELINE).toMatch(/=== "action_followup"/);
  });
  it("renders a Follow-ups chip with count", () => {
    expect(TIMELINE).toMatch(/label="Follow-ups"/);
    expect(TIMELINE).toMatch(/count=\{eventCounts\.followup\}/);
  });
  it("preserves existing stage + event filters (does not replace them)", () => {
    expect(TIMELINE).toMatch(/stageFilter !== "all"/);
    expect(TIMELINE).toMatch(/eventFilter !== "all"/);
  });
});

describe("ActionDetail — view follow-up link", () => {
  it("renders a link to logs when followupEntryId is set", () => {
    expect(ACTION_DETAIL).toMatch(/data-testid="followup-link"/);
    expect(ACTION_DETAIL).toMatch(/View follow-up diary entry/);
    expect(ACTION_DETAIL).toMatch(/logsPath\(row\.grow_id\)/);
  });
  it("only shows it inside the completed section", () => {
    expect(ACTION_DETAIL).toMatch(/row\.status === "completed"[\s\S]{0,4000}followup-link/);
  });
  it("uses 24h re-check + recorded-after-action-completion wording", () => {
    expect(ACTION_DETAIL).toMatch(/24h re-check/);
    expect(ACTION_DETAIL).toMatch(/Recorded after action completion/);
  });
  it("does not insert diary_entries from the follow-up link path", () => {
    // The only allowed diary insert is the existing completion follow-up path.
    // The link path itself must not introduce new inserts.
    const linkSegment = ACTION_DETAIL.split('data-testid="followup-link"')[1] ?? "";
    expect(linkSegment.slice(0, 600)).not.toMatch(/\.insert\(/);
  });
});

describe("ActionDetail — duplicate completion idempotency contract", () => {
  it("looks up existing action_followup by event_type + action_queue_id", () => {
    expect(ACTION_DETAIL).toMatch(/event_type:\s*ACTION_FOLLOWUP_EVENT_TYPE/);
    expect(ACTION_DETAIL).toMatch(/action_queue_id:\s*row\.id/);
  });
  it("uses followupMatchesAction before inserting", () => {
    expect(ACTION_DETAIL).toMatch(/followupMatchesAction\(/);
  });
  it("never includes user_id in the follow-up insert payload", () => {
    // Tighten to insert object literal only — comments mentioning user_id are fine.
    const insertBlocks = ACTION_DETAIL.match(/\.insert\(\{[\s\S]{0,400}?\}\)/g) ?? [];
    for (const block of insertBlocks) {
      expect(block).not.toMatch(/\buser_id\s*:/);
    }
  });
});

describe("static safety", () => {
  it("no service_role / device-control / automation strings introduced", () => {
    const ALL = BADGES + TIMELINE + ACTION_DETAIL;
    expect(ALL).not.toMatch(/service_role/i);
    expect(ALL).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
