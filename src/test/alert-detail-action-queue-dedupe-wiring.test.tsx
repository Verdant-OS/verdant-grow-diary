/**
 * AlertDetail — Action Queue dedupe wiring + sensor source badge tests.
 *
 * Validates that the page now drives the Add/Already-queued button
 * branching from the pure helper `decideAddButtonState`, that
 * `shouldBlockInsert` prevents fast double-click duplicate inserts, and
 * that the unified `buildSensorSourceBadge` chip renders for known
 * sensor reading sources without ever leaking the [alert:<id>] token,
 * raw alert id, or grow id.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";

async function flushAsync(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
async function clickAct(el: Element) {
  await act(async () => {
    fireEvent.click(el);
  });
}

const BASE_ALERT = {
  id: "alert-uuid-1",
  grow_id: "grow-uuid-1",
  tent_id: "tent-uuid-1",
  plant_id: null as string | null,
  source: "environment_alerts",
  severity: "warning",
  status: "open",
  metric: "humidity_pct",
  title: "Humidity is high",
  reason: "Humidity is high (78% > 65%)",
  first_seen_at: "2026-05-30T10:00:00Z",
  last_seen_at: "2026-05-30T10:30:00Z",
  acknowledged_at: null,
  resolved_at: null,
  created_at: "2026-05-30T10:00:00Z",
  updated_at: "2026-05-30T10:30:00Z",
};

let currentAlert: typeof BASE_ALERT = BASE_ALERT;
let existingMatchingActionRows: Array<Record<string, unknown>> = [];
let actionQueueInsertResult: { data: unknown; error: { code?: string; message: string } | null } = {
  data: { id: "new-action-uuid-1", grow_id: "grow-uuid-1" },
  error: null,
};
let insertDelayMs = 0;

const inserts: Array<{ table: string; payload: unknown }> = [];

vi.mock("@/lib/alerts", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/alerts");
  return {
    ...actual,
    getAlertById: vi.fn(async () => currentAlert),
    logAlertEvent: vi.fn(async () => undefined),
  };
});
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ events: [] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-uuid-1", name: "G1" }],
    activeGrowId: "grow-uuid-1",
    activeGrow: { id: "grow-uuid-1", name: "G1" },
  }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  type Result = { data: unknown; error: unknown };

  const makeSelectChain = (table: string) => {
    let currentSource: string | null = null;
    const resolveSelect = (): Result => {
      if (table === "action_queue") {
        const rows = currentSource
          ? existingMatchingActionRows.filter((r) => r.source === currentSource)
          : existingMatchingActionRows;
        return { data: rows, error: null };
      }
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        if (col === "source") currentSource = val;
        return chain;
      },
      in: () => chain,
      like: () => chain,
      contains: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(resolveSelect()),
      then: (resolve: (r: Result) => unknown) => resolve(resolveSelect()),
    };
    return chain;
  };

  const makeInsert = (table: string, payload: unknown) => {
    inserts.push({ table, payload });
    if (table === "action_queue") {
      const wrapper = {
        select: () => ({
          single: () =>
            new Promise((resolve) => {
              setTimeout(() => resolve(actionQueueInsertResult), insertDelayMs);
            }),
        }),
        then: (resolve: (r: typeof actionQueueInsertResult) => unknown) =>
          resolve(actionQueueInsertResult),
      };
      return wrapper;
    }
    return Promise.resolve({ data: null, error: null });
  };

  return {
    supabase: {
      from: (table: string) => ({
        ...makeSelectChain(table),
        insert: (payload: unknown) => makeInsert(table, payload),
      }),
    },
  };
});

beforeEach(() => {
  currentAlert = BASE_ALERT;
  existingMatchingActionRows = [];
  actionQueueInsertResult = {
    data: { id: "new-action-uuid-1", grow_id: "grow-uuid-1" },
    error: null,
  };
  insertDelayMs = 0;
  inserts.length = 0;
  toastSuccess.mockClear();
  toastError.mockClear();
  toastWarning.mockClear();
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${currentAlert.id}`]}>
      <Routes>
        <Route path="/alerts/:alertId" element={<AlertDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const actionQueueInserts = () => inserts.filter((i) => i.table === "action_queue");

describe("AlertDetail — decideAddButtonState wiring", () => {
  it("renders Add to Action Queue and exposes can_add decision state when eligible", async () => {
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    const region = screen.getByTestId("alert-handoff-decision");
    await waitFor(() =>
      expect(region.getAttribute("data-decision-state")).toBe("can_add"),
    );
    expect(region.getAttribute("data-decision-reason")).toBe("ok_can_add");
  });

  it("renders Already in Action Queue when a non-terminal duplicate exists", async () => {
    existingMatchingActionRows = [
      {
        id: "existing-aq-2",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-uuid-1]",
        grow_id: "grow-uuid-1",
      },
    ];
    renderDetail();
    const link = (await screen.findByTestId(
      "alert-handoff-already-queued-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/actions/existing-aq-2");
    expect(screen.queryByTestId("alert-handoff-add-button")).toBeNull();
    const region = screen.getByTestId("alert-handoff-decision");
    expect(region.getAttribute("data-decision-state")).toBe("already_exists");
  });

  it("fast double-click creates exactly one action_queue insert", async () => {
    insertDelayMs = 40;
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");
    // Two rapid clicks before the insert promise resolves.
    await clickAct(btn);
    await clickAct(btn);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(actionQueueInserts()).toHaveLength(1);
  });

  it("never leaks raw [alert:<id>] tokens, alert id, or grow id in handoff region", async () => {
    existingMatchingActionRows = [
      {
        id: "existing-aq-2",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-uuid-1]",
        grow_id: "grow-uuid-1",
      },
    ];
    renderDetail();
    const region = await screen.findByTestId("alert-handoff-region");
    const text = region.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("alert-uuid-1");
    expect(text).not.toContain("grow-uuid-1");
  });
});

describe("AlertDetail — sensor source badge wiring", () => {
  it("renders Manual badge prominently when alert reason carries [source:manual]", async () => {
    currentAlert = {
      ...BASE_ALERT,
      reason: "Humidity high (manual reading 78%). [source:manual]",
    };
    renderDetail();
    const el = await screen.findByTestId("alert-detail-sensor-source-badge");
    expect(el.getAttribute("data-tone")).toBe("manual");
    expect(el.textContent).toContain("Manual");
    expect(el.textContent?.toLowerCase()).not.toContain("live");
  });

  it.each(["live", "csv", "demo", "stale", "invalid"] as const)(
    "renders %s source badge with the matching tone",
    async (src) => {
      currentAlert = { ...BASE_ALERT, source: src };
      renderDetail();
      const el = await screen.findByTestId("alert-detail-sensor-source-badge");
      expect(el.getAttribute("data-tone")).toBe(src);
      if (src !== "live") {
        expect(el.textContent?.toLowerCase()).not.toContain("live");
      }
    },
  );

  it("omits the badge when no sensor source is available (avoids misleading Unknown)", async () => {
    renderDetail();
    await flushAsync();
    expect(
      screen.queryByTestId("alert-detail-sensor-source-badge"),
    ).toBeNull();
  });
});
