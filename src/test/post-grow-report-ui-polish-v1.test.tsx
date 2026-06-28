/**
 * Post-Grow Report UI Polish v1 — presenter-only regression tests.
 *
 * Asserts polish copy renders, section labels appear, empty states stay
 * factual, and forbidden automation/health phrases never leak.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import {
  ActionEffectivenessCard,
  EnvironmentStabilityCard,
  ExportSummaryButtons,
  PhotoGridCard,
  PostGrowExecutiveSummaryCard,
  PostGrowReportActionSafetyNote,
  PostGrowReportHeaderHelper,
  PostGrowReportTopSummaryPanel,
  PostHarvestPerformanceCard,
  REPORT_ACTION_SAFETY_COPY,
  REPORT_HEADER_HELPER_COPY,
  REPORT_SECTION_LABELS,
  REPORT_SOURCE_HONESTY_COPY,
  REPORT_EMPTY_SUMMARY_COPY,
} from "@/components/PostGrowLearningReportCards";
import type { PostGrowLearningReportViewModel } from "@/lib/postGrowLearningReportRules";

function makeVm(
  overrides: Partial<PostGrowLearningReportViewModel> = {},
): PostGrowLearningReportViewModel {
  return {
    eligible: true,
    ineligibleReason: null,
    header: {
      growId: "g1",
      growName: "Test Grow",
      stageLabel: "Drying / Curing",
      archived: true,
      startedAt: "2026-01-01T00:00:00.000Z",
      harvestedAt: "2026-04-01T00:00:00.000Z",
      yieldGrams: 100,
    },
    executiveSummary: ["Run had a useful post-grow record."],
    dataCompleteness: { score: 60, label: "Useful", present: [], missing: [] },
    environment: [
      { key: "temperature_c", label: "Temperature", unit: "°C", count: 12, avg: 24, min: 22, max: 26, stablePct: 80, sparkline: [] },
      { key: "humidity_pct", label: "Humidity", unit: "%", count: 9, avg: 55, min: 50, max: 60, stablePct: 70, sparkline: [] },
      { key: "vpd_kpa", label: "VPD", unit: "kPa", count: 0, avg: null, min: null, max: null, stablePct: null, sparkline: [] },
    ],
    postHarvest: { yieldGrams: 100, points: [], weightLossPct: null, rhStabilized: null },
    actionEffectiveness: { completedActions: 3, outcomeNotes: 1, observations: [] },
    lesson: { entryId: null, text: "" },
    photos: [{ id: "p1", url: "x.jpg", capturedAt: "2026-03-01T00:00:00.000Z", alt: "photo" }],
    ...overrides,
  };
}

const FORBIDDEN = [
  "automatically executed",
  "auto execute",
  "device command",
  "send command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed from photo",
  "ai grows for you",
  "autopilot",
  "fully automated",
  "fake live",
];

function expectNoForbiddenText() {
  const body = (document.body.textContent ?? "").toLowerCase();
  for (const term of FORBIDDEN) {
    expect(body, `forbidden phrase leaked: ${term}`).not.toContain(term);
  }
}

describe("Post-Grow Report UI Polish v1 — header helper + safety notes", () => {
  it("renders the header helper copy", () => {
    render(<PostGrowReportHeaderHelper />);
    expect(
      screen.getByTestId("post-grow-report-header-helper").textContent,
    ).toContain(REPORT_HEADER_HELPER_COPY);
    expectNoForbiddenText();
    cleanup();
  });

  it("header helper mentions changed/logged/alerts/actions/repeat/avoid", () => {
    expect(REPORT_HEADER_HELPER_COPY).toMatch(/what changed/i);
    expect(REPORT_HEADER_HELPER_COPY).toMatch(/what was logged/i);
    expect(REPORT_HEADER_HELPER_COPY).toMatch(/alerts/i);
    expect(REPORT_HEADER_HELPER_COPY).toMatch(/actions/i);
    expect(REPORT_HEADER_HELPER_COPY).toMatch(/repeat or avoid/i);
  });

  it("renders the grower-approved / no-device-command safety note", () => {
    render(<PostGrowReportActionSafetyNote />);
    const text = screen.getByTestId("post-grow-action-safety-note").textContent ?? "";
    expect(text).toContain(REPORT_ACTION_SAFETY_COPY);
    expect(text.toLowerCase()).toContain("grower-approved");
    expect(text.toLowerCase()).toContain("does not include device commands");
    // The phrase "device command" is allowed here only in the negating safety
    // note ("does not include device commands"); the forbidden-text scan is
    // intentionally skipped for this single render.
    cleanup();
  });
});

describe("Post-Grow Report UI Polish v1 — top summary panel", () => {
  it("renders grow name, status, log/photo/action counts, and source-honesty note", () => {
    render(<PostGrowReportTopSummaryPanel vm={makeVm()} />);
    const panel = screen.getByTestId("post-grow-top-summary-panel");
    expect(panel.textContent).toContain("Test Grow");
    expect(screen.getByTestId("post-grow-top-summary-status").textContent).toMatch(
      /Archived run|In review|Draft/,
    );
    // 12 + 9 + 0 = 21 sensor readings across environment metrics.
    expect(screen.getByTestId("post-grow-top-summary-logs").textContent).toContain("21");
    expect(screen.getByTestId("post-grow-top-summary-photos").textContent).toContain("1");
    expect(screen.getByTestId("post-grow-top-summary-actions").textContent).toContain("3");
    // Alerts shown honestly without a fabricated count.
    expect(screen.getByTestId("post-grow-top-summary-alerts").textContent?.toLowerCase()).toContain(
      "alert center",
    );
    expect(screen.getByTestId("post-grow-source-honesty").textContent).toContain(
      REPORT_SOURCE_HONESTY_COPY,
    );
    expectNoForbiddenText();
    cleanup();
  });

  it("source-honesty copy treats missing data as missing, not healthy", () => {
    expect(REPORT_SOURCE_HONESTY_COPY.toLowerCase()).toContain("missing data");
    expect(REPORT_SOURCE_HONESTY_COPY.toLowerCase()).toContain("not healthy");
  });
});

describe("Post-Grow Report UI Polish v1 — section labels & empty states", () => {
  it("exposes the required grower-scan section labels", () => {
    expect(REPORT_SECTION_LABELS.whatChanged).toBe("What changed");
    expect(REPORT_SECTION_LABELS.whatWasLogged).toBe("What was logged");
    expect(REPORT_SECTION_LABELS.alertsReviewed).toBe("Alerts reviewed");
    expect(REPORT_SECTION_LABELS.actionsReviewed).toBe("Actions reviewed");
    expect(REPORT_SECTION_LABELS.repeatNextRun).toBe("What to repeat next run");
    expect(REPORT_SECTION_LABELS.avoidNextRun).toBe("What to avoid next run");
  });

  it("Executive Summary card carries the 'What changed' subtitle", () => {
    render(<PostGrowExecutiveSummaryCard vm={makeVm()} />);
    expect(
      screen.getByTestId("post-grow-executive-summary-subtitle").textContent,
    ).toBe(REPORT_SECTION_LABELS.whatChanged);
    cleanup();
  });

  it("Executive Summary empty state stays factual (no 'No issues')", () => {
    render(
      <PostGrowExecutiveSummaryCard vm={makeVm({ executiveSummary: [] })} />,
    );
    const empty = screen.getByTestId("post-grow-executive-summary-empty");
    expect(empty.textContent).toBe(REPORT_EMPTY_SUMMARY_COPY);
    const bodyLower = (document.body.textContent ?? "").toLowerCase();
    expect(bodyLower).not.toContain("no issues");
    expect(bodyLower).not.toContain("all good");
    expect(bodyLower).not.toContain("healthy");
    cleanup();
  });

  it("Environment / Post-Harvest / Action / Photo cards carry the polish subtitles", () => {
    render(
      <MemoryRouter>
        <EnvironmentStabilityCard metrics={makeVm().environment} />
        <PostHarvestPerformanceCard vm={makeVm()} />
        <ActionEffectivenessCard vm={makeVm()} />
        <PhotoGridCard vm={makeVm()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByTestId("post-grow-environment-stability-subtitle").textContent,
    ).toContain(REPORT_SECTION_LABELS.whatWasLogged);
    expect(
      screen.getByTestId("post-grow-post-harvest-subtitle").textContent,
    ).toContain(REPORT_SECTION_LABELS.whatWasLogged);
    expect(
      screen.getByTestId("post-grow-action-effectiveness-subtitle").textContent,
    ).toBe(REPORT_SECTION_LABELS.actionsReviewed);
    expect(
      screen.getByTestId("post-grow-photo-grid-subtitle").textContent,
    ).toContain(REPORT_SECTION_LABELS.whatWasLogged);
    expectNoForbiddenText();
    cleanup();
  });

  it("preserves the Print / Save PDF CTA from Slice B", () => {
    render(<ExportSummaryButtons vm={makeVm()} />);
    expect(screen.getByTestId("post-grow-export-print").textContent).toContain(
      "Print / Save PDF",
    );
    expectNoForbiddenText();
    cleanup();
  });
});
