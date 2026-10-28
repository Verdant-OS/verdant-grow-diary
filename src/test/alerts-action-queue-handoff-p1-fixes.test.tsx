import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import Alerts from "@/pages/Alerts";
import { ActionQueueCreateButton } from "@/components/ActionQueueCreateButton";
import { queueOpenAlertToActionQueue } from "@/components/AlertRowActionQueueButton";
import DailyCheck from "@/pages/DailyCheck";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const OPEN_ALERT = {
  id: "alert-row-p1-1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: null,
  title: "Humidity rising",
  reason: "RH above target (72% > 60%)",
  metric: "humidity_pct",
  severity: "warning" as const,
  status: "open" as const,
  source: "environment_alerts",
  first_seen_at: "2026-05-29T10:00:00Z",
  last_seen_at: "2026-05-29T10:00:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-29T10:00:00Z",
  updated_at: "2026-05-29T10:00:00Z",
};

const listAlertsMock = vi.fn();
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let createGate: { promise: Promise<void>; resolve: () => void } | null = null;
let rpcNextResult: { data: unknown; error: { code?: string; message: string } | null } | null =
  null;
let rpcShouldThrow = false;

const mockPlants = [
  {
    id: "p1",
    name: "Sour D",
    strain: "Sour Diesel",
    grow_id: "g1",
    tent_id: "t1",
    is_archived: false,
  },
];
const mockTents = [{ id: "t1", name: "Tent A", grow_id: "g1" }];

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mockTents, isLoading: false }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: mockPlants, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/components/AlertsAutoPersistForGrow", () => ({ default: () => null }));
vi.mock("@/components/AlertsContextHeaderForGrow", () => ({ default: () => null }));
vi.mock("@/components/AlertsEmptyStateSnapshotCta", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
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

vi.mock("@/lib/alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
  return {
    ...actual,
    listAlerts: (...args: unknown[]) => listAlertsMock(...args),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    dismissAlert: vi.fn(),
    logAlertEvent: vi.fn(),
  };
});

vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
const EMPTY_COUNTS_MAP = new Map<string, { count: number; singleActionId: string | null }>();
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => EMPTY_COUNTS_MAP,
}));

const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } } as const;
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
} as const;
const SCOPED_GROW_STATE = {
  urlGrowId: null,
  scopedGrowName: null,
  isValidScopedGrow: false,
  backHref: "/actions",
} as const;

