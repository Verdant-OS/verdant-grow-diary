import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/lib/reportsHubOnboarding", async (original) => {
  const actual = await original<typeof import("@/lib/reportsHubOnboarding")>();
  return {
    ...actual,
    buildReportsHubOnboarding: vi.fn(actual.buildReportsHubOnboarding),
  };
});

const hub = vi.hoisted(() => ({ plantCount: 0 as number | null }));

vi.mock("@/hooks/useReportsHubData", () => ({
  useReportsHubData: () => ({
    status: "ready",
    outcomeSummary: { total: 0 },
    outcomeLearning: { groups: [] },
    alertsOpen: 0,
    alertsCritical: 0,
    alertsWarning: 0,
    latestSensorCapturedAt: null,
    recentSensorReadingCount: 0,
    diaryEntriesTotal: 0,
    diaryEntriesLast7d: 0,
    pendingOutcomeReviewCount: 0,
    firstPendingActionId: null,
    oldestPendingCompletedAt: null,
    firstOpenAlertId: null,
    firstOpenAlertSeverity: null,
    firstOpenAlertCreatedAt: null,
    get plantCount() {
      return hub.plantCount;
    },
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({ scopedGrow: null }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: { id: "grow-a", name: "Grow A" },
    grows: [{ id: "grow-a", name: "Grow A" }],
    loading: false,
  }),
}));

vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));

import Reports from "@/pages/Reports";
import { buildReportsHubOnboarding } from "@/lib/reportsHubOnboarding";

afterEach(() => {
  cleanup();
});

function renderReports() {
  render(
    <MemoryRouter>
      <Reports />
    </MemoryRouter>,
  );
}

it("hides the add-plant card when the hub reports one plant", () => {
  hub.plantCount = 1;
  renderReports();
  expect(buildReportsHubOnboarding).toHaveBeenCalledWith(
    expect.objectContaining({ plantCount: 1 }),
  );
  expect(screen.queryByTestId("reports-onboarding-card-add_plant")).not.toBeInTheDocument();
  expect(screen.getByTestId("reports-onboarding-card-add_sensor_snapshot")).toBeInTheDocument();
});

it("shows the add-plant card when the hub reports zero plants", () => {
  hub.plantCount = 0;
  renderReports();
  expect(buildReportsHubOnboarding).toHaveBeenCalledWith(
    expect.objectContaining({ plantCount: 0 }),
  );
  expect(screen.getByTestId("reports-onboarding-card-add_plant")).toBeInTheDocument();
});
