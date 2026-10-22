/**
 * Regression fence for filming bug #5 / PR #2350: grow overview timestamps must
 * stay on formatSnapshotTimestamp (no mixed toLocaleString / toLocaleDateString).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import ActionOutcomeLearningReport from "@/components/ActionOutcomeLearningReport";
import type { ActionOutcomeLearningReport as Report } from "@/lib/actionOutcomeLearningRules";

const ROOT = resolve(__dirname, "../..");
const GROW_DETAIL_PAGE = readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8");
const LEARNING_REPORT = readFileSync(
  resolve(ROOT, "src/components/ActionOutcomeLearningReport.tsx"),
  "utf8",
);

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
  it("GrowDetail and ActionOutcomeLearningReport avoid locale date formatters", () => {
    for (const src of [GROW_DETAIL_PAGE, LEARNING_REPORT]) {
      expect(src).toMatch(/formatSnapshotTimestamp/);
      expect(src).not.toMatch(/toLocaleString|toLocaleDateString/);
    }
  });

  it("ActionOutcomeLearningReport renders example recorded_at via formatSnapshotTimestamp", () => {
    render(
      <MemoryRouter>
        <ActionOutcomeLearningReport report={EXAMPLE_REPORT} status="ready" />
      </MemoryRouter>,
    );
    expect(screen.getByText(formatSnapshotTimestamp("2026-05-30T10:00:00Z"))).toBeInTheDocument();
  });
});
