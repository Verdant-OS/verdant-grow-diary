/**
 * Tests for related-action outcome surfacing on AlertDetail.
 *
 * - Pure rules: label mapping, normalization, latest-pick, summary counts.
 * - Static AlertDetail wiring: query shape, render hooks, copy safety.
 * - Safety: no automation/device strings, no service_role, no user_id in
 *   payloads, no inserts/updates/deletes on diary_entries/alerts/action_queue
 *   from the new code path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  OUTCOME_STATUS_LABEL,
  UNKNOWN_OUTCOME_LABEL,
  normalizeOutcomeStatusLabel,
  pickLatestOutcomeForAction,
  summarizeRelatedActionOutcomes,
  type RawOutcomeDiaryRow,
} from "@/lib/relatedActionOutcomeRules";
import { OUTCOME_STATUSES } from "@/lib/actionOutcomeRules";

const ROOT = resolve(__dirname, "../..");
const ALERT_DETAIL = readFileSync(resolve(ROOT, "src/pages/AlertDetail.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/relatedActionOutcomeRules.ts"), "utf8");

function outcomeRow(o: Partial<RawOutcomeDiaryRow["details"]> & {
  id?: string;
  entry_at?: string | null;
  created_at?: string | null;
  note?: string | null;
}): RawOutcomeDiaryRow {
  const { id, entry_at, created_at, note, ...details } = o;
  return {
    id: id ?? "diary-1",
    entry_at: entry_at ?? null,
    created_at: created_at ?? null,
    note: note ?? null,
    details: {
      event_type: "action_outcome",
      outcome_kind: "24h_recheck",
      ...details,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Label mapping
// ---------------------------------------------------------------------------
describe("OUTCOME_STATUS_LABEL", () => {
  it("maps all four canonical statuses", () => {
    expect(OUTCOME_STATUS_LABEL.improved).toBe("Improved");
    expect(OUTCOME_STATUS_LABEL.unchanged).toBe("Unchanged");
    expect(OUTCOME_STATUS_LABEL.worsened).toBe("Worsened");
    expect(OUTCOME_STATUS_LABEL.more_data_needed).toBe("More data needed");
  });

  it("covers every OUTCOME_STATUSES value", () => {
    for (const s of OUTCOME_STATUSES) {
      expect(OUTCOME_STATUS_LABEL[s]).toBeTruthy();
    }
  });
});

describe("normalizeOutcomeStatusLabel", () => {
  it("returns canonical label for valid values", () => {
    expect(normalizeOutcomeStatusLabel("improved")).toBe("Improved");
  });

  it("returns Unknown outcome for invalid values", () => {
    expect(normalizeOutcomeStatusLabel("magic")).toBe(UNKNOWN_OUTCOME_LABEL);
    expect(normalizeOutcomeStatusLabel(undefined)).toBe(UNKNOWN_OUTCOME_LABEL);
    expect(normalizeOutcomeStatusLabel(null)).toBe(UNKNOWN_OUTCOME_LABEL);
    expect(normalizeOutcomeStatusLabel(42)).toBe(UNKNOWN_OUTCOME_LABEL);
  });
});

// ---------------------------------------------------------------------------
// 2. pickLatestOutcomeForAction
// ---------------------------------------------------------------------------
describe("pickLatestOutcomeForAction", () => {
  it("ignores non-action_outcome rows", () => {
    const rows: RawOutcomeDiaryRow[] = [
      {
        id: "x",
        details: {
          event_type: "watering",
          action_queue_id: "a1",
          outcome_kind: "24h_recheck",
          outcome_status: "improved",
        },
      },
    ];
    expect(pickLatestOutcomeForAction(rows, "a1")).toBeNull();
  });

  it("ignores wrong action_queue_id", () => {
    const rows = [outcomeRow({ action_queue_id: "other", outcome_status: "improved" })];
    expect(pickLatestOutcomeForAction(rows, "a1")).toBeNull();
  });

  it("ignores wrong outcome_kind", () => {
    const rows: RawOutcomeDiaryRow[] = [
      {
        id: "x",
        details: {
          event_type: "action_outcome",
          action_queue_id: "a1",
          outcome_kind: "ai_guess",
          outcome_status: "improved",
        },
      },
    ];
    expect(pickLatestOutcomeForAction(rows, "a1")).toBeNull();
  });

  it("chooses newest by recorded_at", () => {
    const rows = [
      outcomeRow({
        id: "older",
        action_queue_id: "a1",
        outcome_status: "unchanged",
        recorded_at: "2026-05-20T10:00:00.000Z",
      }),
      outcomeRow({
        id: "newer",
        action_queue_id: "a1",
        outcome_status: "improved",
        recorded_at: "2026-05-25T10:00:00.000Z",
      }),
    ];
    const picked = pickLatestOutcomeForAction(rows, "a1");
    expect(picked?.diary_entry_id).toBe("newer");
    expect(picked?.outcome_status).toBe("improved");
    expect(picked?.label).toBe("Improved");
  });

  it("falls back to entry_at then created_at when recorded_at missing", () => {
    const rows = [
      outcomeRow({
        id: "by-entry",
        action_queue_id: "a1",
        outcome_status: "worsened",
        entry_at: "2026-05-26T01:00:00.000Z",
      }),
      outcomeRow({
        id: "by-created",
        action_queue_id: "a1",
        outcome_status: "improved",
        created_at: "2026-05-25T01:00:00.000Z",
      }),
    ];
    const picked = pickLatestOutcomeForAction(rows, "a1");
    expect(picked?.diary_entry_id).toBe("by-entry");
    expect(picked?.recorded_at).toBe("2026-05-26T01:00:00.000Z");
  });

  it("preserves diary_entry_id, followup_entry_id, source_alert_id, note", () => {
    const rows = [
      outcomeRow({
        id: "d1",
        action_queue_id: "a1",
        outcome_status: "improved",
        recorded_at: "2026-05-26T10:00:00.000Z",
        source_alert_id: "alert-99",
        followup_entry_id: "fu-7",
        note: "RH back to 60%",
      }),
    ];
    const picked = pickLatestOutcomeForAction(rows, "a1");
    expect(picked).toMatchObject({
      diary_entry_id: "d1",
      action_queue_id: "a1",
      source_alert_id: "alert-99",
      followup_entry_id: "fu-7",
      note: "RH back to 60%",
    });
  });

  it("returns unknown label for unknown outcome_status", () => {
    const rows = [
      outcomeRow({
        action_queue_id: "a1",
        outcome_status: "garbage",
        recorded_at: "2026-05-26T10:00:00.000Z",
      }),
    ];
    const picked = pickLatestOutcomeForAction(rows, "a1");
    expect(picked?.outcome_status).toBe("unknown");
    expect(picked?.label).toBe(UNKNOWN_OUTCOME_LABEL);
  });

  it("is null-safe", () => {
    expect(pickLatestOutcomeForAction(null, "a1")).toBeNull();
    expect(pickLatestOutcomeForAction([], "a1")).toBeNull();
    expect(pickLatestOutcomeForAction([outcomeRow({ action_queue_id: "a1" })], null)).toBeNull();
    expect(pickLatestOutcomeForAction([outcomeRow({ action_queue_id: "a1" })], "")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. summarizeRelatedActionOutcomes
// ---------------------------------------------------------------------------
describe("summarizeRelatedActionOutcomes", () => {
  it("counts completed actions and recorded outcomes", () => {
    const actions = [
      { id: "a1", status: "completed" },
      { id: "a2", status: "completed" },
      { id: "a3", status: "pending_approval" },
    ];
    const outcomes = [
      outcomeRow({ action_queue_id: "a1", outcome_status: "improved" }),
    ];
    const s = summarizeRelatedActionOutcomes(actions, outcomes);
    expect(s.totalActions).toBe(3);
    expect(s.completedActions).toBe(2);
    expect(s.recordedOutcomes).toBe(1);
    expect(s.improved).toBe(1);
  });

  it("counts improved / unchanged / worsened / more_data_needed", () => {
    const actions = [
      { id: "a1", status: "completed" },
      { id: "a2", status: "completed" },
      { id: "a3", status: "completed" },
      { id: "a4", status: "completed" },
    ];
    const outcomes = [
      outcomeRow({ action_queue_id: "a1", outcome_status: "improved" }),
      outcomeRow({ action_queue_id: "a2", outcome_status: "unchanged" }),
      outcomeRow({ action_queue_id: "a3", outcome_status: "worsened" }),
      outcomeRow({ action_queue_id: "a4", outcome_status: "more_data_needed" }),
    ];
    const s = summarizeRelatedActionOutcomes(actions, outcomes);
    expect(s.improved).toBe(1);
    expect(s.unchanged).toBe(1);
    expect(s.worsened).toBe(1);
    expect(s.more_data_needed).toBe(1);
    expect(s.recordedOutcomes).toBe(4);
  });

  it("is null-safe", () => {
    const s = summarizeRelatedActionOutcomes(null, null);
    expect(s.totalActions).toBe(0);
    expect(s.recordedOutcomes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. AlertDetail wiring (static)
// ---------------------------------------------------------------------------
describe("AlertDetail — related action outcome surface", () => {
  it("imports the pure helper", () => {
    expect(ALERT_DETAIL).toMatch(/from "@\/lib\/relatedActionOutcomeRules"/);
    expect(ALERT_DETAIL).toMatch(/pickLatestOutcomeForAction/);
  });

  it("queries diary_entries for action_outcome rows by source_alert_id", () => {
    expect(ALERT_DETAIL).toMatch(/\.from\("diary_entries"\)/);
    expect(ALERT_DETAIL).toMatch(/event_type:\s*ACTION_OUTCOME_EVENT_TYPE/);
    expect(ALERT_DETAIL).toMatch(/source_alert_id:\s*alert\.id/);
  });

  it("renders an outcome badge for completed related actions", () => {
    expect(ALERT_DETAIL).toMatch(/related-action-outcome-badge/);
    expect(ALERT_DETAIL).toMatch(/Outcome:\s*\{outcome\.label\}/);
  });

  it("uses grower-recorded, non-causation copy", () => {
    expect(ALERT_DETAIL).toMatch(/Grower-recorded outcome/);
    expect(ALERT_DETAIL).toMatch(/Recorded after follow-up/);
    expect(ALERT_DETAIL).not.toMatch(/\bFixed\b/);
    expect(ALERT_DETAIL).not.toMatch(/Resolved by action/);
    expect(ALERT_DETAIL).not.toMatch(/Confirmed improvement/);
    expect(ALERT_DETAIL).not.toMatch(/Verdant determined/);
  });

  it("shows 'No outcome recorded yet' only on completed actions without outcome", () => {
    expect(ALERT_DETAIL).toMatch(/No outcome recorded yet/);
  });

  it("does not insert/update/delete diary_entries from the outcome rollup", () => {
    // No diary_entries write surface anywhere on AlertDetail
    expect(ALERT_DETAIL).not.toMatch(/diary_entries"\)[\s\S]{0,200}\.insert\(/);
    expect(ALERT_DETAIL).not.toMatch(/diary_entries"\)[\s\S]{0,200}\.update\(/);
    expect(ALERT_DETAIL).not.toMatch(/diary_entries"\)[\s\S]{0,200}\.delete\(/);
  });

  it("does not mutate action_queue rows from this surface", () => {
    expect(ALERT_DETAIL).not.toMatch(/action_queue"\)[\s\S]{0,200}\.update\(/);
    expect(ALERT_DETAIL).not.toMatch(/action_queue"\)[\s\S]{0,200}\.delete\(/);
  });

  it("introduces no automation / device-control / service_role surface", () => {
    const surface = `${ALERT_DETAIL}\n${RULES}`;
    expect(surface).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
    expect(surface).not.toMatch(/user_id:/);
  });
});
