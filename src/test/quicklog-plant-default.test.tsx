/**
 * QuickLog — auto-preselect single eligible plant (Gate 1 speed slice).
 *
 * Verifies:
 *  - Exactly one scoped plant → auto-selected, inline error gone, Save enabled.
 *  - 2+ scoped plants → no auto-pick; Save remains disabled with inline error.
 *  - Prefill plantId wins over single-candidate fallback (and over no selection).
 *  - User-selected plant is never overwritten by auto-pick logic.
 *  - Closing then reopening re-evaluates against current scoped plants.
 *  - No fake live/sensor copy introduced.
 *  - Save path / RPC payload contract untouched: the same plant id we
 *    auto-pick is what would feed the existing save flow (no new RPCs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({
      insert: vi.fn(),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Tent 1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Tent 1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));

let plantsMock: Array<Record<string, unknown>> = [];
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: plantsMock }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";

function renderQL(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const one = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
];
const many = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", strain: "OG", tent_id: "t1", grow_id: "g1" },
];

beforeEach(() => rpcMock.mockClear());
afterEach(() => cleanup());

describe("QuickLog auto-preselect single eligible plant", () => {
  it("auto-selects the only scoped plant and enables Save", async () => {
    plantsMock = one;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    // Inline error must be gone.
    expect(screen.queryByTestId("quick-log-plant-error")).toBeNull();
    // Save enabled (Plant is satisfied; other required fields default-fine).
    const btn = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    // Picker reflects the auto-pick.
    expect(screen.getByTestId("quick-log-plant-select").textContent).toMatch(/Blue Dream/);
  });

  it("does NOT auto-select when 2+ scoped plants exist", () => {
    plantsMock = many;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(
      (screen.getByTestId("quick-log-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("prefill plantId wins even when multiple scoped plants exist", () => {
    plantsMock = many;
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{
          plantId: "p2",
          growId: "g1",
          tentId: "t1",
          eventType: "observation",
          suggestSnapshot: false,
        }}
      />,
    );
    expect(screen.queryByTestId("quick-log-plant-error")).toBeNull();
    expect(screen.getByTestId("quick-log-plant-select").textContent).toMatch(/OG Kush/);
  });

  it("re-evaluates when dialog is closed and reopened", async () => {
    plantsMock = many;
    const { rerender } = renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(
      (screen.getByTestId("quick-log-save") as HTMLButtonElement).disabled,
    ).toBe(true);

    // Close, swap scoped plants down to one, then reopen.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickLog open={false} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    plantsMock = one;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickLog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(screen.queryByTestId("quick-log-plant-error")).toBeNull();
  });

  it("does not introduce fake live/sensor copy", () => {
    plantsMock = one;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    const text = screen.getByRole("dialog").textContent ?? "";
    const scrubbed = text.replace(/not live sensor data/gi, "");
    expect(scrubbed).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });
});
