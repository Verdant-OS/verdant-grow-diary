/**
 * Reports / Grow Learning Hub page — render + static safety tests.
 *
 * Mocks the data hook and scoped-grow / grows store to verify:
 *  - Page renders with the "Grow Learning Hub" title.
 *  - Empty state copy renders when there are no grows.
 *  - Cards render when data exists and link to existing detail surfaces.
 *  - Scoped grow takes precedence over active grow.
 *  - Safe page surface (no writes, automation, device control, service_role).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useReportsHubData", () => ({
  useReportsHubData: vi.fn(),
  EMPTY_REPORTS_HUB_DATA: {
    status: "idle",
    outcomeSummary: { total: 0, improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0, unknown: 0 },
    outcomeLearning: { totals: { total: 0, improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0, unknown: 0 }, groups: [], examples: [], needs_more_data: true },
    alertsOpen: 0,
    alertsCritical: 0,
    alertsWarning: 0,
    latestSensorCapturedAt: null,
    recentSensorReadingCount: 0,
    diaryEntriesTotal: 0,
    diaryEntriesLast7d: 0,
  },
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: vi.fn(),
}));

import Reports from "@/pages/Reports";
import { useReportsHubData } from "@/hooks/useReportsHubData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrows } from "@/store/grows";

const ROOT = resolve(__dirname, "../..");
const PAGE_SRC = readFileSync(resolve(ROOT, "src/pages/Reports.tsx"), "utf8");
const HOOK_SRC = readFileSync(resolve(ROOT, "src/hooks/useReportsHubData.ts"), "utf8");

const emptyData = {
  status: "ready",
  outcomeSummary: { total: 0, improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0, unknown: 0 },
  outcomeLearning: { totals: { total: 0, improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0, unknown: 0 }, groups: [], examples: [], needs_more_data: true },
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 0,
  diaryEntriesTotal: 0,
  diaryEntriesLast7d: 0,
} as const;

const populatedData = {
  ...emptyData,
  outcomeSummary: { total: 7, improved: 3, unchanged: 2, worsened: 1, more_data_needed: 1, unknown: 0 },
  alertsOpen: 2,
  alertsCritical: 1,
  alertsWarning: 1,
  diaryEntriesTotal: 9,
  diaryEntriesLast7d: 3,
} as const;

type GrowLite = { id: string; name: string };
const growA: GrowLite = { id: "grow-a", name: "Blue Dream" };
const growB: GrowLite = { id: "grow-b", name: "OG Kush" };

beforeEach(() => {
  vi.mocked(useReportsHubData).mockReset();
  vi.mocked(useScopedGrow).mockReset();
  vi.mocked(useGrows).mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );
}

describe("Reports / Grow Learning Hub", () => {
  it("renders the page title", () => {
    vi.mocked(useScopedGrow).mockReturnValue({
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    });
    vi.mocked(useGrows).mockReturnValue({
      grows: [growA] as never,
      activeGrow: growA as never,
      activeGrowId: growA.id,
      setActiveGrowId: vi.fn(),
      refresh: vi.fn(),
      loading: false,
      error: null,
    });
    vi.mocked(useReportsHubData).mockReturnValue(populatedData as never);
    renderPage();
    expect(screen.getByText("Grow Learning Hub")).toBeInTheDocument();
  });

  it("renders empty state when the user has no grows", () => {
    vi.mocked(useScopedGrow).mockReturnValue({
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    });
    vi.mocked(useGrows).mockReturnValue({
      grows: [] as never,
      activeGrow: null as never,
      activeGrowId: null,
      setActiveGrowId: vi.fn(),
      refresh: vi.fn(),
      loading: false,
      error: null,
    });
    vi.mocked(useReportsHubData).mockReturnValue({ ...emptyData, status: "idle" } as never);
    renderPage();
    expect(screen.getByText(/no grow learning data yet/i)).toBeInTheDocument();
  });

  it("renders cards with links when data exists", () => {
    vi.mocked(useScopedGrow).mockReturnValue({
      urlGrowId: null,
      scopedGrow: null,
      scopedGrowName: null,
      isValidScopedGrow: false,
      backHref: undefined,
    });
    vi.mocked(useGrows).mockReturnValue({
      grows: [growA] as never,
      activeGrow: growA as never,
      activeGrowId: growA.id,
      setActiveGrowId: vi.fn(),
      refresh: vi.fn(),
      loading: false,
      error: null,
    });
    vi.mocked(useReportsHubData).mockReturnValue(populatedData as never);
    renderPage();
    expect(screen.getByTestId("reports-card-recent_outcomes")).toBeInTheDocument();
    expect(screen.getByTestId("reports-card-environment_alerts")).toBeInTheDocument();
    expect(screen.getByTestId("reports-card-timeline_activity")).toBeInTheDocument();
    const alertsLink = screen.getByTestId("reports-card-link-environment_alerts");
    expect(alertsLink.getAttribute("href")).toBe("/alerts?growId=grow-a");
    const timelineLink = screen.getByTestId("reports-card-link-timeline_activity");
    expect(timelineLink.getAttribute("href")).toBe("/logs?growId=grow-a");
  });

  it("respects scoped grow over active grow", () => {
    vi.mocked(useScopedGrow).mockReturnValue({
      urlGrowId: growB.id,
      scopedGrow: growB as never,
      scopedGrowName: growB.name,
      isValidScopedGrow: true,
      backHref: `/grows/${growB.id}`,
    });
    vi.mocked(useGrows).mockReturnValue({
      grows: [growA, growB] as never,
      activeGrow: growA as never,
      activeGrowId: growA.id,
      setActiveGrowId: vi.fn(),
      refresh: vi.fn(),
      loading: false,
      error: null,
    });
    vi.mocked(useReportsHubData).mockReturnValue(populatedData as never);
    renderPage();
    expect(screen.getByLabelText("Reports grow scope")).toHaveTextContent(growB.name);
    expect(vi.mocked(useReportsHubData)).toHaveBeenCalledWith(growB.id);
  });
});

describe("Reports page · static safety", () => {
  it("page surface is read-only and free of automation/device control", () => {
    expect(PAGE_SRC).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(PAGE_SRC).not.toMatch(/service_role/);
    expect(PAGE_SRC).not.toMatch(/ai-coach|ai_coach|functions\.invoke/);
    expect(PAGE_SRC).not.toMatch(/mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i);
    const forbidden = /\b(fixed|guaranteed|healthy|caused|best|worst)\b/i;
    expect(forbidden.test(PAGE_SRC)).toBe(false);
  });

  it("hook is read-only and free of automation/device control", () => {
    expect(HOOK_SRC).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(HOOK_SRC).not.toMatch(/service_role/);
    expect(HOOK_SRC).not.toMatch(/ai-coach|ai_coach|functions\.invoke/);
  });
});
