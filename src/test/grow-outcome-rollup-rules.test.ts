/**
 * growOutcomeRollupRules — pure helper tests.
 * Covers predicate, summary counts, recent picker ordering/limits/fallbacks,
 * malformed input safety, label mapping, and copy safety.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isActionOutcomeRow,
  summarizeGrowOutcomes,
  pickRecentGrowOutcomes,
  EMPTY_GROW_OUTCOME_SUMMARY,
  type RawGrowOutcomeRow,
} from "@/lib/growOutcomeRollupRules";

const SOURCE = readFileSync(
  resolve(__dirname, "../..", "src/lib/growOutcomeRollupRules.ts"),
  "utf8",
);

function row(overrides: Partial<RawGrowOutcomeRow> & { status?: string }): RawGrowOutcomeRow {
  const { status, ...rest } = overrides;
  return {
    id: "d1",
    entry_at: "2025-05-01T00:00:00.000Z",
    created_at: "2025-05-01T00:00:00.000Z",
    note: null,
    ...rest,
    details: {
      event_type: "action_outcome",
      outcome_kind: "24h_recheck",
      outcome_status: status ?? "improved",
      recorded_at: "2025-05-01T00:00:00.000Z",
      action_queue_id: "a1",
      source_alert_id: "al1",
      followup_entry_id: "f1",
      metric: "temperature",
      suggested_change: "lower temp",
      ...(rest.details ?? {}),
    },
  };
}

describe("isActionOutcomeRow", () => {
  it("accepts a valid action_outcome row", () => {
    expect(isActionOutcomeRow(row({}))).toBe(true);
  });
  it("rejects null / undefined / missing details", () => {
    expect(isActionOutcomeRow(null)).toBe(false);
    expect(isActionOutcomeRow(undefined)).toBe(false);
    expect(isActionOutcomeRow({} as RawGrowOutcomeRow)).toBe(false);
    expect(isActionOutcomeRow({ details: null })).toBe(false);
  });
  it("rejects non-outcome event types", () => {
    expect(
      isActionOutcomeRow({ details: { event_type: "watering", outcome_kind: "24h_recheck" } }),
    ).toBe(false);
  });
  it("rejects wrong outcome_kind", () => {
    expect(
      isActionOutcomeRow({ details: { event_type: "action_outcome", outcome_kind: "other" } }),
    ).toBe(false);
  });
});

describe("summarizeGrowOutcomes", () => {
  it("returns empty summary for null / empty / undefined", () => {
    expect(summarizeGrowOutcomes(null)).toEqual(EMPTY_GROW_OUTCOME_SUMMARY);
    expect(summarizeGrowOutcomes(undefined)).toEqual(EMPTY_GROW_OUTCOME_SUMMARY);
    expect(summarizeGrowOutcomes([])).toEqual(EMPTY_GROW_OUTCOME_SUMMARY);
  });
  it("counts each outcome status correctly and ignores non-outcome rows", () => {
    const rows: RawGrowOutcomeRow[] = [
      row({ status: "improved" }),
      row({ status: "improved" }),
      row({ status: "unchanged" }),
      row({ status: "worsened" }),
      row({ status: "more_data_needed" }),
      row({ status: "garbage" }),
      { details: { event_type: "watering" } },
      null as unknown as RawGrowOutcomeRow,
    ];
    expect(summarizeGrowOutcomes(rows)).toEqual({
      total: 6,
      improved: 2,
      unchanged: 1,
      worsened: 1,
      more_data_needed: 1,
      unknown: 1,
    });
  });
  it("handles malformed rows safely", () => {
    const rows = [
      { details: null },
      { details: { event_type: "action_outcome" } },
      { details: { outcome_kind: "24h_recheck" } },
    ] as RawGrowOutcomeRow[];
    expect(summarizeGrowOutcomes(rows)).toEqual(EMPTY_GROW_OUTCOME_SUMMARY);
  });
});

describe("pickRecentGrowOutcomes", () => {
  it("returns [] for null/empty input", () => {
    expect(pickRecentGrowOutcomes(null)).toEqual([]);
    expect(pickRecentGrowOutcomes([])).toEqual([]);
  });
  it("sorts newest first by recorded_at", () => {
    const rows = [
      row({ id: "old", details: { recorded_at: "2025-01-01T00:00:00Z" } }),
      row({ id: "new", details: { recorded_at: "2025-06-01T00:00:00Z" } }),
      row({ id: "mid", details: { recorded_at: "2025-03-01T00:00:00Z" } }),
    ];
    expect(pickRecentGrowOutcomes(rows).map((r) => r.diary_entry_id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });
  it("falls back to entry_at then created_at when recorded_at missing", () => {
    const rows = [
      row({
        id: "a",
        entry_at: "2025-01-01T00:00:00Z",
        details: { recorded_at: null },
      }),
      row({
        id: "b",
        entry_at: null,
        created_at: "2025-09-01T00:00:00Z",
        details: { recorded_at: null },
      }),
    ];
    expect(pickRecentGrowOutcomes(rows).map((r) => r.diary_entry_id)).toEqual(["b", "a"]);
  });
  it("respects limit (default 5, custom value, ignores invalid)", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `r${i}`, details: { recorded_at: `2025-01-${10 - i}T00:00:00Z` } }),
    );
    expect(pickRecentGrowOutcomes(rows)).toHaveLength(5);
    expect(pickRecentGrowOutcomes(rows, 3)).toHaveLength(3);
    expect(pickRecentGrowOutcomes(rows, 0)).toHaveLength(5);
    expect(pickRecentGrowOutcomes(rows, -1)).toHaveLength(5);
  });
  it("preserves identifying fields", () => {
    const [out] = pickRecentGrowOutcomes([row({})]);
    expect(out).toMatchObject({
      diary_entry_id: "d1",
      action_queue_id: "a1",
      source_alert_id: "al1",
      followup_entry_id: "f1",
      outcome_status: "improved",
      label: "Improved",
      metric: "temperature",
      suggested_change: "lower temp",
    });
  });
  it("labels unknown status safely", () => {
    const [out] = pickRecentGrowOutcomes([row({ status: "bogus" })]);
    expect(out.outcome_status).toBe("unknown");
    expect(out.label).toBe("Unknown outcome");
  });
  it("preserves note when present", () => {
    const [out] = pickRecentGrowOutcomes([row({ note: "  grower note  " })]);
    expect(out.note).toBe("grower note");
  });
  it("normalizes empty/whitespace fields to null", () => {
    const [out] = pickRecentGrowOutcomes([
      row({
        note: "   ",
        details: {
          action_queue_id: "",
          source_alert_id: "  ",
          metric: "",
          suggested_change: "",
        },
      }),
    ]);
    expect(out.note).toBeNull();
    expect(out.action_queue_id).toBeNull();
    expect(out.source_alert_id).toBeNull();
    expect(out.metric).toBeNull();
    expect(out.suggested_change).toBeNull();
  });
});

describe("growOutcomeRollupRules — static safety", () => {
  it("emits no causation/resolution language", () => {
    expect(SOURCE).not.toMatch(/\b(fixed|resolved|confirmed by verdant|proven)\b/i);
  });
  it("performs no I/O, DB calls, or AI inference", () => {
    expect(SOURCE).not.toMatch(/\.from\(|\.rpc\(|fetch\(|supabase|ai-coach/i);
  });
  it("introduces no device-control surface", () => {
    expect(SOURCE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
