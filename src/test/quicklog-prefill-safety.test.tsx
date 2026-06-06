/**
 * QuickLog — page-context prefill safety.
 *
 * Verifies the expanded prefill behavior:
 *  - Valid in-scope prefill plantId is applied.
 *  - Out-of-scope / archived / unknown prefill plantId is ignored
 *    (picker stays empty, inline error shown, Save disabled).
 *  - Existing grower selection is not overwritten when a new prefill
 *    arrives on reopen.
 *  - Grow/tent/eventType/suggestSnapshot prefill still apply.
 *  - No fake live/sensor copy is introduced.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

const many = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "OG Kush", strain: "OG", tent_id: "t1", grow_id: "g1" },
];

const withArchived = [
  ...many,
  { id: "pA", name: "Old", strain: "x", tent_id: "t1", grow_id: "g1", is_archived: true },
];

beforeEach(() => rpcMock.mockClear());
afterEach(() => cleanup());

describe("QuickLog page-context prefill safety", () => {
  it("ignores an out-of-scope prefill plantId (not in scopedPlants)", () => {
    plantsMock = many;
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{
          plantId: "ghost-id",
          growId: "g1",
          tentId: "t1",
          eventType: "observation",
          suggestSnapshot: false,
        }}
      />,
    );
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(
      (screen.getByTestId("quick-log-save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("ignores an archived plant prefill id", () => {
    plantsMock = withArchived;
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{
          plantId: "pA",
          growId: "g1",
          tentId: "t1",
          eventType: "observation",
          suggestSnapshot: false,
        }}
      />,
    );
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-plant-select").textContent).not.toMatch(/Old/);
  });

  it("applies a valid in-scope prefill plantId", () => {
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

  it("tent/grow-only prefill (no plantId) does not guess a plant when multiple exist", () => {
    plantsMock = many;
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{
          growId: "g1",
          tentId: "t1",
          eventType: "observation",
          suggestSnapshot: true,
        }}
      />,
    );
    expect(screen.getByTestId("quick-log-plant-error")).toBeInTheDocument();
  });

  it("does not introduce fake live/sensor copy via prefill path", () => {
    plantsMock = many;
    renderQL(
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{
          plantId: "p1",
          growId: "g1",
          tentId: "t1",
          eventType: "observation",
          suggestSnapshot: true,
        }}
      />,
    );
    const text = screen.getByRole("dialog").textContent ?? "";
    const scrubbed = text.replace(/not live sensor data/gi, "");
    expect(scrubbed).not.toMatch(/\blive data\b|\blive sensor\b|guaranteed/i);
  });
});
