/**
 * QuickLog post-save target-plant navigation + keyboard/a11y polish:
 *  - After save the dialog stays open and reveals a "View {plant}" action
 *    pointing at the saved target plant id (not the prefill plant id).
 *  - The action is a keyboard-reachable anchor with focus styling.
 *  - The mismatch banner is screen-reader discoverable but not tabbable.
 *  - The stale helper copy includes the formatted captured timestamp and
 *    is associated with the disabled Switch via aria-describedby.
 *  - The watering-missing error path sets aria-invalid + aria-describedby
 *    and focuses Watering (ml).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, snapshotState } = vi.hoisted(() => ({
  rpcMock: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  snapshotState: {
    status: "ready" as "ready" | "loading" | "empty",
    payload: {
      status: "fresh_live" as
        | "fresh_live"
        | "fresh_non_live"
        | "stale"
        | "invalid"
        | "empty",
      source: "ecowitt" as string | null,
      captured_at: "2026-05-31T13:44:12.000Z" as string | null,
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
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: snapshotState.status,
    snapshot: {
      ...snapshotState.payload,
      metrics: { temp_f: 75, humidity_pct: 55, vpd_kpa: 1.1 },
      badge_label: snapshotState.payload.status,
    },
  }),
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";

function renderQL(props: Parameters<typeof QuickLog>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockClear();
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
  snapshotState.status = "ready";
  snapshotState.payload = {
    status: "fresh_live",
    source: "ecowitt",
    captured_at: "2026-05-31T13:44:12.000Z",
  };
});
afterEach(() => cleanup());

describe("QuickLog post-save target plant action", () => {
  it("reveals a 'View {target plant}' action with the saved plant id after save", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      // Prefill plant differs from the auto-picked scoped plant (p2).
      prefill: { plantId: "p-other", plantName: "Blue Dream", growId: "g1" },
    });
    // Make sure mismatch banner shows (sanity: differs from prefill).
    await screen.findByTestId("quick-log-plant-mismatch-banner");
    // Add a note so save passes.
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "looking good" },
    });
    const form = screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    const link = (await screen.findByTestId(
      "quick-log-view-target-plant",
    )) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/plants/p2");
    expect(link.getAttribute("data-target-plant-id")).toBe("p2");
    // Does NOT point at the original prefill page plant.
    expect(link.getAttribute("href")).not.toContain("p-other");
    expect(link.textContent ?? "").toMatch(/View 505 Headbanger/);
  });

  it("View target plant button is keyboard reachable and focusable", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "looking good" },
    });
    fireEvent.submit(
      screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement,
    );
    const link = (await screen.findByTestId(
      "quick-log-view-target-plant",
    )) as HTMLAnchorElement;
    expect(link.tabIndex).not.toBe(-1);
    expect(link.className).toMatch(/focus-visible:ring-2/);
    link.focus();
    expect(document.activeElement).toBe(link);
  });

  it("Save button is disabled in the post-save state to prevent double-save", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "ok" },
    });
    fireEvent.submit(
      screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement,
    );
    await screen.findByTestId("quick-log-view-target-plant");
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});

describe("QuickLog mismatch banner accessibility", () => {
  it("is screen-reader discoverable (role=status, aria-live=polite) and not tabbable", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p-other", plantName: "Blue Dream", growId: "g1" },
    });
    const banner = await screen.findByTestId("quick-log-plant-mismatch-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    // No focusable children, banner itself not tab-stop.
    expect(banner.tabIndex).toBe(-1);
    expect(banner.querySelector("a,button,input,select,textarea")).toBeNull();
  });
});

describe("QuickLog stale helper copy", () => {
  beforeEach(() => {
    snapshotState.payload = {
      status: "stale",
      source: "ecowitt",
      captured_at: "2026-05-31T13:44:12.000Z",
    };
  });

  it("includes a formatted captured timestamp and the stale safety suffix", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const helper = await screen.findByTestId("quick-log-snapshot-stale-helper");
    expect(helper.textContent ?? "").toMatch(/Captured /);
    expect(helper.textContent ?? "").toMatch(/2026/);
    expect(helper.textContent ?? "").toMatch(
      /not saved as current sensor context/i,
    );
    expect(helper.textContent ?? "").not.toMatch(/T\d{2}:\d{2}/);
  });

  it("disabled attach Switch is aria-described by the helper container", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const sw = (await screen.findByTestId(
      "quick-log-snapshot-toggle",
    )) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute("aria-describedby")).toBe(
      "quick-log-snapshot-session-helper",
    );
    const helperRoot = document.getElementById("quick-log-snapshot-session-helper");
    expect(helperRoot).not.toBeNull();
    expect(helperRoot?.textContent ?? "").toMatch(/Captured /);
  });
});

describe("QuickLog watering inline validation a11y", () => {
  it("marks Watering (ml) aria-invalid and aria-describedby when missing", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1", eventType: "watering" },
    });
    const input = (await screen.findByTestId(
      "quicklog-watering-ml",
    )) as HTMLInputElement;
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => {
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
    expect(input.getAttribute("aria-describedby")).toBe("quicklog-watering-error");
    const err = screen.getByTestId("quicklog-watering-error");
    expect(err.getAttribute("role")).toBe("alert");
  });
});
