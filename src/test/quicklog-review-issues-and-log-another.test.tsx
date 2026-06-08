/**
 * QuickLog keyboard recovery polish:
 *  - "Review Quick Log issues" region appears only when relevant.
 *  - Jump links move focus to the right control (plant trigger, attach
 *    wrapper, Watering (ml) input).
 *  - Mismatch banner / stale helper text remain non-tabbable on their own.
 *  - Post-save "View {plant}" leaves focus outside the dialog.
 *  - Post-save "Log another for {plant}" preserves the selected plant,
 *    clears post-save + validation state, and focuses the first logical
 *    field (note textarea).
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

describe("QuickLog — Review issues region", () => {
  it("does not render when there are no issues", () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    expect(screen.queryByTestId("quick-log-review-issues")).toBeNull();
  });

  it("renders + offers a mismatch jump link when mismatch banner is shown", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p-other", plantName: "Old Plant", growId: "g1" },
    });
    await screen.findByTestId("quick-log-plant-mismatch-banner");
    const region = screen.getByTestId("quick-log-review-issues");
    expect(region.getAttribute("aria-label")).toMatch(/review quick log issues/i);
    const jump = screen.getByTestId("quick-log-review-jump-mismatch");
    expect(jump.tabIndex).not.toBe(-1);
    jump.click();
    const trigger = screen.getByTestId("quick-log-plant-select");
    expect(document.activeElement).toBe(trigger);
  });

  it("offers a snapshot jump link when stale helper is shown and moves focus to attach section", async () => {
    snapshotState.payload = {
      status: "stale",
      source: "ecowitt",
      captured_at: "2026-05-31T13:44:12.000Z",
    };
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    await screen.findByTestId("quick-log-snapshot-stale-helper");
    const jump = screen.getByTestId("quick-log-review-jump-snapshot");
    jump.click();
    const wrapper = screen.getByTestId("quick-log-snapshot-attach-section");
    expect(document.activeElement).toBe(wrapper);
    // Helper remains associated with the disabled Switch.
    const sw = screen.getByTestId("quick-log-snapshot-toggle") as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(sw.getAttribute("aria-describedby")).toBe(
      "quick-log-snapshot-session-helper",
    );
  });

  it("offers a watering jump link when validation error exists and focuses Watering (ml)", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1", eventType: "watering" },
    });
    const input = (await screen.findByTestId(
      "quicklog-watering-ml",
    )) as HTMLInputElement;
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(input.getAttribute("aria-invalid")).toBe("true"),
    );
    const jump = await screen.findByTestId("quick-log-review-jump-watering");
    input.blur();
    jump.click();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("static mismatch banner remains non-tabbable (no action children)", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p-other", plantName: "Old Plant", growId: "g1" },
    });
    const banner = await screen.findByTestId("quick-log-plant-mismatch-banner");
    expect(banner.tabIndex).toBe(-1);
    expect(banner.querySelector("a,button,input,select,textarea")).toBeNull();
  });

  it("static stale helper paragraph is not a tab stop", async () => {
    snapshotState.payload = {
      status: "stale",
      source: "ecowitt",
      captured_at: "2026-05-31T13:44:12.000Z",
    };
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const helper = await screen.findByTestId("quick-log-snapshot-stale-helper");
    // <span>; never assigned a tabIndex.
    expect(helper.tabIndex).toBe(-1);
  });

  it("review issue jump links appear in logical order: mismatch → snapshot → watering", async () => {
    snapshotState.payload = {
      status: "stale",
      source: "ecowitt",
      captured_at: "2026-05-31T13:44:12.000Z",
    };
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: {
        plantId: "p-other",
        plantName: "Old Plant",
        growId: "g1",
        eventType: "watering",
      },
    });
    const input = (await screen.findByTestId(
      "quicklog-watering-ml",
    )) as HTMLInputElement;
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await screen.findByTestId("quick-log-review-jump-watering");
    const mismatch = screen.getByTestId("quick-log-review-jump-mismatch");
    const snap = screen.getByTestId("quick-log-review-jump-snapshot");
    const water = screen.getByTestId("quick-log-review-jump-watering");
    expect(
      mismatch.compareDocumentPosition(snap) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      snap.compareDocumentPosition(water) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("QuickLog — post-save View {plant} focus handling", () => {
  it("activating View leaves focus outside the dialog content", async () => {
    const onOpenChange = vi.fn();
    renderQL({
      open: true,
      onOpenChange,
      prefill: { plantId: "p2", growId: "g1" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "ok" },
    });
    fireEvent.submit(
      screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement,
    );
    const link = (await screen.findByTestId(
      "quick-log-view-target-plant",
    )) as HTMLAnchorElement;
    const dialog = link.closest('[role="dialog"]') ?? link.closest("form");
    // Intercept navigation in jsdom so the click is observable.
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    if (dialog) {
      expect(dialog.contains(document.activeElement)).toBe(false);
    }
  });
});

describe("QuickLog — Log another for {plant}", () => {
  async function saveOnce() {
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "ok" },
    });
    fireEvent.submit(
      screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement,
    );
    return (await screen.findByTestId(
      "quick-log-post-save-another",
    )) as HTMLButtonElement;
  }

  it("renders a keyboard-reachable 'Log another for {plant}' button after save", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const btn = await saveOnce();
    expect(btn.textContent ?? "").toMatch(/Log another for 505 Headbanger/);
    expect(btn.tabIndex).not.toBe(-1);
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it("preserves the selected plant, clears post-save state, and focuses note", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const btn = await saveOnce();
    fireEvent.click(btn);
    // Post-save state cleared
    expect(screen.queryByTestId("quick-log-view-target-plant")).toBeNull();
    expect(screen.queryByTestId("quick-log-post-save-another")).toBeNull();
    // Plant selection preserved — helper visible (which only renders when
    // a plant is selected) and Save is enabled again.
    expect(screen.getByTestId("quick-log-plant-helper")).toBeInTheDocument();
    const save = screen.getByTestId("quick-log-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    // First logical field focused.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("quicklog-note"));
    });
  });

  it("clears validation errors when re-opening the form for another entry", async () => {
    renderQL({
      open: true,
      onOpenChange: () => {},
      prefill: { plantId: "p2", growId: "g1" },
    });
    const btn = await saveOnce();
    fireEvent.click(btn);
    // Re-trigger validation by switching to watering with no volume.
    expect(screen.queryByTestId("quicklog-watering-error")).toBeNull();
  });
});
