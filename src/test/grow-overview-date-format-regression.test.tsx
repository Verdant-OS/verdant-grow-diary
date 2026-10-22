/**
 * Regression fence for filming bug #5 / PR #2350: grow overview timestamps must
 * render through formatSnapshotTimestamp. Rendered GrowDetail coverage lives in
 * grow-overview-one-date-format.test.tsx; this file renders the learning report.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import ActionOutcomeLearningReport from "@/components/ActionOutcomeLearningReport";
import type { ActionOutcomeLearningReport as Report } from "@/lib/actionOutcomeLearningRules";

const EXAMPLE_REPORT: Report = {
  totals: {
    total: 1,
    improved: 1,
    unchanged: 0,
    worsened: 0,
    more_data_needed: 0,
    unknown: 0,
  },
  needs_more_data: false,
  groups: [],
  examples: [
    {
      diary_entry_id: "d-reg",
      action_queue_id: "a-reg",
      source_alert_id: null,
      outcome_status: "improved",
      outcome_label: "Improved",
      metric: "rh",
      suggested_change: null,
      note_summary: null,
      recorded_at: "2026-05-30T10:00:00Z",
    },
  ],
};

describe("Grow overview date format regression", () => {
  it("ActionOutcomeLearningReport renders example recorded_at via formatSnapshotTimestamp", () => {
    render(
      <MemoryRouter>
        <ActionOutcomeLearningReport report={EXAMPLE_REPORT} status="ready" />
      </MemoryRouter>,
    );
    expect(screen.getByText(formatSnapshotTimestamp("2026-05-30T10:00:00Z"))).toBeInTheDocument();
  });
});
