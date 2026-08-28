/**
 * Quick Log — trustBadge.attachable honored on the strip save path
 * (GDP / Blue Dream #1168 residual, leftover #1163 / #1003).
 *
 * Proves the closed hole end-to-end at the component layer:
 *  - A `fresh_non_live` reviewed-live-alias row (source "sensor" /
 *    "realtime" / "pi_bridge") may keep its Live badge for coherence, but
 *    `trustBadge.attachable` is false — so the Attach toggle must stay
 *    OFF + disabled, the strip must not claim the log will include the
 *    snapshot, and the saved payload must NOT carry `details.sensor`.
 *  - Only a real resolver `fresh_live` verdict attaches: toggle auto-ON,
 *    payload carries `details.sensor` with `status: "fresh_live"`.
 *  - Manual / csv / demo rows on `fresh_non_live` are equally
 *    non-attachable at this head; manual keeps its "Edit manual readings"
 *    affordance on the strip despite the forced-detached state.
 *
 * Renders the REAL QuickLog dialog and the REAL strip (no strip stub) so
 * the toggle, helper copy, strip copy, and RPC payload are all asserted
 * against the same mocked tent snapshot state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, snapState } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  snapState: {
    status: "ready" as "ready" | "loading" | "empty",
    snapshot: null as unknown,
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
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: () => ({
      status: snapState.status,
      snapshot: snapState.snapshot,
      lastUpdatedAt: 0,
    }),
  };
});

import QuickLog from "@/components/QuickLog";
import { STRIP_NON_ATTACHABLE_DESCRIPTION } from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

function freshIso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function snap(partial: Partial<StrictSensorSnapshot> = {}): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: freshIso(5),
    age_minutes: 5,
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live • as of 5m ago • source: live",
    metrics: {
      temp_f: 75.7,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
    ...partial,
  };
}

function renderQL() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog
        open
        onOpenChange={() => {}}
        prefill={{ plantId: "p2", plantName: "505 Headbanger", growId: "g1" }}
      />
    </QueryClientProvider>,
  );
}

async function saveNoteAndGetPayload(): Promise<Record<string, unknown>> {
  const note = (await screen.findByTestId("quicklog-note")) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "attachable gate probe" } });
  const form = note.closest("form") as HTMLFormElement;
  expect(form).not.toBeNull();
  fireEvent.submit(form);
  await waitFor(() =>
    expect(rpcMock.mock.calls.some((c) => c[0] === "quicklog_save_manual")).toBe(true),
  );
  const call = rpcMock.mock.calls.find((c) => c[0] === "quicklog_save_manual")!;
  return call[1] as Record<string, unknown>;
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "e1" }, error: null });
  snapState.status = "ready";
  snapState.snapshot = snap();
});
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Reviewed live alias on fresh_non_live: Live badge, attachable false
// ---------------------------------------------------------------------------

describe("attachable gate — reviewed live alias (fresh_non_live)", () => {
  beforeEach(() => {
    snapState.snapshot = snap({
      source: "sensor",
      status: "fresh_non_live",
      badge_label: "sensor • as of 5m ago",
    });
  });

  it("toggle stays OFF, disabled, and marked non-attachable; helper explains", async () => {
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-status")).toBe("usable");
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    expect(toggle.disabled).toBe(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    expect(
      screen.getByTestId("quick-log-snapshot-non-attachable-helper").textContent ?? "",
    ).toMatch(/only verified live readings/i);
    expect(screen.getByTestId("quick-log-truth-copy").textContent).toBe(
      "Sensor context is present but not attachable. This will save as a manual log only.",
    );
  });

  it("strip keeps the Live badge but renders the non-attachable description", async () => {
    renderQL();
    const strip = await screen.findByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-status")).toBe("usable");
    expect(strip.getAttribute("data-attachable")).toBe("false");
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "live");
    expect(strip.textContent).toContain(STRIP_NON_ATTACHABLE_DESCRIPTION);
    expect(strip.textContent).not.toContain("This log will include current sensor context.");
    expect(strip.textContent).not.toContain(
      "Toggle “Attach sensor snapshot” to include it in this log.",
    );
  });

  it("saved payload carries NO details.sensor for the alias row", async () => {
    renderQL();
    await screen.findByTestId("quick-log-snapshot-toggle");
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real fresh_live control: attaches exactly as before
// ---------------------------------------------------------------------------

describe("attachable gate — real fresh_live still attaches", () => {
  it("toggle auto-attaches and is enabled + attachable", async () => {
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("true");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(toggle.disabled).toBe(false);
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-attachable")).toBe("true");
    expect(strip.textContent).toContain("This log will include current sensor context.");
  });

  it("saved payload carries details.sensor with status fresh_live", async () => {
    renderQL();
    const toggle = await screen.findByTestId("quick-log-snapshot-toggle");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const payload = await saveNoteAndGetPayload();
    const details = payload.p_details as { sensor?: { status?: string; source?: string } };
    expect(details?.sensor?.status).toBe("fresh_live");
    expect(details?.sensor?.source).toBe("live");
  });
});

// ---------------------------------------------------------------------------
// Manual / demo / csv on fresh_non_live: non-attachable at this head
// ---------------------------------------------------------------------------

describe("attachable gate — manual fresh_non_live", () => {
  beforeEach(() => {
    snapState.snapshot = snap({
      source: "manual",
      status: "fresh_non_live",
      badge_label: "manual • as of 5m ago",
    });
  });

  it("toggle disabled + OFF; strip keeps the manual edit affordance", async () => {
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    expect(toggle.disabled).toBe(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-attachable")).toBe("false");
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "manual");
    expect(strip.textContent).toContain(STRIP_NON_ATTACHABLE_DESCRIPTION);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action.getAttribute("data-action-kind")).toBe("edit");
    expect(action.textContent).toContain("Edit manual readings");
  });

  it("saved payload carries NO details.sensor for the manual row", async () => {
    renderQL();
    await screen.findByTestId("quick-log-snapshot-toggle");
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });
});

describe("attachable gate — demo and csv fresh_non_live", () => {
  it("demo row: toggle disabled, strip shows the non-attachable description", async () => {
    snapState.snapshot = snap({
      source: "demo",
      status: "fresh_non_live",
      badge_label: "demo • as of 5m ago",
    });
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    expect(toggle.disabled).toBe(true);
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-attachable")).toBe("false");
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "demo");
    expect(strip.textContent).toContain(STRIP_NON_ATTACHABLE_DESCRIPTION);
  });

  it("csv row: saved payload carries NO details.sensor", async () => {
    snapState.snapshot = snap({
      source: "csv",
      status: "fresh_non_live",
      badge_label: "csv • as of 5m ago",
    });
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });
});
