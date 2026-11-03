/**
 * After a save the toast is the only visible View diary button.
 * A confirmed one-plant tent reopens on that plant, and the saved
 * note is listed for that plant and tent from a fresh mount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import { QuickLogTentLaunchTarget } from "@/lib/quickLogRouteTargetRules";

const TENT = "55555555-5555-4555-8555-555555555555";
const PLANT = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const GROW = "66666666-6666-4666-8666-666666666666";
const EVENT = "77777777-7777-4777-8777-000000000099";
const NOTE = "Reload canopy check.";
const DECOY = "This other plant must stay off the list.";

type SavedRow = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  occurred_at: string;
  event_type: string;
  source: string;
  note: string | null;
  is_deleted: boolean;
};

const savedRows: SavedRow[] = [];

function rowsFor(table: string, filters: Array<{ op: string; args: unknown[] }>): SavedRow[] {
  if (table !== "grow_events") return [];
  const or = filters.find((filter) => filter.op === "or")?.args[0];
  if (typeof or === "string") {
    return savedRows.filter((row) => {
      if (row.plant_id && or.includes(`plant_id.eq.${row.plant_id}`)) return true;
      return (
        row.plant_id === null &&
        row.tent_id !== null &&
        or.includes(`tent_id.eq.${row.tent_id}`) &&
        row.event_type === "environment"
      );
    });
  }
  return savedRows.filter((row) =>
    filters.every((filter) => {
      if (filter.op !== "eq") return true;
      const [column, value] = filter.args;
      if (column === "plant_id") return row.plant_id === value;
      if (column === "tent_id") return row.tent_id === value;
      if (column === "source") return row.source === value;
      if (column === "is_deleted") return row.is_deleted === value;
      return true;
    }),
  );
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (
      _fn: string,
      payload: { p_note?: string; p_target_id?: string; p_target_type?: string },
    ) => {
      savedRows.push({
        id: EVENT,
        plant_id: payload.p_target_type === "plant" ? (payload.p_target_id ?? null) : null,
        tent_id: TENT,
        occurred_at: "2026-11-03T04:00:00.000Z",
        event_type: "observation",
        source: "manual",
        note: payload.p_note ?? null,
        is_deleted: false,
      });
      return Promise.resolve({
        data: { ok: true, grow_event_id: EVENT, environment_event_id: null },
        error: null,
      });
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: "p" }, error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
    from: (table: string) => {
      const filters: Array<{ op: string; args: unknown[] }> = [];
      const query: Record<string, unknown> = {};
      const chain = () => query;
      query.select = chain;
      query.eq = (...args: unknown[]) => {
        filters.push({ op: "eq", args });
        return query;
      };
      query.is = chain;
      query.not = chain;
      query.in = chain;
      query.or = (...args: unknown[]) => {
        filters.push({ op: "or", args });
        return query;
      };
      query.order = chain;
      query.insert = () => Promise.resolve({ data: null, error: null });
      query.limit = () => Promise.resolve({ data: rowsFor(table, filters), error: null });
      query.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return query;
    },
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: PLANT, name: "Blue Dream", tent_id: TENT, grow_id: GROW, is_archived: false },
      {
        id: OTHER,
        name: "Elsewhere",
        tent_id: "66666666-6666-4666-8666-666666666661",
        grow_id: GROW,
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: TENT, name: "Test Tent", grow_id: GROW }],
  }),
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));
vi.mock("@/hooks/useRecentWateringsForVolumeDefaults", () => ({
  useRecentWateringsForVolumeDefaults: () => ({ data: [] }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: GROW, name: "Grow One", stage: "veg" }],
    activeGrow: { id: GROW, name: "Grow One", stage: "veg" },
    activeGrowId: GROW,
    setActiveGrowId: vi.fn(),
  }),
}));

function plantKey() {
  return QuickLogTentLaunchTarget.resolve({
    tentId: TENT,
    roster: "ready",
    activePlantIds: [PLANT],
  });
}

function mountSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Toaster />
      <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey={plantKey()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  savedRows.length = 0;
  savedRows.push({
    id: "77777777-7777-4777-8777-000000000098",
    plant_id: OTHER,
    tent_id: "66666666-6666-4666-8666-666666666661",
    occurred_at: "2026-11-03T03:00:00.000Z",
    event_type: "observation",
    source: "manual",
    note: DECOY,
    is_deleted: false,
  });
  window.sessionStorage.clear();
});

describe("one View diary after save", () => {
  it("shows exactly one visible View diary button", async () => {
    mountSheet();
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: NOTE } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "View diary" })).toHaveLength(1);
    });
    expect(screen.queryByTestId("quick-log-post-save-view")).not.toBeInTheDocument();
  });
});

describe("confirmed one-plant save survives a remount", () => {
  it("reopens on the same plant and lists the saved note under that plant and tent", async () => {
    const first = mountSheet();
    expect(screen.getByTestId("qlv2-save-target")).toHaveTextContent("Blue Dream (Test Tent)");
    fireEvent.click(screen.getByRole("button", { name: "Note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: NOTE } });
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => expect(savedRows.some((row) => row.note === NOTE)).toBe(true));
    expect(savedRows.find((row) => row.note === NOTE)).toMatchObject({
      plant_id: PLANT,
      tent_id: TENT,
    });
    first.unmount();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet open onOpenChange={() => {}} defaultTargetKey={plantKey()} />
        <QuickLogGroupedTimelineSection scope="plant" plantId={PLANT} tentId={TENT} />
      </QueryClientProvider>,
    );
    expect(screen.getAllByTestId("qlv2-save-target")[0]).toHaveTextContent(
      "Blue Dream (Test Tent)",
    );
    await waitFor(() =>
      expect(screen.getByTestId("quick-log-grouped-timeline-list")).toHaveTextContent(NOTE),
    );
    expect(screen.getByTestId("quick-log-grouped-timeline-list")).not.toHaveTextContent(DECOY);
  });
});
