import { describe, it, expect } from "vitest";
import {
  buildActionOutcomeLearningReport,
  EMPTY_LEARNING_REPORT,
  LEARNING_GROUP_SAMPLE_THRESHOLD,
  UNSPECIFIED_METRIC_LABEL,
} from "@/lib/actionOutcomeLearningRules";

function row(
  overrides: {
    id?: string;
    outcome_status?: string;
    metric?: string | null;
    action_queue_id?: string | null;
    source_alert_id?: string | null;
    note?: string | null;
    suggested_change?: string | null;
    recorded_at?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "d1",
    entry_at: overrides.recorded_at ?? "2026-05-30T10:00:00Z",
    created_at: "2026-05-30T10:00:00Z",
    note: overrides.note ?? null,
    details: {
      event_type: "action_outcome",
      outcome_kind: "24h_recheck",
      outcome_status: overrides.outcome_status ?? "improved",
      metric: overrides.metric === undefined ? "rh" : overrides.metric,
      action_queue_id: overrides.action_queue_id ?? "a1",
      source_alert_id: overrides.source_alert_id ?? null,
      suggested_change: overrides.suggested_change ?? "Lower RH by 5%",
      recorded_at: overrides.recorded_at ?? "2026-05-30T10:00:00Z",
    },
  };
}

describe("buildActionOutcomeLearningReport", () => {
  it("returns empty report for null/empty inputs", () => {
    expect(buildActionOutcomeLearningReport(null)).toEqual(EMPTY_LEARNING_REPORT);
    expect(buildActionOutcomeLearningReport([])).toEqual(EMPTY_LEARNING_REPORT);
  });

  it("ignores rows that are not action_outcome / wrong kind", () => {
    const r = buildActionOutcomeLearningReport([
      { details: { event_type: "watering", outcome_kind: "24h_recheck" } },
      { details: { event_type: "action_outcome", outcome_kind: "other" } },
    ]);
    expect(r.totals.total).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it("aggregates outcome totals across rows", () => {
    const r = buildActionOutcomeLearningReport([
      row({ id: "1", outcome_status: "improved" }),
      row({ id: "2", outcome_status: "improved" }),
      row({ id: "3", outcome_status: "unchanged" }),
      row({ id: "4", outcome_status: "worsened" }),
      row({ id: "5", outcome_status: "more_data_needed" }),
      row({ id: "6", outcome_status: "bogus" }),
    ]);
    expect(r.totals).toMatchObject({
      total: 6,
      improved: 2,
      unchanged: 1,
      worsened: 1,
      more_data_needed: 1,
      unknown: 1,
    });
  });

  it("groups outcomes by metric and falls back to unspecified label", () => {
    const r = buildActionOutcomeLearningReport([
      row({ id: "1", metric: "rh", outcome_status: "improved" }),
      row({ id: "2", metric: "rh", outcome_status: "unchanged" }),
      row({ id: "3", metric: "temp_c", outcome_status: "improved" }),
      row({ id: "4", metric: null, outcome_status: "improved" }),
    ]);
    const labels = r.groups.map((g) => g.label);
    expect(labels).toContain("rh");
    expect(labels).toContain("temp_c");
    expect(labels).toContain(UNSPECIFIED_METRIC_LABEL);
    const rh = r.groups.find((g) => g.metric === "rh")!;
    expect(rh.totals.total).toBe(2);
    expect(rh.totals.improved).toBe(1);
  });

  it("flags low-sample groups + overall as needs_more_data", () => {
    const r = buildActionOutcomeLearningReport([
      row({ id: "1", metric: "rh", outcome_status: "improved" }),
      row({ id: "2", metric: "rh", outcome_status: "improved" }),
    ]);
    expect(r.totals.total).toBe(2);
    expect(r.needs_more_data).toBe(true);
    expect(r.groups[0].needs_more_data).toBe(true);
  });

  it("clears needs_more_data once threshold is met", () => {
    const rows = Array.from({ length: LEARNING_GROUP_SAMPLE_THRESHOLD }, (_, i) =>
      row({ id: `r${i}`, metric: "rh", outcome_status: "improved" }),
    );
    const r = buildActionOutcomeLearningReport(rows);
    expect(r.needs_more_data).toBe(false);
    expect(r.groups[0].needs_more_data).toBe(false);
  });

  it("returns recent examples newest-first with summarized notes + links", () => {
    const r = buildActionOutcomeLearningReport(
      [
        row({
          id: "old",
          recorded_at: "2026-05-01T00:00:00Z",
          note: "older",
          action_queue_id: "a-old",
          source_alert_id: "alert-old",
        }),
        row({
          id: "new",
          recorded_at: "2026-05-30T00:00:00Z",
          note: "x".repeat(300),
          action_queue_id: "a-new",
        }),
      ],
      { exampleLimit: 2 },
    );
    expect(r.examples).toHaveLength(2);
    expect(r.examples[0].diary_entry_id).toBe("new");
    expect(r.examples[0].note_summary?.endsWith("…")).toBe(true);
    expect(r.examples[1].action_queue_id).toBe("a-old");
    expect(r.examples[1].source_alert_id).toBe("alert-old");
  });
});
