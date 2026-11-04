/**
 * Audit 2026-11-03 finding 11: Reports opened with empty learning sections and
 * had no visible date-range diary report link, while Timeline exposes one. The
 * Reports grow-scope bar now carries the same diary range report link, built by
 * the same URL helper, so the existing diary is reachable from Reports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  buildDiaryRangeReportUrl,
  defaultDiaryRangeReportRange,
} from "@/lib/diaryRangeReportNavigationRules";
import { REPORTS_HUB_DIARY_RANGE_REPORT_LABEL } from "@/lib/reportsHubViewModel";

vi.mock("@/hooks/useReportsHubData", () => ({ useReportsHubData: vi.fn() }));
vi.mock("@/hooks/useScopedGrow", () => ({ useScopedGrow: vi.fn() }));
vi.mock("@/store/grows", () => ({ useGrows: vi.fn() }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));

import Reports from "@/pages/Reports";
import { useReportsHubData } from "@/hooks/useReportsHubData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrows } from "@/store/grows";

const NOW = new Date("2026-11-03T12:00:00");
const zeroOutcomes = {
  total: 0,
  improved: 0,
  unchanged: 0,
  worsened: 0,
  more_data_needed: 0,
  unknown: 0,
};
const data = {
  status: "ready",
  outcomeSummary: zeroOutcomes,
  outcomeLearning: { totals: zeroOutcomes, groups: [], examples: [], needs_more_data: true },
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 81,
  diaryEntriesTotal: 253,
  diaryEntriesLast7d: 12,
  plantCount: 3,
  retry: vi.fn(),
};

function mockScope(
  scoped: { id: string; name: string } | null,
  active: { id: string; name: string } | null,
) {
  vi.mocked(useScopedGrow).mockReturnValue({
    urlGrowId: scoped?.id ?? null,
    scopedGrow: scoped as never,
    scopedGrowName: scoped?.name ?? null,
    isValidScopedGrow: scoped !== null,
    backHref: undefined,
  });
  const grows = [scoped, active].filter(Boolean);
  vi.mocked(useGrows).mockReturnValue({
    grows: grows as never,
    activeGrow: active as never,
    activeGrowId: active?.id ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(),
    loading: false,
    error: null,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(useReportsHubData).mockReturnValue(data as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Reports diary range report link", () => {
  it("links the active grow's last-30-days diary report, as Timeline does", () => {
    mockScope(null, { id: "grow-a", name: "Skunk Gas Run" });
    renderPage();
    const link = screen.getByTestId("reports-diary-range-report-link");
    expect(link).toHaveTextContent(REPORTS_HUB_DIARY_RANGE_REPORT_LABEL);
    expect(link.getAttribute("href")).toBe(
      buildDiaryRangeReportUrl({ growId: "grow-a", ...defaultDiaryRangeReportRange(NOW) }),
    );
    expect(link.getAttribute("href")).toBe(
      "/reports/diary-range?growId=grow-a&start=2026-10-05&end=2026-11-03",
    );
  });

  it("follows the scoped grow over the active grow", () => {
    mockScope({ id: "grow-b", name: "OG Kush" }, { id: "grow-a", name: "Skunk Gas Run" });
    renderPage();
    expect(screen.getByTestId("reports-diary-range-report-link").getAttribute("href")).toContain(
      "growId=grow-b",
    );
  });

  it("sits in the grow-scope bar, above the report cards", () => {
    mockScope(null, { id: "grow-a", name: "Skunk Gas Run" });
    renderPage();
    const bar = screen.getByLabelText("Reports grow scope");
    expect(bar).toContainElement(screen.getByTestId("reports-diary-range-report-link"));
  });

  it("is absent when there is no grow to report on", () => {
    mockScope(null, null);
    renderPage();
    expect(screen.queryByTestId("reports-diary-range-report-link")).toBeNull();
  });
});
