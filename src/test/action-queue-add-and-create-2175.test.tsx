import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import Alerts from "@/pages/Alerts";
import ActionQueue from "@/pages/ActionQueue";
import { ActionQueueRpcStatusPill } from "@/components/ActionQueueRpcStatusPill";

const OPEN_ALERT = {
  id: "alert-row-2175",
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
let actionQueueRows: Array<Record<string, unknown>> = [];
let linkedActionCountsMap = new Map<string, { count: number; singleActionId: string | null }>();

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [], isError: false }),
}));
vi.mock("@/components/AlertsAutoPersistForGrow", () => ({ default: () => null }));
vi.mock("@/components/AlertsContextHeaderForGrow", () => ({ default: () => null }));
vi.mock("@/components/AlertsEmptyStateSnapshotCta", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));

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
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => linkedActionCountsMap,
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

vi.mock("@/store/auth", () => ({
  useAuth: () => AUTH_STATE,
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => GROWS_STATE,
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => SCOPED_GROW_STATE,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const resolveData = () => {
      if (table === "action_queue") {
        return Promise.resolve({ data: actionQueueRows, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    const makeThenable = () => {
      const obj: Record<string, unknown> = {
        eq: () => makeThenable(),
        in: () => makeThenable(),
        order: () => makeThenable(),
        limit: () => makeThenable(),
        abortSignal: () => makeThenable(),
        then: (onFulfilled: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          resolveData().then(onFulfilled, onRejected),
      };
      return obj;
    };
    return {
      select: () => makeThenable(),
      eq: () => makeThenable(),
      in: () => makeThenable(),
      order: () => makeThenable(),
      limit: () => makeThenable(),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    };
  };
  return {
    supabase: {
      from: (t: string) => makeChain(t),
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (fn === "action_queue_create") {
          const newId = `created-action-${rpcCalls.length}`;
          const newRow = {
            id: newId,
            grow_id: args.p_grow_id ?? "g1",
            tent_id: args.p_tent_id ?? null,
            plant_id: args.p_plant_id ?? null,
            source: args.p_source ?? "manual",
            action_type: args.p_action_type ?? "advisory",
            target_metric: args.p_target_metric ?? null,
            target_device: null,
            suggested_change: args.p_suggested_change ?? "",
            reason: args.p_reason ?? "",
            risk_level: args.p_risk_level ?? "low",
            status: "pending_approval",
            approved_at: null,
            rejected_at: null,
            completed_at: null,
            created_at: new Date().toISOString(),
          };
          actionQueueRows = [newRow, ...actionQueueRows];
          return Promise.resolve({
            data: {
              ok: true,
              action_queue_id: newId,
              grow_id: newRow.grow_id,
              status: "pending_approval",
              event_id: `ev-${rpcCalls.length}`,
              reused: false,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});

beforeEach(() => {
  listAlertsMock.mockReset();
  rpcCalls.length = 0;
  actionQueueRows = [];
  linkedActionCountsMap = new Map();
  toastSuccess.mockClear();
  toastError.mockClear();
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();
});

describe("Issue #2175 — Add to Action Queue creates approval-required item and /actions has a create control", () => {
  it("clicking 'Add to Action Queue' on an open alert in /alerts creates a pending_approval item and updates the alert row status", async () => {
    listAlertsMock.mockResolvedValue([OPEN_ALERT]);
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );

    const addBtn = await screen.findByTestId("alert-row-add-to-action-queue");
    expect(addBtn).toHaveTextContent("Add to Action Queue");

    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("action_queue_create");
    expect(rpcCalls[0].args).toMatchObject({
      p_grow_id: "g1",
      p_tent_id: "t1",
      p_action_type: "advisory",
      p_source: "environment_alert",
      p_dedupe_key: `env_alert:${OPEN_ALERT.id}`,
    });
    expect(rpcCalls[0].args).not.toHaveProperty("p_user_id");
    expect(rpcCalls[0].args).not.toHaveProperty("p_target_device");

    // Status on the source alert card updates to show the queued link and "Has linked action"
    const queuedLink = await screen.findByTestId("alert-row-already-queued-link");
    expect(queuedLink).toHaveTextContent(/Queued for approval/i);
    expect(queuedLink.getAttribute("href")).toBe("/actions/created-action-1");
    expect(screen.getByTestId("alert-row-linked-action")).toHaveTextContent(/Has linked action/i);
  });

  it("/actions exposes a manual 'Add action' control that creates an approval-required item and lists it (1–1 of 1)", async () => {
    render(
      <MemoryRouter initialEntries={["/actions"]}>
        <ActionQueue />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("action-queue-pagination-range")).toHaveTextContent("0 of 0"),
    );

    // Must not show "Not confirmed yet" on an empty queue before any transition is attempted
    expect(screen.queryByText("Not confirmed yet")).not.toBeInTheDocument();

    const createBtn = screen.getByTestId("action-queue-create-button");
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Suggested action/i), {
      target: { value: "Check canopy airflow and inspect lower leaves" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Reason/i), {
      target: { value: "Observed warm top canopy during afternoon check" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByTestId("action-queue-create-submit"));
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("action_queue_create");
    expect(rpcCalls[0].args).toMatchObject({
      p_grow_id: "g1",
      p_source: "manual",
      p_action_type: "advisory",
      p_suggested_change: "Check canopy airflow and inspect lower leaves",
      p_reason: "Observed warm top canopy during afternoon check",
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-queue-pagination-range")).toHaveTextContent(
        "Showing 1–1 of 1",
      ),
    );
    expect(screen.getByText("Check canopy airflow and inspect lower leaves")).toBeInTheDocument();
    // Item remains pending_approval (Needs Review), never auto-executed
    expect(screen.getByRole("button", { name: /approve action/i })).toBeInTheDocument();
  });

  it("ActionQueueRpcStatusPill still renders all states in isolation, while /actions hides the unconfirmed pill when 0 pending actions exist", async () => {
    const { unmount } = render(<ActionQueueRpcStatusPill availability="unknown" />);
    expect(screen.getByTestId("action-queue-transition-rpc-status-pill")).toHaveTextContent(
      "Not confirmed yet",
    );
    unmount();

    render(
      <MemoryRouter initialEntries={["/actions"]}>
        <ActionQueue />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("action-queue-pagination-range")).toHaveTextContent("0 of 0"),
    );
    expect(screen.queryByTestId("action-queue-transition-rpc-status-pill")).not.toBeInTheDocument();
  });

  it("clicking the One-Tent Loop 'Add to Action Queue' CTA on /alerts queues the open alert and navigates to /actions where it is listed", async () => {
    listAlertsMock.mockResolvedValue([OPEN_ALERT]);
    function LocationDisplay() {
      const loc = useLocation();
      return <div data-testid="loc-probe">{loc.pathname}</div>;
    }
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
        <LocationDisplay />
      </MemoryRouter>,
    );

    const loopCta = await screen.findByTestId("alerts-one-tent-loop-next-step-card-cta");
    expect(loopCta).toHaveTextContent(/Add to Action Queue/i);

    await act(async () => {
      fireEvent.click(loopCta);
    });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("action_queue_create");
    expect(screen.getByTestId("loc-probe")).toHaveTextContent("/actions");
  });
});
