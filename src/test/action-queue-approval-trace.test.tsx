/**
 * /actions Approval → diary timeline trace.
 *
 * Confirms a grower-initiated Approve click:
 *   - performs one action_queue UPDATE
 *   - writes one labeled diary_entries trace row
 *   - never re-inserts the same trace (idempotency)
 *   - never executes equipment / device commands
 *   - never auto-approves on render
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionQueue from "@/pages/ActionQueue";

const PENDING_ROW = {
  id: "aq-1",
  grow_id: "g1",
  tent_id: "t1",
  plant_id: "p1",
  source: "ai_doctor",
  action_type: "lower_humidity",
  target_metric: "humidity_pct",
  target_device: null,
  suggested_change: "Lower humidity to 55%",
  reason: "Mold risk. [alert:alert-xyz] [session:sess-1]",
  risk_level: "medium",
  status: "pending_approval",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  cancelled_at: null,
  simulated_at: null,
  created_at: "2026-05-27T10:00:00Z",
  updated_at: "2026-05-27T10:00:00Z",
};

const actionQueueUpdates: unknown[] = [];
const diaryInserts: Array<Record<string, unknown>> = [];
const auditInserts: unknown[] = [];
const fetchSpy = vi.fn();

// Mutable store of existing diary trace rows by idempotency_key — used
// to simulate the post-insert "row exists" state for retry attempts.
const existingDiaryByKey = new Set<string>();

vi.mock("@/integrations/supabase/client", () => {
  function actionQueueChain() {
    const result = { data: [PENDING_ROW], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => Promise.resolve(result),
      in: () => chain,
      update: (patch: unknown) => {
        actionQueueUpdates.push(patch);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  }

  function diaryEntriesChain() {
    let mode: "probe" | "insert" | null = null;
    let probeKey: string | null = null;
    const chain: Record<string, unknown> = {
      select: () => {
        mode = "probe";
        return chain;
      },
      eq: () => chain,
      contains: (filter: { idempotency_key?: string }) => {
        if (filter && typeof filter.idempotency_key === "string") {
          probeKey = filter.idempotency_key;
        }
        return chain;
      },
      limit: () => {
        // Resolve the probe with whatever we currently know.
        const exists = probeKey ? existingDiaryByKey.has(probeKey) : false;
        return Promise.resolve({
          data: exists ? [{ id: "diary-existing" }] : [],
          error: null,
        });
      },
      insert: (row: Record<string, unknown>) => {
        mode = "insert";
        diaryInserts.push(row);
        const details = (row?.details ?? {}) as Record<string, unknown>;
        const key = typeof details.idempotency_key === "string"
          ? (details.idempotency_key as string)
          : null;
        if (key) existingDiaryByKey.add(key);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (r: { data: never[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    void mode;
    return chain;
  }

  function eventsChain() {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      order: () => Promise.resolve(result),
      insert: (row: unknown) => {
        auditInserts.push(row);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  }

  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return actionQueueChain();
        if (table === "action_queue_events") return eventsChain();
        if (table === "diary_entries") return diaryEntriesChain();
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
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
    isValidScopedGrow: false,
    backHref: "/actions",
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  actionQueueUpdates.length = 0;
  diaryInserts.length = 0;
  auditInserts.length = 0;
  existingDiaryByKey.clear();
  fetchSpy.mockClear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchSpy;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/actions"]}>
      <ActionQueue />
    </MemoryRouter>,
  );
}

async function approveAndConfirm() {
  await waitFor(() =>
    expect(screen.getAllByTestId("action-queue-row").length).toBeGreaterThan(0),
  );
  // Row-level Approve button opens the note dialog.
  const approveButtons = screen.getAllByRole("button", { name: /^Approve action: / });
  fireEvent.click(approveButtons[0]);
  // Confirm the dialog.
  const confirm = await screen.findByRole("button", { name: /^Approve$/ });
  await act(async () => {
    fireEvent.click(confirm);
  });
}

describe("ActionQueue approval → diary timeline trace", () => {
  it("does NOT auto-approve, does NOT auto-write a trace on render", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId("action-queue-row").length).toBe(1),
    );
    expect(actionQueueUpdates).toHaveLength(0);
    expect(diaryInserts).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("performs exactly one action_queue status update on Approve click", async () => {
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(actionQueueUpdates.length).toBe(1));
    expect((actionQueueUpdates[0] as { status: string }).status).toBe("approved");
  });

  it("writes exactly one labeled diary trace entry", async () => {
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(diaryInserts.length).toBe(1));
    const entry = diaryInserts[0];
    expect(typeof entry.note).toBe("string");
    expect((entry.note as string).startsWith("Action approved:")).toBe(true);
    const details = entry.details as Record<string, unknown>;
    expect(details.kind).toBe("action_queue_trace");
    expect(details.trace_kind).toBe("approved");
    expect(details.idempotency_key).toBe("action-queue:aq-1:approved");
    expect(details.device_control).toBe(false);
  });

  it("never includes raw back-pointer tokens or internal IDs in the visible note", async () => {
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(diaryInserts.length).toBe(1));
    const note = diaryInserts[0].note as string;
    expect(note).not.toContain("[alert:");
    expect(note).not.toContain("[session:");
    expect(note).not.toContain("alert-xyz");
    expect(note).not.toContain("sess-1");
    expect(note).not.toContain("aq-1");
  });

  it("is idempotent: a second Approve attempt does NOT duplicate the trace", async () => {
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(diaryInserts.length).toBe(1));

    // Re-render and click again; idempotency probe should short-circuit.
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(actionQueueUpdates.length).toBe(2));
    expect(diaryInserts.length).toBe(1);
  });

  it("never executes equipment / device commands during the flow", async () => {
    renderPage();
    await approveAndConfirm();
    await waitFor(() => expect(actionQueueUpdates.length).toBe(1));
    expect(fetchSpy).not.toHaveBeenCalled();
    const patch = actionQueueUpdates[0] as Record<string, unknown>;
    for (const k of Object.keys(patch)) {
      expect(k).not.toMatch(/device|relay|fan|light|pump|valve|webhook|command/i);
    }
  });
});
