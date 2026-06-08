/**
 * QuickLog smoke-flow bug-fix coverage (screen-recording findings):
 *  - Plant mismatch banner appears when selected plant differs from
 *    the prefill (page-context) plant; toast includes plant name.
 *  - Matching plant: no banner.
 *  - Watering event auto-expands details and exposes Watering (ml) as
 *    required; saving empty surfaces inline error.
 *  - Attach toggle is disabled and OFF when snapshot status is stale,
 *    and the helper text reflects "stale, not current" copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, toastSuccess, toastError, snapshotState } = vi.hoisted(() => ({
  rpcMock: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const grows = [{ id: "g1", name: "Grow #1", stage: "veg" }];
const plantsData = [
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
  snapshotState.status = "ready";
  snapshotState.payload = {
    status: "stale",
    source: "manual",
    captured_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  };
});
afterEach(() => cleanup());

describe("QuickLog plant mismatch banner", () => {
  it("shows banner when selected plant differs from prefill plant", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p-route-plant", plantName: "Blue Dream", growId: "g1" },
    });
    // Single scoped plant (p2) auto-picks → differs from prefill.plantId.
    const banner = await screen.findByTestId("quick-log-plant-mismatch-banner");
    expect(banner.textContent ?? "").toMatch(/505 Headbanger/);
    expect(banner.textContent ?? "").toMatch(/Blue Dream/);
  });

  it("does not show banner when selected plant matches prefill", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", plantName: "505 Headbanger", growId: "g1" },
    });
    // Wait one tick to let prefill/default effects settle.
    await waitFor(() => {
      expect(screen.queryByTestId("quick-log-plant-mismatch-banner")).toBeNull();
    });
  });
});

describe("QuickLog watering required field", () => {
  it("auto-expands details + Watering (ml) is required when event is watering", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1", eventType: "watering" },
    });
    const input = (await screen.findByTestId("quicklog-watering-ml")) as HTMLInputElement;
    expect(input.getAttribute("aria-required")).toBe("true");
  });

  it("blocking watering save shows inline error and does not call RPC", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1", eventType: "watering" },
    });
    // Make sure the field is mounted before clicking save.
    await screen.findByTestId("quicklog-watering-ml");
    fireEvent.click(screen.getByTestId("quick-log-save"));
    const err = await screen.findByTestId("quicklog-watering-error");
    expect(err.textContent ?? "").toMatch(/watering volume/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("QuickLog attach toggle truthful on stale snapshot", () => {
  it("disables attach toggle and shows stale helper when snapshot is stale", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-status")).toBe("stale");
    expect(toggle.disabled).toBe(true);
    expect(screen.getByTestId("quick-log-snapshot-stale-helper").textContent ?? "").toMatch(
      /not saved as current sensor context/i,
    );
  });
});
