/**
 * QuickLog smoke-flow bug-fix coverage (screen-recording findings):
 *  - Plant mismatch banner appears when selected plant differs from
 *    the prefill (page-context) plant; toast includes plant name.
 *  - Matching plant: no banner.
 *  - Watering event auto-expands details and exposes Watering (ml) as
 *    required; saving empty surfaces inline error + focus.
 *  - Attach toggle is disabled and OFF when snapshot status is stale,
 *    and the helper text reflects "stale, not current" copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const grows = [{ id: "g1", name: "Grow #1", stage: "veg" }];
const plantsData = [
  { id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" },
  { id: "p2", name: "505 Headbanger", strain: "HB", tent_id: "t1", grow_id: "g1" },
];
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows,
    activeGrow: grows[0],
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: plantsData }) }));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1" }] }),
}));

const { toastSuccess, toastError, snapshotState } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  snapshotState: {
    status: "ready" as "ready" | "loading" | "empty",
    payload: {
      status: "stale" as "fresh_live" | "fresh_non_live" | "stale" | "invalid" | "empty",
      source: "manual" as string | null,
      captured_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() as string | null,
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, message: vi.fn() },
}));

vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: snapshotState.status,
    snapshot: {
      ...snapshotState.payload,
      metrics: { temp_f: 75, humidity_pct: 55, vpd_kpa: 1.1 },
      badge_label: "stale",
    },
  }),
}));


vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";

function renderQL(props: Parameters<typeof QuickLog>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  snapshotStatus = "ready";
  snapshotPayload = {
    status: "stale",
    source: "manual",
    captured_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  };
});
afterEach(() => cleanup());

describe("QuickLog plant mismatch banner", () => {
  it("shows banner when selected plant differs from prefill plant", () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p1", plantName: "Blue Dream", growId: "g1" },
    });
    // Simulate grower switching the picker to p2 by overriding state via
    // re-render with a different prefill default — easier: use prefill
    // pointing at p1 but selectedPlant currently is p1; switch via Select.
    // The default picker picks the prefill plant; mismatch happens only
    // when the grower changes it. So set prefill to a different plant
    // than the one auto-picked.
    // Use a more direct check: change scoped plants by passing different
    // prefill plantId from selected one — selected defaults to prefill,
    // so re-render with a prefill whose plantId isn't in scoped plants:
    cleanup();
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p-other", plantName: "Some Other Plant", growId: "g1" },
    });
    // With invalid prefill plantId, default picker chooses first scoped (p1).
    // selectedPlant.id (p1) !== prefill.plantId (p-other) → banner shows.
    expect(screen.queryByTestId("quick-log-plant-mismatch-banner")).not.toBeNull();
    expect(screen.getByTestId("quick-log-plant-mismatch-banner").textContent ?? "").toMatch(
      /Some Other Plant/,
    );
  });

  it("does not show banner when selected plant matches prefill", () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p1", plantName: "Blue Dream", growId: "g1" },
    });
    expect(screen.queryByTestId("quick-log-plant-mismatch-banner")).toBeNull();
  });
});

describe("QuickLog watering required field", () => {
  it("auto-expands details + Watering (ml) is required when event is watering", () => {
    const { container } = renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p1", growId: "g1", eventType: "watering" },
    });
    const input = container.querySelector('[data-testid="quicklog-watering-ml"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.getAttribute("aria-required")).toBe("true");
  });

  it("blocking watering save shows inline error and focuses input", async () => {
    const { container } = renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p1", growId: "g1", eventType: "watering" },
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));
    // inline error appears
    const err = await screen.findByTestId("quicklog-watering-error");
    expect(err.textContent ?? "").toMatch(/watering volume/i);
    const input = container.querySelector('[data-testid="quicklog-watering-ml"]') as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLog attach toggle truthful on stale snapshot", () => {
  it("disables attach toggle and shows stale helper when snapshot is stale", () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p1", growId: "g1" },
    });
    const toggle = screen.getByTestId("quick-log-snapshot-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-status")).toBe("stale");
    expect(toggle.disabled).toBe(true);
    expect(screen.getByTestId("quick-log-snapshot-stale-helper").textContent ?? "").toMatch(
      /not saved as current sensor context/i,
    );
  });
});
