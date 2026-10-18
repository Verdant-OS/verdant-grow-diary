/**
 * Fail-first regression tests for PR #2190 round-2 P1 & review fixes:
 *  - AlertRowActionQueueButton L39 (Codex P1 & CodeRabbit): Catch rejected alert
 *    queue requests in `queueOpenAlertToActionQueue` so neither the per-row button
 *    nor `OneTentLoopNextStepCard` locks or leaks an unhandled rejection.
 *  - OneTentLoopNextStepCard L148 (Codex P1 & CodeRabbit): Wait for queue creation
 *    before navigating and recover cleanly (`aria-disabled` cleared, no navigation)
 *    even if `onBeforeNavigate` rejects or throws.
 *  - Alerts L310 / L234 (Codex P1 & CodeRabbit): Route the created action's grow
 *    (`singleUnlinkedOpenAlert.grow_id`) to `/actions` even when `/alerts` was
 *    opened with a stale/invalid `?growId=` URL parameter.
 *  - DailyCheck L502 (CodeRabbit): Do not let a previous check's sensor save
 *    suppress the empty-manual-step warning after "Run another check".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "@/lib/react-router-compat";

const { rpcMock, fromMock, toastSuccess, toastError, toastWarning } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  },
}));

const AUTH_STATE = { user: { id: "user-1" }, loading: false } as const;
vi.mock("@/store/auth", () => ({
  useAuth: () => AUTH_STATE,
}));

const GROWS_LIST = [
  { id: "g1", name: "Veg Run", status: "active", stage: "vegetative" },
  { id: "g2", name: "Flower Run", status: "active", stage: "flowering" },
];
const ACTIVE_GROW = GROWS_LIST[0];
const GROWS_STATE = {
  grows: GROWS_LIST,
  activeGrow: ACTIVE_GROW,
  activeGrowId: "g1" as string | null,
  setActiveGrowId: vi.fn(),
  loading: false,
  refresh: vi.fn(),
};

vi.mock("@/store/grows", () => ({
  useGrows: () => GROWS_STATE,
}));

const MOCK_TENTS = [{ id: "t1", name: "Main 4x4", grow_id: "g2" }];
const TENTS_QUERY = { data: MOCK_TENTS, isLoading: false };
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => TENTS_QUERY,
}));

const MOCK_PLANTS = [
  {
    id: "p1",
    name: "Blue Dream #1",
    strain: "Blue Dream",
    stage: "flowering",
    tent_id: "t1",
    grow_id: "g2",
    is_archived: false,
  },
];
const PLANTS_QUERY = { data: MOCK_PLANTS, isLoading: false, isError: false };
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => PLANTS_QUERY,
}));

const EMPTY_READINGS: unknown[] = [];
const READINGS_QUERY = { data: EMPTY_READINGS, isLoading: false };
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => READINGS_QUERY,
}));

vi.mock("@/components/AlertsAutoPersistForGrow", () => ({
  default: () => null,
}));

vi.mock("@/components/AlertsContextHeaderForGrow", () => ({
  default: () => <div data-testid="alerts-context-header-stub" />,
}));

vi.mock("@/components/AlertsEmptyStateSnapshotCta", () => ({
  default: () => null,
}));

vi.mock("@/components/GrowTargetsEditor", () => ({
  default: () => null,
}));

vi.mock("@/components/ManualSensorReadingCard", () => ({
  default: () => <div data-testid="mock-manual-card" />,
}));

vi.mock("@/components/QuickLog", () => ({
  default: () => <div data-testid="mock-quicklog" />,
}));

vi.mock("@/components/PlantStatusStrip", () => ({
  default: () => <div data-testid="mock-status-strip" />,
}));

vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({
  default: () => <div data-testid="mock-alerts-panel" />,
}));

vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({
  default: () => <div data-testid="mock-actions-panel" />,
}));

vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({
  default: () => <div data-testid="mock-onboarding" />,
}));

vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: () => <div data-testid="daily-check-all-activities" />,
}));

vi.mock("@/components/TentAlertsBlueprintHint", () => ({
  default: () => null,
}));

const TARGET_NAMES = {
  tentNames: new Map([["t1", "Main 4x4"]]),
  plantNames: new Map([["p1", "Blue Dream #1"]]),
  growNames: new Map([
    ["g1", "Veg Run"],
    ["g2", "Flower Run"],
  ]),
};
vi.mock("@/hooks/useAlertTargetNames", () => ({
  useAlertTargetNames: () => TARGET_NAMES,
}));

const EMPTY_EVIDENCE_MAP = new Map();
vi.mock("@/hooks/useAlertLinkedTargetEvidence", () => ({
  useAlertLinkedTargetEvidence: () => EMPTY_EVIDENCE_MAP,
}));

let mockAlertsList: Array<Record<string, unknown>> = [];
const reloadMock = vi.fn();

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({
    status: "ready",
    alerts: mockAlertsList,
    error: null,
    reload: reloadMock,
  }),
}));

const EMPTY_COUNTS_MAP = new Map<string, { count: number; singleActionId: string | null }>();
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => EMPTY_COUNTS_MAP,
}));

import Alerts from "@/pages/Alerts";
import DailyCheck from "@/pages/DailyCheck";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import {
  AlertRowActionQueueButton,
  queueOpenAlertToActionQueue,
} from "@/components/AlertRowActionQueueButton";
import { DAILY_GROW_CHECK_EMPTY_MANUAL_STEP_WARNING } from "@/lib/dailyGrowCheckRules";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{`${loc.pathname}${loc.search}`}</div>;
}

describe("PR #2190 round-2 P1 & review fixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlertsList = [];
  });

  it("AlertRowActionQueueButton L39: queueOpenAlertToActionQueue catches rejected RPCs, shows failure toast, and re-enables row button", async () => {
    rpcMock.mockRejectedValueOnce(new Error("transport disconnected"));

    const directResult = await queueOpenAlertToActionQueue({
      id: "alert-reject-1",
      grow_id: "g2",
      tent_id: "t1",
      plant_id: "p1",
      metric: "humidity_pct",
      severity: "warning",
      status: "open",
      title: "High humidity",
      reason: "RH 74% exceeds target",
    });

    expect(directResult).toEqual({ ok: false });
    expect(toastError).toHaveBeenCalledWith(
      "Could not add this action to the queue. Please try again.",
    );

    toastError.mockClear();
    rpcMock.mockRejectedValueOnce(new Error("transport disconnected again"));

    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <AlertRowActionQueueButton
          alert={{
            id: "alert-reject-2",
            grow_id: "g2",
            tent_id: "t1",
            plant_id: "p1",
            metric: "humidity_pct",
            severity: "warning",
            status: "open",
            title: "High humidity",
            reason: "RH 74% exceeds target",
          }}
          linkedSummary={undefined}
        />
      </MemoryRouter>,
    );

    const rowBtn = screen.getByTestId("alert-row-add-to-action-queue");
    fireEvent.click(rowBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Could not add this action to the queue. Please try again.",
      );
    });
    await waitFor(() => {
      expect(rowBtn).not.toBeDisabled();
    });
  });

  it("OneTentLoopNextStepCard L148: catches rejected onBeforeNavigate without unhandled rejection, does not navigate, and clears aria-disabled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const rejectingCallback = vi.fn().mockRejectedValueOnce(new Error("network failure"));

      render(
        <MemoryRouter initialEntries={["/alerts"]}>
          <Routes>
            <Route
              path="/alerts"
              element={
                <>
                  <OneTentLoopNextStepCard
                    current="alert"
                    ids={{ growId: "g2" }}
                    testId="alerts-one-tent-loop-next-step-card"
                    onBeforeNavigate={rejectingCallback}
                  />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/actions" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>,
      );

      const cta = screen.getByTestId("alerts-one-tent-loop-next-step-card-cta");
      fireEvent.click(cta);

      await waitFor(() => {
        expect(rejectingCallback).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(cta.getAttribute("aria-disabled")).toBeNull();
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toHaveLength(0);
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/alerts");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("Alerts L310 / L234: routes to the queued alert's grow_id even when URL has an invalid growId", async () => {
    mockAlertsList = [
      {
        id: "alert-g2-only",
        grow_id: "g2",
        tent_id: "t1",
        plant_id: "p1",
        metric: "humidity_pct",
        severity: "warning",
        status: "open",
        title: "High humidity in Main 4x4",
        reason: "RH 74% exceeds target",
        first_seen_at: "2026-10-15T10:00:00.000Z",
        last_seen_at: "2026-10-15T10:05:00.000Z",
        source: "environment_alerts",
      },
    ];

    rpcMock.mockImplementation((fn: string) => {
      if (fn === "action_queue_create") {
        return Promise.resolve({
          data: {
            ok: true,
            action_queue_id: "aq-created-g2",
            grow_id: "g2",
            status: "pending_approval",
            reused: false,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/alerts?growId=stale-invalid-grow"]}>
          <Routes>
            <Route
              path="/alerts"
              element={
                <>
                  <Alerts />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/actions" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const loopCta = await screen.findByTestId("alerts-one-tent-loop-next-step-card-cta");
    expect(loopCta.getAttribute("href")).toBe("/actions?growId=g2");

    fireEvent.click(loopCta);

    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/actions?growId=g2");
    });
  });

  it("DailyCheck L502: resets lastSubmittedSource on 'Run another check' so a new check warns on an empty manual step", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/daily-check?plantId=p1"]}>
          <DailyCheck />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();

    // Simulate a saved manual sensor snapshot during the first check.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("verdant:sensor-reading-created", {
          detail: { createdAt: "2026-10-16T12:00:00.000Z" },
        }),
      );
    });

    // Advance to done and click "Run another check".
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    fireEvent.click(screen.getByTestId("daily-grow-check-skip-quicklog"));
    fireEvent.click(screen.getByTestId("daily-grow-check-skip-handheld"));
    fireEvent.click(screen.getByTestId("daily-grow-check-finish"));

    fireEvent.click(screen.getByTestId("daily-grow-check-restart"));

    toastWarning.mockClear();

    // Start the second check and navigate to Step 3 (manual), then press Next without saving.
    fireEvent.click(screen.getByTestId("daily-grow-check-start"));
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));
    expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("daily-grow-check-next"));

    expect(toastWarning).toHaveBeenCalledWith(DAILY_GROW_CHECK_EMPTY_MANUAL_STEP_WARNING);
  });
});
