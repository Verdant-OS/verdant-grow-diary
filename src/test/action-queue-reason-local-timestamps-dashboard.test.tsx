/**
 * Dashboard action card — copied alert reasons show a local reading time.
 *
 * Environment alert reasons carry "Reading at <ISO>." and that text is copied
 * into action_queue.reason. The dashboard approval-queue card must render it
 * through localizeReadingAtTimestamps. The Dashboard mock set is reused from
 * qa-2155-2156-2160-temperature-units-and-csv-export.test.tsx; the /actions
 * row, drawer and /actions/:id header are pinned in
 * action-queue-reason-local-timestamps.test.tsx.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SensorReading } from "@/mock";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";

const H = vi.hoisted(() => ({
  scoped: true,
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  secondTentId: "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70",
  secondTentEnabled: false,
  aggregateRows: [] as unknown[],
  perTentRows: [] as unknown[],
  secondTentRows: [] as unknown[],
  quickLogManuals: [] as SensorReading[],
  alertRows: [] as unknown[],
  snapshotState: null as SnapshotState | null,
  pendingItems: [
    {
      id: "aq-1",
      grow_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tent_id: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
      plant_id: null,
      source: "environment_alert",
      action_type: "lower_humidity",
      target_metric: "humidity_pct",
      suggested_change: "Lower humidity to 45%",
      reason:
        "Humidity is above the flower target range. Observed 70% (flower range 40%–50%). " +
        "Reading at 2026-10-15T15:54:26.221+00:00. [alert:alert-1]",
      risk_level: "medium",
      status: "pending_approval",
      created_at: "2026-10-15T16:00:00Z",
      updated_at: "2026-10-15T16:00:00Z",
    },
  ] as unknown[],
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      {
        id: H.tentId,
        name: "Main Tent",
        brand: "",
        size: "",
        stage: "veg",
        light: { on: false, schedule: "", wattage: 0 },
        alertCount: 0,
        growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      ...(H.secondTentEnabled
        ? [
            {
              id: H.secondTentId,
              name: "Second Tent",
              brand: "",
              size: "",
              stage: "veg",
              light: { on: false, schedule: "", wattage: 0 },
              alertCount: 0,
              growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ]
        : []),
    ],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: H.aggregateRows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: {
      [H.tentId]: H.perTentRows,
      [H.secondTentId]: H.secondTentRows,
    },
    statusByTent: {
      [H.tentId]: "success",
      [H.secondTentId]: "success",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: H.quickLogManuals,
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: () => Promise.resolve([]),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: H.scoped ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    scopedGrow: H.scoped
      ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "QA Grow", stage: "veg" }
      : null,
    scopedGrowName: "QA Grow",
    isValidScopedGrow: H.scoped,
    backHref: null,
  }),
}));

vi.mock("@/hooks/useDashboardScopedData", () => ({
  useDashboardScopedData: () => ({
    recent: { status: "ok", items: [] },
    pending: { status: "ok", items: H.pendingItems },
  }),
}));

vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: "idle",
    summary: { count: 0, latestAt: null, latestSource: null },
  }),
}));

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () =>
    H.snapshotState ?? {
      status: "ok",
      snapshot: {
        source: "manual",
        ts: "2026-10-15T12:00:00.000Z",
        tent_id: H.tentId,
        temp: 35,
        rh: 55,
        vpd: 1.1,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
        csvVendor: null,
      },
    },
}));

vi.mock("@/hooks/useEnvironmentTrends", () => ({
  useEnvironmentTrends: () => ({
    status: "idle",
    trends: {
      status: "empty",
      headline: "No trend data yet",
      count: 0,
      latestTs: null,
      source: "unavailable",
      temp: { avg: null, min: null, max: null, count: 0 },
      rh: { avg: null, min: null, max: null, count: 0 },
      vpd: { avg: null, min: null, max: null, count: 0 },
    },
  }),
}));

vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "ok", targets: null, reload: vi.fn() }),
}));

vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: () => undefined,
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({
    status: "ok",
    alerts: H.alertRows,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/hooks/useNowTick", () => ({
  useNowTick: () => Date.parse("2026-10-15T12:05:00.000Z"),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "QA Grow", stage: "veg" }],
    activeGrowId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/DashboardDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/DashboardOperatorAccountReadModels", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/GuidedActionChecklistPanel", () => ({ default: () => null }));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/TonightTentHomeCard", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentRibbon", () => ({ default: () => null }));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Dashboard action card reason — local reading time", () => {
  it("shows a local time, not the raw ISO timestamp", () => {
    renderDashboard();
    const text = screen.getByTestId("dashboard-approval-queue-item").textContent ?? "";
    expect(text).toContain("Humidity is above the flower target range.");
    expect(text).toContain("Reading at");
    expect(text).not.toContain("2026-10-15T");
    expect(text).not.toContain("[alert:");
  });
});
