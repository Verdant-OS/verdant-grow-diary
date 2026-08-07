/**
 * Regression: "Assign to tent" must work for a plant with NO grow context.
 *
 * Reported production symptom: the Plant Detail "Assign to tent" quick action
 * rendered "Unable to load tents because this plant is missing grow context."
 * and offered no way forward, while Edit Plant's tent dropdown listed tents
 * fine for the SAME plant. Root cause: the dialog gated its tents fetch on
 * `enabled: open && hasGrowContext`, so a null `plants.grow_id` disabled the
 * query outright and swapped the picker for a dead end.
 *
 * `plants.grow_id` is genuinely nullable (`ON DELETE SET NULL` on the grows
 * FK), and this branch ships PlantGrowContextRescueCard, which tells a
 * grow-less plant's owner to "Assign this plant to a tent" — the exact action
 * the dialog refused. So the dead end was reachable and self-contradictory.
 *
 * Unlike the static scan in plant-detail-assign-tent.test.ts, this renders the
 * real component against the real @tanstack/react-query so the `enabled` gate
 * and the conditional `.eq("grow_id", ...)` are actually exercised — a source
 * regex alone cannot prove the query runs.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  /** Every `.eq(col, val)` applied to the tents query, in order. */
  tentFilters: [] as Array<{ column: string; value: unknown }>,
  tentQueryRuns: 0,
  tentRows: [] as Array<Record<string, unknown>>,
  /**
   * The live `onOpenChange` handed to <Dialog>. The dialog's tents query is
   * gated on its internal `open` state, so the test MUST actually open the
   * dialog — rendering alone leaves `enabled: open` false and no query runs.
   */
  dialogOnOpenChange: null as ((open: boolean) => void) | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  // Minimal chainable stub mirroring the real builder: .eq() returns `this`
  // so the component's `q = q.eq(...)` reassignment behaves as in production,
  // and `.order()` resolves. Recording filters is what lets us prove the
  // cross-grow filter is applied when a grow exists and skipped when it isn't.
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      mocks.tentFilters.push({ column, value });
      return builder;
    },
    order: async () => {
      mocks.tentQueryRuns += 1;
      return { data: mocks.tentRows, error: null };
    },
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "tents") return builder;
        throw new Error(`Unexpected table in test: ${table}`);
      },
    },
  };
});

vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const Content = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  // Capture onOpenChange so the test can genuinely open the dialog, the way a
  // grower clicking the quick action does. Without this the query stays
  // disabled and every assertion below would be vacuous.
  const Dialog = ({
    children,
    onOpenChange,
  }: {
    children?: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    mocks.dialogOnOpenChange = onOpenChange ?? null;
    return <>{children}</>;
  };
  return {
    Dialog,
    DialogTrigger: Pass,
    DialogContent: Content,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  // Spread props on the elements that carry data-testid / values, otherwise
  // the testids the assertions look for are silently dropped by the mock.
  const Div = ({ children, ...props }: { children?: ReactNode; [k: string]: unknown }) => (
    <div {...props}>{children}</div>
  );
  return {
    Select: Div,
    SelectContent: Pass,
    SelectGroup: Pass,
    SelectItem: Div,
    SelectLabel: Pass,
    SelectTrigger: Div,
    SelectValue: Pass,
  };
});

import AssignTentDialog from "@/components/AssignTentDialog";

/** Render, then open the dialog the way a grower would. */
function openDialog(growId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AssignTentDialog plantId="plant-1" growId={growId} currentTentId={null} />
    </QueryClientProvider>,
  );
  if (!mocks.dialogOnOpenChange) throw new Error("Dialog never received onOpenChange");
  act(() => mocks.dialogOnOpenChange?.(true));
  return result;
}

beforeEach(() => {
  mocks.tentFilters.length = 0;
  mocks.tentQueryRuns = 0;
  mocks.dialogOnOpenChange = null;
  mocks.tentRows = [
    { id: "tent-a", name: "Flower Tent", grow_id: "grow-1", is_archived: false },
    { id: "tent-b", name: "Veg Tent", grow_id: null, is_archived: false },
  ];
});

describe("AssignTentDialog · plant with no grow context", () => {
  it("still fetches tents and renders the picker (was: dead end)", async () => {
    openDialog(null);

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    // The picker renders, listing the owner's tents.
    expect(await screen.findByTestId("assign-tent-select")).toBeInTheDocument();
    expect(screen.getByText("Flower Tent")).toBeInTheDocument();
    expect(screen.getByText("Veg Tent")).toBeInTheDocument();
  });

  it("never shows the reported dead-end copy", async () => {
    openDialog(null);

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    expect(screen.queryByTestId("assign-tent-no-grow")).toBeNull();
    expect(screen.queryByText(/missing grow context/i)).toBeNull();
  });

  it("skips the grow filter when there is no grow to be 'cross' of", async () => {
    openDialog(null);

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    expect(mocks.tentFilters).toContainEqual({ column: "is_archived", value: false });
    expect(mocks.tentFilters.some((f) => f.column === "grow_id")).toBe(false);
  });
});

describe("AssignTentDialog · plant WITH a grow (cross-grow fence intact)", () => {
  it("still applies the grow filter, so the fix is not a cross-grow regression", async () => {
    openDialog("grow-1");

    await waitFor(() => expect(mocks.tentQueryRuns).toBe(1));
    expect(mocks.tentFilters).toContainEqual({ column: "grow_id", value: "grow-1" });
    expect(mocks.tentFilters).toContainEqual({ column: "is_archived", value: false });
  });
});
