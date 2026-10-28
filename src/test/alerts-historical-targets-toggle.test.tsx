/**
 * VER-300 — the default /alerts list hides alerts on archived or removed
 * tents/plants behind a visible count toggle.
 *
 * Pins:
 *   - Default list shows only alerts on current targets.
 *   - The toggle names the hidden count and reveals them on demand.
 *   - Alerts are never resolved or changed by hiding (presentation only).
 *   - An incomplete name read hides nothing it cannot prove is removed.
 *   - No toggle when nothing is historical.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Alerts from "@/pages/Alerts";
import type { AlertTargetRecordState } from "@/lib/alertTargetContextRules";

const GROW = "44444444-4444-4444-8444-444444444444";
const TENT_ACTIVE = "11111111-1111-4111-8111-111111111111";
const TENT_SECOND = "12121212-1212-4121-8121-121212121212";
const TENT_ARCHIVED = "22222222-2222-4222-8222-222222222222";
const TENT_GONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function alertRow(id: string, title: string, tentId: string) {
  return {
    id,
    grow_id: GROW,
    tent_id: tentId,
    plant_id: null as string | null,
    source: "environment_alerts",
    severity: "warning" as const,
    status: "open" as const,
    metric: "rh",
    title,
    reason: "Humidity is high",
    first_seen_at: "2026-10-27T10:00:00Z",
    last_seen_at: "2026-10-27T10:30:00Z",
    acknowledged_at: null,
    resolved_at: null,
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:30:00Z",
  };
}

const ALERTS = [
  alertRow("alert-live", "Live tent humidity high", TENT_ACTIVE),
  alertRow("alert-second", "Second tent humidity high", TENT_SECOND),
  alertRow("alert-archived", "Archived tent humidity high", TENT_ARCHIVED),
  alertRow("alert-gone", "Removed tent humidity high", TENT_GONE),
];

// snip:safe — mutable fixtures let each case set the hook state it needs.
const state = vi.hoisted(() => ({
  alerts: [] as unknown[],
  readComplete: true,
  namesStatus: "ok" as "ok" | "loading",
  writes: vi.fn(),
  queue: vi.fn(),
}));

vi.mock("@/hooks/useAlertTargetNames", () => ({
  // Mirrors the real hook: maps stay empty until the read completes.
  useAlertTargetNames: () => {
    const loaded = state.namesStatus === "ok";
    return {
      status: state.namesStatus,
      readComplete: loaded && state.readComplete,
      tentNameById: loaded
        ? new Map([
            [TENT_ACTIVE, "Veg Tent"],
            [TENT_SECOND, "Mother Tent"],
            [TENT_ARCHIVED, "Old Flower Tent"],
          ])
        : new Map(),
      plantNameById: new Map(),
      tentStateById: loaded
        ? new Map<string, AlertTargetRecordState>([
            [TENT_ACTIVE, "active"],
            [TENT_SECOND, "active"],
            [TENT_ARCHIVED, "archived"],
          ])
        : new Map(),
      plantStateById: new Map(),
      singleTentIdByGrowId: new Map(),
    };
  },
}));
vi.mock("@/hooks/useAlertLinkedTargetEvidence", () => ({
  useAlertLinkedTargetEvidence: () => ({
    status: "ok",
    evidenceByAlertId: new Map(),
    idsLoading: false,
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: state.alerts, error: null, reload: () => {} }),
}));
vi.mock("@/lib/alerts", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    acknowledgeAlert: state.writes,
    resolveAlert: state.writes,
    dismissAlert: state.writes,
    reopenAlert: state.writes,
  };
});
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [], isError: false }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/",
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [], activeGrowId: null }),
}));
vi.mock("@/components/AlertsAutoPersistForGrow", () => ({ default: () => null }));
vi.mock("@/components/AlertWhyContext", () => ({ AlertWhyContext: () => null }));
vi.mock("@/components/LinkedActionCountBadge", () => ({ LinkedActionCountBadge: () => null }));
vi.mock("@/components/AlertRowActionQueueButton", () => ({
  AlertRowActionQueueButton: () => null,
  queueOpenAlertToActionQueue: state.queue,
}));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({
  default: ({ onBeforeNavigate }: { onBeforeNavigate?: () => unknown }) => (
    <button data-testid="loop-card" onClick={() => void onBeforeNavigate?.()} />
  ),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => new Map(),
}));
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function renderAlerts() {
  return render(
    <MemoryRouter>
      <Alerts />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.alerts = ALERTS;
  state.readComplete = true;
  state.namesStatus = "ok";
  state.queue.mockReset();
  state.queue.mockResolvedValue({ ok: true, actionQueueId: "aq-1" });
  state.writes.mockReset();
});

describe("/alerts — archived and removed targets hidden by default", () => {
  it("lists only alerts on current tents and names the hidden count", () => {
    renderAlerts();
    expect(screen.getByText("Live tent humidity high")).toBeTruthy();
    expect(screen.getByText("Second tent humidity high")).toBeTruthy();
    expect(screen.queryByText("Archived tent humidity high")).toBeNull();
    expect(screen.queryByText("Removed tent humidity high")).toBeNull();
    const toggle = screen.getByTestId("alerts-historical-targets-toggle");
    expect(toggle.textContent).toBe("Show archived targets (2)");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("the toggle reveals them, labelled, and hides them again", () => {
    renderAlerts();
    fireEvent.click(screen.getByTestId("alerts-historical-targets-toggle"));
    expect(screen.getByText("Archived tent humidity high")).toBeTruthy();
    expect(screen.getByText("Removed tent humidity high")).toBeTruthy();
    expect(screen.getByText("Archived tent: Old Flower Tent")).toBeTruthy();
    expect(screen.getByText("Tent removed")).toBeTruthy();
    const toggle = screen.getByTestId("alerts-historical-targets-toggle");
    expect(toggle.textContent).toBe("Hide archived targets (2)");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.queryByText("Archived tent humidity high")).toBeNull();
  });

  it("hiding never writes alert state", () => {
    renderAlerts();
    fireEvent.click(screen.getByTestId("alerts-historical-targets-toggle"));
    fireEvent.click(screen.getByTestId("alerts-historical-targets-toggle"));
    expect(state.writes).not.toHaveBeenCalled();
  });

  it("an incomplete read hides only the provably archived alert, never an unproven removal", () => {
    state.readComplete = false;
    renderAlerts();
    expect(screen.getByText("Removed tent humidity high")).toBeTruthy();
    expect(screen.queryByText("Archived tent humidity high")).toBeNull();
    expect(screen.getByTestId("alerts-historical-targets-toggle").textContent).toBe(
      "Show archived targets (1)",
    );
  });

  it("no toggle when every alert is on a current target", () => {
    state.alerts = ALERTS.slice(0, 2);
    renderAlerts();
    expect(screen.queryByTestId("alerts-historical-targets-toggle")).toBeNull();
  });

  it("all-historical list shows the empty state plus the toggle", () => {
    state.alerts = ALERTS.slice(2);
    renderAlerts();
    expect(screen.getByTestId("alerts-empty-state")).toBeTruthy();
    expect(screen.getByTestId("alerts-historical-targets-toggle").textContent).toBe(
      "Show archived targets (2)",
    );
  });

  it("the loop next-step card ignores alerts on historical targets", () => {
    state.alerts = ALERTS.slice(2);
    renderAlerts();
    fireEvent.click(screen.getByTestId("alerts-historical-targets-toggle"));
    expect(screen.queryByTestId("loop-card")).toBeNull();
  });

  it("the loop card auto-queues the sole current-target alert once names are read", async () => {
    state.alerts = ALERTS.slice(0, 1);
    renderAlerts();
    fireEvent.click(screen.getByTestId("loop-card"));
    await waitFor(() => expect(state.queue).toHaveBeenCalledTimes(1));
  });

  it("the loop card never auto-queues while target names are still loading", async () => {
    state.alerts = ALERTS.slice(2, 3); // only an archived-tent alert
    state.namesStatus = "loading";
    renderAlerts();
    fireEvent.click(screen.getByTestId("loop-card"));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.queue).not.toHaveBeenCalled();
  });
});
