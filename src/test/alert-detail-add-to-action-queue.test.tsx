/**
 * AlertDetail — "Add to Action Queue" handoff render tests.
 *
 * Confirms (without changing behavior):
 *   - user-initiated only (button click; no auto-create on render)
 *   - insert payload omits user_id, pins status='pending_approval' + source='environment_alert',
 *     keeps action_type='advisory', and includes the [alert:<id>] back-pointer
 *   - idempotency UI swaps the button for a "view details" link to /actions/<id>
 *   - RLS / permission failure surfaces an error toast and never shows a fake success state
 *   - closed (non-open) alerts hide the add button entirely
 *   - handoff region exposes aria-live="polite" for screen-reader feedback
 *   - no raw [alert:<id>], grow_id, or alert id leaks into the handoff region text
 *
 * No new write paths, no schema changes, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";

// --- Configurable fixtures --------------------------------------------------
const OPEN_ALERT = {
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

let currentAlert: typeof OPEN_ALERT = OPEN_ALERT;
let existingMatchingActionRows: Array<Record<string, unknown>> = [];
let actionQueueInsertResult: { data: unknown; error: { code?: string; message: string } | null } = {
  data: { id: "new-action-uuid-1", grow_id: "grow-uuid-1" },
  error: null,
};

// Capture all insert payloads across all tables.
const inserts: Array<{ table: string; payload: unknown }> = [];

// --- Mocks ------------------------------------------------------------------
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
      // Code path: .insert({...}).select("id,grow_id").single()
      const wrapper = {
        select: () => ({
          single: () => Promise.resolve(actionQueueInsertResult),
        }),
        // Fallback thenable so awaiting the raw insert still resolves.
        then: (resolve: (r: typeof actionQueueInsertResult) => unknown) =>
          resolve(actionQueueInsertResult),
      };
      return wrapper;
    }
    // action_queue_events and others: no .select chain in AlertDetail.
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

// --- Helpers ----------------------------------------------------------------
beforeEach(() => {
  currentAlert = OPEN_ALERT;
  existingMatchingActionRows = [];
  actionQueueInsertResult = {
    data: { id: "new-action-uuid-1", grow_id: "grow-uuid-1" },
    error: null,
  };
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

// --- Tests ------------------------------------------------------------------
describe("AlertDetail — Add to Action Queue (render-level)", () => {
  it("renders the Add button for an eligible open alert and does NOT auto-insert on render", async () => {
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    // Give effects a moment to settle.
    await new Promise((r) => setTimeout(r, 30));
    expect(actionQueueInserts()).toHaveLength(0);
  });

  it("clicking creates exactly one action_queue insert with a safe payload", async () => {
    const user = userEvent.setup();
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");
    await user.click(btn);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const aqInserts = actionQueueInserts();
    expect(aqInserts).toHaveLength(1);

    const payload = aqInserts[0].payload as Record<string, unknown>;
    // Owner-trust: NEVER send user_id from the client.
    expect(payload).not.toHaveProperty("user_id");
    // Approval-required handoff defaults.
    expect(payload.status).toBe("pending_approval");
    expect(payload.source).toBe("environment_alert");
    expect(payload.action_type).toBe("advisory");
    // Lineage + provenance back-pointer.
    expect(payload.grow_id).toBe("grow-uuid-1");
    expect(String(payload.reason ?? "")).toContain("[alert:alert-uuid-1]");
    // Read-only / no-control language.
    const blob = JSON.stringify(payload).toLowerCase();
    for (const tok of [
      "mqtt",
      "relay",
      "actuator",
      "webhook",
      "turn on",
      "turn off",
      "service_role",
    ]) {
      expect(blob).not.toContain(tok);
    }
  });

  it("also writes an audit event row (action_queue_events) without client user_id", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByTestId("alert-handoff-add-button"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());

    const auditInserts = inserts.filter((i) => i.table === "action_queue_events");
    expect(auditInserts).toHaveLength(1);
    const auditPayload = auditInserts[0].payload as Record<string, unknown>;
    expect(auditPayload).not.toHaveProperty("user_id");
    expect(auditPayload.event_type).toBe("created");
    expect(auditPayload.new_status).toBe("pending_approval");
  });

  it("idempotency: existing matching [alert:<id>] row replaces the Add button with a view-details link", async () => {
    existingMatchingActionRows = [
      {
        id: "existing-aq-1",
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
    expect(link.getAttribute("href")).toBe("/actions/existing-aq-1");
    expect(screen.queryByTestId("alert-handoff-add-button")).toBeNull();
  });

  it("RLS / permission failure surfaces an error toast and does not show a fake success state", async () => {
    actionQueueInsertResult = {
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    };
    const user = userEvent.setup();
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");
    await user.click(btn);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    // No audit row written on failure.
    expect(inserts.filter((i) => i.table === "action_queue_events")).toHaveLength(0);
    // Button still present (not swapped to "already queued").
    expect(screen.getByTestId("alert-handoff-add-button")).toBeInTheDocument();
    expect(screen.queryByTestId("alert-handoff-already-queued-link")).toBeNull();
  });

  it("closed/non-open alerts hide the Add to Action Queue button", async () => {
    currentAlert = { ...OPEN_ALERT, status: "resolved" };
    renderDetail();
    await screen.findByText(OPEN_ALERT.title);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("alert-handoff-add-button")).toBeNull();
    expect(screen.queryByTestId("alert-handoff-region")).toBeNull();
  });

  it("handoff region exposes aria-live='polite' for screen-reader feedback", async () => {
    renderDetail();
    const region = await screen.findByTestId("alert-handoff-region");
    const live = region.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.getAttribute("role")).toBe("status");
  });

  it("never leaks raw [alert:<id>] tokens, alert id, or grow id in the handoff region", async () => {
    existingMatchingActionRows = [
      {
        id: "existing-aq-1",
        source: "environment_alert",
        status: "pending_approval",
        reason: "Lower humidity. [alert:alert-uuid-1] [session:sess-xyz]",
        grow_id: "grow-uuid-1",
      },
    ];
    renderDetail();
    const region = await screen.findByTestId("alert-handoff-region");
    const text = region.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("alert-uuid-1");
    expect(text).not.toContain("grow-uuid-1");
  });
});
