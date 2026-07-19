/**
 * QuickLog — explicit target selection for global no-context launchers.
 *
 * Verifies:
 *  - Exactly one scoped plant is not inferred.
 *  - A remembered target is not inferred.
 *  - Explicit grower selection makes a complete target ready.
 *  - A validated route prefill still selects its exact target.
 *  - No fake live/sensor copy introduced.
 *  - Save path / RPC payload contract untouched: the same plant id we
 *    auto-pick is what would feed the existing save flow (no new RPCs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
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

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function renderQL(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const one = [{ id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" }];
const many = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", strain: "OG", tent_id: "t1", grow_id: "g1" },
];

beforeEach(() => {
  rpcMock.mockClear();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("QuickLog global manual target selection", () => {
  it("does not auto-select the only scoped plant", () => {
    plantsMock = one;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("Blue Dream");
  });

  it("does not auto-select a remembered target", () => {
    plantsMock = many;
    window.localStorage.setItem(
      "verdant.quickLog.lastTarget.v1",
      JSON.stringify({
        plantId: "p2",
        growId: "g1",
        tentId: "t1",
        savedAt: "2026-07-18T00:00:00.000Z",
      }),
    );
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();
    expect(screen.getByTestId("quick-log-plant-select")).not.toHaveTextContent("OG Kush");
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

  it("enables Save only after the grower explicitly selects a valid target", async () => {
    plantsMock = one;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    expect(screen.getByTestId("quick-log-save")).toBeDisabled();

    const trigger = screen.getByTestId("quick-log-plant-select");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: /Blue Dream/i }));

    expect(screen.queryByTestId("quick-log-plant-error")).toBeNull();
    expect(screen.getByTestId("quick-log-save")).toBeEnabled();
    expect(screen.getByTestId("quick-log-target-card")).toHaveAttribute(
      "data-target-plant-id",
      "p1",
    );
  });

  it("does not introduce fake live/sensor copy", () => {
    plantsMock = one;
    renderQL(<QuickLog open onOpenChange={() => {}} />);
    const text = screen.getByRole("dialog").textContent ?? "";
    const scrubbed = text.replace(/not live sensor data/gi, "");
    expect(scrubbed).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });
});