vi.mock("@/store/auth", () => ({ useAuth: () => AUTH_STATE }));
vi.mock("@/store/grows", () => ({ useGrows: () => GROWS_STATE }));
vi.mock("@/hooks/useScopedGrow", () => ({ useScopedGrow: () => SCOPED_GROW_STATE }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    message: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeThenable = () => {
    const obj: Record<string, unknown> = {
      eq: () => makeThenable(),
      in: () => makeThenable(),
      order: () => makeThenable(),
      limit: () => makeThenable(),
      abortSignal: () => makeThenable(),
      then: (onFulfilled: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    };
    return obj;
  };
  return {
    supabase: {
      from: () => ({
        select: () => makeThenable(),
        eq: () => makeThenable(),
        in: () => makeThenable(),
        order: () => makeThenable(),
        limit: () => makeThenable(),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (rpcShouldThrow) {
          throw new Error("Simulated network failure");
        }
        if (createGate) {
          await createGate.promise;
        }
        if (rpcNextResult) {
          return rpcNextResult;
        }
        return {
          data: {
            ok: true,
            action_queue_id: `created-action-${rpcCalls.length}`,
            grow_id: args.p_grow_id ?? "g1",
            status: "pending_approval",
            event_id: `ev-${rpcCalls.length}`,
            reused: false,
          },
          error: null,
        };
      },
    },
  };
});

beforeEach(() => {
  listAlertsMock.mockReset();
  rpcCalls.length = 0;
  createGate = null;
  rpcNextResult = null;
  rpcShouldThrow = false;
  toastSuccess.mockClear();
  toastError.mockClear();
  toastWarning.mockClear();
});

describe("PR #2190 review fixes — Codex P1s & CodeRabbit findings", () => {
  it("Codex P1 #1: does NOT silently pick an alert when multiple unlinked open alerts exist on /alerts", async () => {
    const secondAlert = {
      ...OPEN_ALERT,
      id: "alert-row-p1-2",
      title: "Temperature rising",
      metric: "temperature_c",
      reason: "Temperature is high (31C > 28C)",
    };
    listAlertsMock.mockResolvedValue([OPEN_ALERT, secondAlert]);
    function LocationDisplay() {
      const loc = useLocation();
      return (
        <div data-testid="loc-probe">
          {loc.pathname}
          {loc.search}
        </div>
      );
    }
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
        <LocationDisplay />
      </MemoryRouter>,
    );

    const loopCta = await screen.findByTestId("alerts-one-tent-loop-next-step-card-cta");
    await act(async () => {
      fireEvent.click(loopCta);
    });

    // Must not silently pick the first alert when multiple open alerts exist
    expect(rpcCalls).toHaveLength(0);
    expect(screen.getByTestId("loc-probe")).toHaveTextContent("/actions");
  });

  it("Codex P1 #2 & #3: waits for queue creation before navigating and routes to the created action's grow", async () => {
    let resolveGate!: () => void;
    createGate = {
      promise: new Promise<void>((res) => {
        resolveGate = res;
      }),
      resolve: () => resolveGate(),
    };
    const otherGrowAlert = { ...OPEN_ALERT, id: "alert-other-grow", grow_id: "g2" };
    listAlertsMock.mockResolvedValue([otherGrowAlert]);
    function LocationDisplay() {
      const loc = useLocation();
      return (
        <div data-testid="loc-probe">
          {loc.pathname}
          {loc.search}
        </div>
      );
    }
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
        <LocationDisplay />
      </MemoryRouter>,
    );

    const loopCta = await screen.findByTestId("alerts-one-tent-loop-next-step-card-cta");
    fireEvent.click(loopCta);

    // P1 #2: While the RPC is in-flight, navigation must NOT happen yet
    expect(rpcCalls).toHaveLength(1);
    expect(screen.getByTestId("loc-probe")).toHaveTextContent("/alerts");

    // Once resolved, navigates to /actions?growId=g2 (P1 #3: alert's grow)
    await act(async () => {
      createGate?.resolve();
      await createGate?.promise;
    });

    expect(rpcCalls[0].args).toMatchObject({
      p_grow_id: "g2",
      p_tent_id: "t1",
      p_action_type: "advisory",
      p_source: "environment_alert",
      p_dedupe_key: "env_alert:alert-other-grow",
    });
    expect(rpcCalls[0].args).not.toHaveProperty("p_user_id");
    expect(rpcCalls[0].args).not.toHaveProperty("p_target_device");
    await waitFor(() =>
      expect(screen.getByTestId("loc-probe")).toHaveTextContent("/actions?growId=g2"),
    );
  });

  it("CodeRabbit: ActionQueueCreateButton re-enables submit when createActionQueueItem throws", async () => {
    rpcShouldThrow = true;
    render(<ActionQueueCreateButton growId="g1" />);
    fireEvent.click(screen.getByTestId("action-queue-create-button"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Suggested action/i), {
      target: { value: "Check airflow" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Reason/i), {
      target: { value: "Warm canopy" },
    });

    const submit = within(dialog).getByTestId("action-queue-create-submit");
    await act(async () => {
      fireEvent.click(submit);
    });

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not add this action to the queue/i),
    );
    expect(submit).not.toBeDisabled();
    expect(within(dialog).getByTestId("action-queue-create-cancel")).not.toBeDisabled();
  });

  it("CodeRabbit: queueOpenAlertToActionQueue uses generic failure copy for forbidden rather than Lineage Repair", async () => {
    rpcNextResult = { data: { ok: false, reason: "forbidden" }, error: null };

    const res = await queueOpenAlertToActionQueue(OPEN_ALERT);

    expect(res.ok).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(
      "Could not add this action to the queue. Please try again.",
    );
  });

  it("CodeRabbit: Daily Check warns when an unsaved manual step is revisited after Skip and Next is pressed", () => {
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

    // Skip Step 3
    fireEvent.click(screen.getByTestId("daily-grow-check-skip-manual"));
    expect(screen.getByText(/Step 4 · Quick Log/i)).toBeInTheDocument();
    expect(toastWarning).not.toHaveBeenCalled();

    // Return via Back to Step 3 and press Next without saving
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText(/Step 3 · Add Manual Sensor Snapshot/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("daily-grow-check-next"));

    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning.mock.calls[0][0]).toMatch(/no manual snapshot saved/i);
    expect(screen.getByTestId("daily-grow-check-manual-empty-warning")).toBeInTheDocument();
  });
});
