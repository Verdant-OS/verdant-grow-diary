/**
 * AlertDetail — fast double-click duplicate-prevention E2E test.
 *
 * Holds the first insert in-flight via a deferred promise and proves:
 *   - first click triggers the insert (1)
 *   - second rapid click is blocked while the first is in flight (still 1)
 *   - after resolution the decision region lands on `already_exists`
 *   - the rendered duplicate label is grower-safe (no [alert:<id>],
 *     no raw alert/grow ids leaked into the handoff region)
 *   - inserted action stays approval-required (pending_approval)
 *   - no executable device payload is present on the insert
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AlertDetail from "@/pages/AlertDetail";

const BASE_ALERT = {
  id: "alert-uuid-dc1",
  grow_id: "grow-uuid-dc1",
  tent_id: "tent-uuid-dc1",
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

const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
let deferred: {
  promise: Promise<{ data: unknown; error: unknown }>;
  resolve: (v: { data: unknown; error: unknown }) => void;
} | null = null;

function makeDeferred() {
  let resolve!: (v: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

vi.mock("@/lib/alerts", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/alerts");
  return {
    ...actual,
    getAlertById: vi.fn(async () => BASE_ALERT),
    logAlertEvent: vi.fn(async () => undefined),
  };
});
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ events: [] }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: BASE_ALERT.grow_id, name: "G" }],
    activeGrowId: BASE_ALERT.grow_id,
    activeGrow: { id: BASE_ALERT.grow_id, name: "G" },
  }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  type Result = { data: unknown; error: unknown };
  const makeChain = (table: string) => {
    const resolveSelect = (): Result => ({ data: [], error: null });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      like: () => chain,
      contains: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(resolveSelect()),
      then: (resolve: (r: Result) => unknown) => resolve(resolveSelect()),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => ({
        ...makeChain(table),
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ table, payload });
          if (table === "action_queue") {
            return {
              select: () => ({
                single: () => deferred!.promise,
              }),
            };
          }
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
});

beforeEach(() => {
  inserts.length = 0;
  deferred = makeDeferred();
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${BASE_ALERT.id}`]}>
      <Routes>
        <Route path="/alerts/:alertId" element={<AlertDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const actionQueueInserts = () => inserts.filter((i) => i.table === "action_queue");

describe("AlertDetail — fast double-click duplicate protection (E2E)", () => {
  it("blocks a second click while the first insert is still in flight", async () => {
    renderDetail();
    const btn = await screen.findByTestId("alert-handoff-add-button");

    // First click — insert is in flight (deferred not resolved yet).
    await act(async () => {
      fireEvent.click(btn);
    });
    // Second rapid click before the in-flight insert resolves.
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(actionQueueInserts()).toHaveLength(1);

    // Insert stays approval-required, no executable device payload.
    const payload = actionQueueInserts()[0].payload as Record<string, unknown>;
    expect(payload.status).toBe("pending_approval");
    expect(payload).not.toHaveProperty("execute");
    expect(payload).not.toHaveProperty("device_command");
    expect(payload).not.toHaveProperty("device_payload");

    // Resolve the in-flight insert.
    await act(async () => {
      deferred!.resolve({
        data: { id: "new-action-uuid-dc1", grow_id: BASE_ALERT.grow_id },
        error: null,
      });
    });

    // Decision region lands on already_exists.
    const region = await screen.findByTestId("alert-handoff-decision");
    await waitFor(() =>
      expect(region.getAttribute("data-decision-state")).toBe("already_exists"),
    );

    // After landing, a third click cannot create a duplicate insert.
    const queuedLink = await screen.findByTestId(
      "alert-handoff-already-queued-link",
    );
    expect(queuedLink.textContent?.toLowerCase()).toContain("already queued");
    expect(actionQueueInserts()).toHaveLength(1);

    // No raw back-pointer tokens or ids in the visible handoff region.
    const handoff = screen.getByTestId("alert-handoff-region");
    const text = handoff.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain(BASE_ALERT.id);
    expect(text).not.toContain(BASE_ALERT.grow_id);
  });
});
