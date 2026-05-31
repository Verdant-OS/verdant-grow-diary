/**
 * ActionOutcomeLearningReport — render, link wiring, and safety scan tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ActionOutcomeLearningReport from "@/components/ActionOutcomeLearningReport";
import {
  EMPTY_LEARNING_REPORT,
  type ActionOutcomeLearningReport as Report,
} from "@/lib/actionOutcomeLearningRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const COMP = stripSourceComments(
  readFileSync(
    resolve(ROOT, "src/components/ActionOutcomeLearningReport.tsx"),
    "utf8",
  ),
);
const RULES = stripSourceComments(
  readFileSync(resolve(ROOT, "src/lib/actionOutcomeLearningRules.ts"), "utf8"),
);
const HOOK = stripSourceComments(
  readFileSync(resolve(ROOT, "src/hooks/useGrowDetailData.ts"), "utf8"),
);
const PAGE = stripSourceComments(
  readFileSync(resolve(ROOT, "src/pages/GrowDetail.tsx"), "utf8"),
);

function renderReport(report: Report, status: "loading" | "ready" | "unavailable" = "ready") {
  return render(
    <MemoryRouter>
      <ActionOutcomeLearningReport report={report} status={status} />
    </MemoryRouter>,
  );
}

const FILLED: Report = {
  totals: {
    total: 4,
    improved: 2,
    unchanged: 1,
    worsened: 1,
    more_data_needed: 0,
    unknown: 0,
  },
  needs_more_data: false,
  groups: [
    {
      metric: "rh",
      label: "rh",
      totals: {
        total: 3,
        improved: 2,
        unchanged: 1,
        worsened: 0,
        more_data_needed: 0,
        unknown: 0,
      },
      needs_more_data: false,
    },
    {
      metric: "temp_c",
      label: "temp_c",
      totals: {
        total: 1,
        improved: 0,
        unchanged: 0,
        worsened: 1,
        more_data_needed: 0,
        unknown: 0,
      },
      needs_more_data: true,
    },
  ],
  examples: [
    {
      diary_entry_id: "d1",
      action_queue_id: "a1",
      source_alert_id: "alert-1",
      outcome_status: "improved",
      outcome_label: "Improved",
      metric: "rh",
      suggested_change: "Lower RH by 5%",
      note_summary: "Drop noted overnight",
      recorded_at: "2026-05-30T10:00:00Z",
    },
  ],
};

describe("ActionOutcomeLearningReport render", () => {
  it("shows empty state when there are no outcomes", () => {
    renderReport(EMPTY_LEARNING_REPORT);
    expect(screen.getByTestId("learning-empty")).toHaveTextContent(
      /No completed action outcomes recorded yet/i,
    );
  });

  it("shows loading state", () => {
    const { container } = renderReport(EMPTY_LEARNING_REPORT, "loading");
    expect(container.textContent).toMatch(/Loading/);
  });

  it("shows unavailable state", () => {
    renderReport(EMPTY_LEARNING_REPORT, "unavailable");
    expect(
      screen.getByText(/Outcome learning report unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders totals chips with correct counts", () => {
    renderReport(FILLED);
    expect(screen.getByTestId("learning-total-improved")).toHaveTextContent("2");
    expect(screen.getByTestId("learning-total-unchanged")).toHaveTextContent("1");
    expect(screen.getByTestId("learning-total-worsened")).toHaveTextContent("1");
    expect(
      screen.getByTestId("learning-total-more_data_needed"),
    ).toHaveTextContent("0");
  });

  it("renders groups with per-group needs-more-data badge for low samples", () => {
    renderReport(FILLED);
    const groups = screen.getAllByTestId("learning-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute("data-metric", "rh");
    expect(groups[1]).toHaveAttribute("data-metric", "temp_c");
    // temp_c has only 1 row → needs-more-data badge
    expect(
      groups[1].querySelector("[data-testid='learning-group-needs-more-data']"),
    ).not.toBeNull();
    expect(
      groups[0].querySelector("[data-testid='learning-group-needs-more-data']"),
    ).toBeNull();
  });

  it("shows overall needs-more-data hint only when threshold not met", () => {
    renderReport({ ...FILLED, needs_more_data: true });
    expect(screen.getByTestId("learning-needs-more-data")).toHaveTextContent(
      /Early pattern — more outcomes needed/i,
    );

    const next = renderReport(FILLED);
    expect(
      next.container.querySelector("[data-testid='learning-needs-more-data']"),
    ).toBeNull();
  });

  it("renders recent examples with ActionDetail and AlertDetail links", () => {
    renderReport(FILLED);
    const actionLink = screen.getByTestId("learning-example-action-link");
    expect(actionLink).toHaveAttribute("href", "/actions/a1");
    const alertLink = screen.getByTestId("learning-example-alert-link");
    expect(alertLink).toHaveAttribute("href", "/alerts/alert-1");
  });
});

describe("ActionOutcomeLearningReport safety + wiring", () => {
  const FORBIDDEN = [
    /\bfixed\b/i,
    /\bguaranteed\b/i,
    /\bhealthy\b/i,
    /\bcaused\b/i,
    /\bcures?\b/i,
    /\bbest action\b/i,
    /\bworst action\b/i,
    /\bautopilot\b/i,
    /\bturn on\b/i,
  ];

  it("component copy avoids causal / certainty / ranking claims", () => {
    for (const re of FORBIDDEN) {
      expect(COMP).not.toMatch(re);
    }
  });

  it("rules helper is pure (no DB/React imports, no write verbs)", () => {
    expect(RULES).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });

  it("hook does not write or use service_role / client-trusted user_id", () => {
    expect(HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(HOOK).not.toMatch(/service_role/);
  });

  it("GrowDetail mounts the report and does not duplicate aggregation in JSX", () => {
    expect(PAGE).toMatch(/ActionOutcomeLearningReport/);
    expect(PAGE).not.toMatch(/buildActionOutcomeLearningReport/);
  });
});
