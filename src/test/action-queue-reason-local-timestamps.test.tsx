/**
 * Action Queue surfaces — copied alert reasons show a local reading time.
 *
 * Environment alert reasons carry "Reading at <ISO>." and that text is copied
 * into action_queue.reason. The /actions row, the detail drawer and the
 * /actions/:id header must render it through localizeReadingAtTimestamps, so
 * the grower never sees a raw ISO timestamp. The dashboard action card is
 * pinned in action-queue-reason-local-timestamps-dashboard.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import ActionQueue from "@/pages/ActionQueue";
import ActionDetail from "@/pages/ActionDetail";
import ActionQueueDetailDrawer from "@/components/ActionQueueDetailDrawer";

const ISO_REASON =
  "Humidity is above the flower target range. Observed 70% (flower range 40%–50%). " +
  "Reading at 2026-10-15T15:54:26.221+00:00. [alert:alert-1]";

const ROW = {
  id: "aq-1",
  grow_id: "g1",
  tent_id: null,
  plant_id: null,
  source: "environment_alert",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  target_device: null,
  suggested_change: "Lower humidity to 45%",
  reason: ISO_REASON,
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-10-15T16:00:00Z",
  updated_at: "2026-10-15T16:00:00Z",
};

const H = vi.hoisted(() => ({ surface: "list" as "list" | "detail" }));

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      // The list page chains eq(); the detail page (as in
      // action-detail-linked-alert.test.tsx) ends at eq().maybeSingle().
      eq: () =>
        H.surface === "list"
          ? chain
          : {
              maybeSingle: () => Promise.resolve({ data: ROW, error: null }),
              then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
                resolve({ data: [ROW], error: null }),
            },
      in: () => chain,
      then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
        resolve({ data: [ROW], error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  const makeGeneric = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      in: () => chain,
      limit: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
      insert: () => Promise.resolve({ data: null, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => (table === "action_queue" ? makeActionQueueChain() : makeGeneric()),
    },
  };
});

vi.mock("@/store/auth", () => {
  // A stable user identity: ActionDetail effects depend on it.
  const user = { id: "u1", email: "u@example.com" };
  return { useAuth: () => ({ user }) };
});
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1" },
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  H.surface = "list";
});

function expectLocalReadingTime(text: string) {
  expect(text).toContain("Humidity is above the flower target range.");
  expect(text).toContain("Reading at");
  expect(text).not.toContain("2026-10-15T");
  expect(text).not.toContain("[alert:");
}

describe("Action Queue reason — local reading time", () => {
  it("/actions row reason shows a local time, not the raw ISO timestamp", async () => {
    render(
      <MemoryRouter initialEntries={["/actions"]}>
        <ActionQueue />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
    );
    const row = document.querySelector('[data-action-id="aq-1"]') as HTMLElement;
    expect(row).toBeTruthy();
    expectLocalReadingTime(row.textContent ?? "");
  });

  it("detail drawer reason shows a local time, not the raw ISO timestamp", () => {
    render(
      <ActionQueueDetailDrawer
        open
        onOpenChange={() => {}}
        row={ROW}
        lookups={{ growsById: {}, tentsById: {}, plantsById: {} }}
      />,
    );
    expectLocalReadingTime(
      screen.getByTestId("action-queue-detail-drawer-reason").textContent ?? "",
    );
  });

  it("/actions/:id header reason shows a local time, not the raw ISO timestamp", async () => {
    H.surface = "detail";
    render(
      <MemoryRouter initialEntries={["/actions/aq-1"]}>
        <Routes>
          <Route path="/actions/:actionId" element={<ActionDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const heading = await screen.findByText("Lower humidity to 45%", { selector: "h1" });
    const reason = heading.nextElementSibling as HTMLElement;
    expect(reason?.tagName).toBe("P");
    expectLocalReadingTime(reason.textContent ?? "");
  });
});
