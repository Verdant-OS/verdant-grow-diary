/**
 * actionFollowupVisibilityRules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FOLLOWUP_BADGE_LABEL,
  FOLLOWUP_DEFAULT_LABEL,
  FOLLOWUP_KIND_LABEL,
  FOLLOWUP_SAFE_CAPTION,
  filterFollowupRows,
  isActionFollowupRow,
  normalizeFollowupKindLabel,
  pickLatestFollowupForAction,
  sortFollowupsNewestFirst,
  type RawFollowupDiaryRow,
} from "@/lib/actionFollowupVisibilityRules";

const SOURCE = readFileSync(
  resolve(__dirname, "../..", "src/lib/actionFollowupVisibilityRules.ts"),
  "utf8",
);

function row(overrides: Partial<RawFollowupDiaryRow> = {}): RawFollowupDiaryRow {
  return {
    id: "d1",
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    entry_at: "2025-05-01T00:00:00.000Z",
    created_at: "2025-05-01T00:00:00.000Z",
    note: "Re-check RH in ~24h.",
    ...overrides,
    details: {
      event_type: "action_followup",
      action_queue_id: "a1",
      followup_kind: "24h_recheck",
      ...(overrides.details ?? {}),
    },
  };
}

describe("labels", () => {
  it("exposes stable Follow-up + 24h re-check labels", () => {
    expect(FOLLOWUP_BADGE_LABEL).toBe("Follow-up");
    expect(FOLLOWUP_KIND_LABEL["24h_recheck"]).toBe("24h re-check");
    expect(FOLLOWUP_DEFAULT_LABEL).toBe("24h re-check");
    expect(FOLLOWUP_SAFE_CAPTION).toBe("Recorded after action completion");
  });
  it("normalizes unknown kinds to the default safely", () => {
    expect(normalizeFollowupKindLabel("24h_recheck")).toBe("24h re-check");
    expect(normalizeFollowupKindLabel("garbage")).toBe("24h re-check");
    expect(normalizeFollowupKindLabel(null)).toBe("24h re-check");
  });
});

describe("isActionFollowupRow / filterFollowupRows", () => {
  it("accepts only action_followup rows", () => {
    expect(isActionFollowupRow(row())).toBe(true);
    expect(isActionFollowupRow(null)).toBe(false);
    expect(isActionFollowupRow({ details: null })).toBe(false);
    expect(isActionFollowupRow({ details: { event_type: "watering" } })).toBe(false);
  });
  it("filterFollowupRows drops non-followup rows", () => {
    const rows = [row(), { details: { event_type: "action_outcome" } }, null as unknown as RawFollowupDiaryRow];
    expect(filterFollowupRows(rows)).toHaveLength(1);
  });
});

describe("pickLatestFollowupForAction", () => {
  it("returns null for missing inputs", () => {
    expect(pickLatestFollowupForAction(null, "a1")).toBeNull();
    expect(pickLatestFollowupForAction([row()], null)).toBeNull();
    expect(pickLatestFollowupForAction([row()], "")).toBeNull();
  });
  it("returns null when no follow-up matches the action id", () => {
    expect(pickLatestFollowupForAction([row()], "other")).toBeNull();
  });
  it("picks the newest matching follow-up", () => {
    const rows = [
      row({ id: "old", entry_at: "2025-01-01T00:00:00Z" }),
      row({ id: "new", entry_at: "2025-06-01T00:00:00Z" }),
    ];
    expect(pickLatestFollowupForAction(rows, "a1")?.diary_entry_id).toBe("new");
  });
  it("preserves identifying fields", () => {
    const picked = pickLatestFollowupForAction([row()], "a1");
    expect(picked).toMatchObject({
      diary_entry_id: "d1",
      action_queue_id: "a1",
      grow_id: "g1",
      plant_id: "p1",
      tent_id: "t1",
      followup_kind: "24h_recheck",
      label: "24h re-check",
      note: "Re-check RH in ~24h.",
    });
  });
  it("labels unknown follow-up kind safely", () => {
    const picked = pickLatestFollowupForAction(
      [row({ details: { followup_kind: "bogus" } })],
      "a1",
    );
    expect(picked?.followup_kind).toBe("unknown");
    expect(picked?.label).toBe("24h re-check");
  });
});

describe("sortFollowupsNewestFirst", () => {
  it("sorts and projects", () => {
    const rows = [
      row({ id: "a", entry_at: "2025-01-01T00:00:00Z" }),
      row({ id: "b", entry_at: "2025-09-01T00:00:00Z" }),
      { details: { event_type: "watering" } } as RawFollowupDiaryRow,
    ];
    const out = sortFollowupsNewestFirst(rows);
    expect(out.map((o) => o.diary_entry_id)).toEqual(["b", "a"]);
  });
});

describe("static safety", () => {
  it("no causation/resolution language, no I/O, no device control, no user_id payload", () => {
    expect(SOURCE).not.toMatch(/\b(fixed|resolved|confirmed by verdant|proven)\b/i);
    expect(SOURCE).not.toMatch(/\.from\(|\.rpc\(|fetch\(|supabase|ai-coach/i);
    expect(SOURCE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(SOURCE).not.toMatch(/service_role/i);
    expect(SOURCE).not.toMatch(/user_id/);
  });
});
