/**
 * #2348 review: only the Previous/Next buttons reset scroll on the Action
 * Queue. A filter or search change that also resets the page to 1 keeps the
 * scroll position, like every other filter chip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActionQueue from "@/pages/ActionQueue";

const setSearchParamsSpy = vi.fn();
let currentSearch = "";

vi.mock("@/lib/react-router-compat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/react-router-compat")>();
  return {
    ...actual,
    useSearchParams: (() => [
      new URLSearchParams(currentSearch),
      setSearchParamsSpy,
    ]) as unknown as typeof actual.useSearchParams,
  };
});

const ROWS = Array.from({ length: 25 }, (_, i) => {
  const at = new Date(Date.UTC(2026, 4, 27, 10, i)).toISOString();
  return {
    id: `aq-${i}`,
    grow_id: "g1",
    tent_id: null,
    plant_id: null,
    source: "ai_coach",
    action_type: "feed",
    target_metric: "feeding",
    target_device: null,
    suggested_change: `Feed lightly ${i}`,
    reason: `Reason ${i}`,
    risk_level: "low",
    status: "pending_approval",
    approved_at: null,
    rejected_at: null,
    completed_at: null,
    cancelled_at: null,
    simulated_at: null,
    created_at: at,
    updated_at: at,
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const makeActionQueueChain = () => {
    const result = { data: ROWS, error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: () => Promise.resolve(result),
      in: () => chain,
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  const makeEventsChain = () => {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      order: () => Promise.resolve(result),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "action_queue") return makeActionQueueChain();
        if (table === "action_queue_events") return makeEventsChain();
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        };
      },
    },
  };
});

const AUTH_STATE = { user: { id: "u1", email: "u@example.com" } } as const;
const GROWS_STATE = {
  grows: [{ id: "g1", name: "G1" }],
  activeGrowId: "g1",
  activeGrow: { id: "g1", name: "G1" },
} as const;

vi.mock("@/store/auth", () => ({ useAuth: () => AUTH_STATE }));
vi.mock("@/store/grows", () => ({ useGrows: () => GROWS_STATE }));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    backHref: "/actions",
  }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

async function renderAt(search: string) {
  currentSearch = search;
  const { MemoryRouter } = await import("@/lib/react-router-compat");
  render(
    <MemoryRouter initialEntries={[`/actions?${search}`]}>
      <ActionQueue />
    </MemoryRouter>,
  );
  await screen.findByTestId("action-queue-pagination-next");
}

const resetCalls = () =>
  setSearchParamsSpy.mock.calls.filter(([, options]) => options?.preventScrollReset === false);

beforeEach(() => {
  setSearchParamsSpy.mockClear();
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();
});

describe("Action Queue pager scroll", () => {
  it("Next resets scroll to the top", async () => {
    await renderAt("status=all&pageSize=10");
    setSearchParamsSpy.mockClear();
    fireEvent.click(screen.getByTestId("action-queue-pagination-next"));
    await waitFor(() => expect(setSearchParamsSpy).toHaveBeenCalled());
    expect(resetCalls()).toHaveLength(1);
  });

  it("a search typed on page 2 returns to page 1 without resetting scroll", async () => {
    await renderAt("status=all&pageSize=10&page=2");
    setSearchParamsSpy.mockClear();
    fireEvent.change(screen.getByTestId("action-queue-search-input"), {
      target: { value: "Feed" },
    });
    await waitFor(() =>
      expect(
        setSearchParamsSpy.mock.calls.some(
          ([next]) => (next as URLSearchParams).get("page") === null,
        ),
      ).toBe(true),
    );
    expect(resetCalls()).toHaveLength(0);
  });
});
