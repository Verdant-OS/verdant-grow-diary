/**
 * Renders each premium report page's locked PaywallCta and asserts the
 * grammatical headline from #2008. The title is the resolved view-model
 * string the page passes, not a source-text match.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import DiaryRangeReportPage from "@/pages/DiaryRangeReportPage";
import EnvironmentSummaryReportPage from "@/pages/EnvironmentSummaryReportPage";
import PostGrowLearningReport from "@/pages/PostGrowLearningReport";

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { isActive: true, capabilities: { advancedExports: false } },
    refetch: async () => {},
  }),
}));

vi.mock("@/hooks/usePremiumExportServerGate", () => ({
  checkPremiumExportEntitlement: vi.fn(async () => ({
    ok: false,
    state: "denied",
    reason: "upgrade_required",
    displayPlanId: "free",
  })),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ activeGrowId: "grow-1" }),
}));

vi.mock("@/hooks/useDiaryRangeReportData", () => ({
  useDiaryRangeReportData: () => ({ status: "idle", data: null, error: null, retry: () => {} }),
}));

vi.mock("@/hooks/useEnvironmentSummaryReportServerGate", () => ({
  useEnvironmentSummaryReportServerGate: () => ({
    status: "denied",
    reason: "upgrade_required",
    displayPlanId: "free",
    retry: () => {},
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => ({ preference: "f", setPreference: () => {} }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

vi.mock("@/hooks/usePostGrowLearningReportData", () => ({
  usePostGrowLearningReportData: () => ({
    status: "idle",
    report: null,
    yieldEfficiency: null,
    error: null,
    reload: () => {},
    saveLesson: async () => ({ ok: false }),
    applyLessonToNextGrow: async () => ({ ok: false }),
  }),
}));

vi.mock("@/hooks/usePlantMemoryEpisodes", () => ({
  usePlantMemoryEpisodes: () => ({ state: { status: "loading" } }),
}));

const HEADLINES = [
  {
    name: "date-range diary report",
    testId: "diary-range-report-paywall",
    title: "A date-range diary report is part of Pro",
    render: () =>
      render(
        <MemoryRouter
          initialEntries={["/reports/diary-range?growId=grow-1&start=2026-07-01&end=2026-07-10"]}
        >
          <DiaryRangeReportPage />
        </MemoryRouter>,
      ),
  },
  {
    name: "environment summary report",
    testId: "env-report-paywall",
    title: "An Environment Summary report is part of Pro",
    render: () =>
      render(
        <MemoryRouter initialEntries={["/diary/environment-summary"]}>
          <EnvironmentSummaryReportPage />
        </MemoryRouter>,
      ),
  },
  {
    name: "post-grow learning report",
    testId: "post-grow-report-paywall",
    title: "The Post-Grow Learning Report is part of Pro",
    render: () =>
      render(
        <MemoryRouter initialEntries={["/reports/post-grow/grow-1"]}>
          <Routes>
            <Route path="/reports/post-grow/:growId" element={<PostGrowLearningReport />} />
          </Routes>
        </MemoryRouter>,
      ),
  },
] as const;

describe("premium report paywall headlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(HEADLINES)(
    "renders $name as a grammatical PaywallCta title",
    async ({ testId, title, render: mount }) => {
      mount();
      const paywall = await screen.findByTestId(testId);
      const heading = paywall.querySelector("h2");
      expect(heading).not.toBeNull();
      await waitFor(() => {
        expect(heading?.textContent).toBe(title);
      });
      expect(heading?.textContent?.startsWith("Unlock")).toBe(false);
      expect(/^Unlock\b.*\bis part of\b/.test(heading?.textContent ?? "")).toBe(false);
    },
  );
});
