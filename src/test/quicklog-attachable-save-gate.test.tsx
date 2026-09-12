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
 *  - A real resolver `fresh_live` verdict attaches: toggle auto-ON,
 *    payload carries `details.sensor` with `status: "fresh_live"`.
 *  - Canonical manual / csv rows remain attachable with their non-live
 *    provenance. Demo rows remain view-only and never reach the payload.
 *  - Unknown / receiving-transport provenance (non-canon labels the
 *    resolver treats as invalid/non-attachable) must never ship
 *    `details.sensor`. The usable-leak fence is exercised here with a
 *    test-only strip-status override to `"usable"`; `trustBadge.attachable`
 *    stays whatever the real adapter computed (false). If that bit ever
 *    flipped true, auto-attach would fire and `details.sensor` would sneak
 *    in. The override never touches attachable and never stubs the strip.
 *
 * Renders the REAL QuickLog dialog and the REAL strip (no strip stub) so
 * the toggle, helper copy, strip copy, and RPC payload are all asserted
 * against the same mocked tent snapshot state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, snapState, stripStatusLeak } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  snapState: {
    status: "ready" as "ready" | "loading" | "empty",
    snapshot: null as unknown,
  },
  // Test-only usable-leak: override strip `status` after the real adapter
  // runs. `trustBadge.attachable` is never rewritten here.
  stripStatusLeak: { to: null as null | "usable" },
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

vi.mock("@/lib/quickLogSnapshotStripAdapter", async (orig) => {
  const real = await orig<typeof import("@/lib/quickLogSnapshotStripAdapter")>();
  return {
    ...real,
    buildQuickLogStripFromTentState: (
      args: Parameters<typeof real.buildQuickLogStripFromTentState>[0],
    ) => {
      const view = real.buildQuickLogStripFromTentState(args);
      if (stripStatusLeak.to === null) return view;
      return { ...view, status: stripStatusLeak.to };
    },
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
  stripStatusLeak.to = null;
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
    ).toMatch(/view-only/i);
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
// Manual / csv remain attachable; demo stays view-only
// ---------------------------------------------------------------------------

describe("attachable gate — manual fresh_non_live", () => {
  beforeEach(() => {
    snapState.snapshot = snap({
      source: "manual",
      status: "fresh_non_live",
      badge_label: "manual • as of 5m ago",
    });
  });

  it("toggle auto-attaches and stays labeled Manual", async () => {
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("true");
    expect(toggle.disabled).toBe(false);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-attachable")).toBe("true");
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "manual");
    expect(strip.textContent).toMatch(/manual/i);
    expect(strip.textContent).not.toMatch(/current sensor context/i);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action.getAttribute("data-action-kind")).toBe("edit");
    expect(action.textContent).toContain("Edit manual readings");
  });

  it("saved payload preserves manual fresh_non_live provenance", async () => {
    renderQL();
    const toggle = await screen.findByTestId("quick-log-snapshot-toggle");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const payload = await saveNoteAndGetPayload();
    const details = payload.p_details as { sensor?: { status?: string; source?: string } };
    expect(details?.sensor?.status).toBe("fresh_non_live");
    expect(details?.sensor?.source).toBe("manual");
  });
});

// Raised by Codex (P1) and Copilot on #1170, and asked for explicitly:
// "cover an alias through the save-path test". The strip gates attachability on
// normalizeSensorSource(), but buildSensorSnapshotDetails persists
// snapshot.source VERBATIM — so these aliases were attachable while persisting a
// label outside the six-label contract, which the timeline renders as `unknown`.
// A genuinely MANUAL reading displayed as unknown provenance.
describe("attachable gate — manual/CSV aliases persist a canonical source", () => {
  const MANUAL_ALIASES = ["manual_snapshot", "user", "entry", "log", "diary"] as const;
  const CSV_ALIASES = ["import", "imported"] as const;
  const CONTRACT = ["live", "manual", "csv", "demo", "stale", "invalid"];

  for (const source of MANUAL_ALIASES) {
    it(`${source} attaches and persists source "manual", not the raw alias`, async () => {
      snapState.snapshot = snap({
        source,
        status: "fresh_non_live",
        badge_label: `${source} • as of 5m ago`,
      });
      renderQL();
      const toggle = await screen.findByTestId("quick-log-snapshot-toggle");
      await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
      const payload = await saveNoteAndGetPayload();
      const details = payload.p_details as { sensor?: { source?: string } };
      expect(details?.sensor?.source).toBe("manual");
      expect(CONTRACT).toContain(details?.sensor?.source);
    });
  }

  for (const source of CSV_ALIASES) {
    it(`${source} attaches and persists source "csv", not the raw alias`, async () => {
      snapState.snapshot = snap({
        source,
        status: "fresh_non_live",
        badge_label: `${source} • as of 5m ago`,
      });
      renderQL();
      const toggle = await screen.findByTestId("quick-log-snapshot-toggle");
      await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
      const payload = await saveNoteAndGetPayload();
      const details = payload.p_details as { sensor?: { source?: string } };
      expect(details?.sensor?.source).toBe("csv");
      expect(CONTRACT).toContain(details?.sensor?.source);
    });
  }

  // Fence: the rewrite must NOT reach a label carrying provider identity.
  // `pi_bridge` renders as "Pi bridge" in the timeline, and `ecowitt` /
  // `node_red_bridge` canonicalize to `invalid` — canonicalizing those would
  // mark a real reading invalid. Only manual/CSV aliases are rewritten.
  it("real fresh_live keeps its raw provider label in the persisted payload", async () => {
    snapState.snapshot = snap({
      source: "pi_bridge",
      status: "fresh_live",
      badge_label: "pi_bridge • as of 2m ago",
    });
    renderQL();
    const toggle = await screen.findByTestId("quick-log-snapshot-toggle");
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const payload = await saveNoteAndGetPayload();
    const details = payload.p_details as { sensor?: { source?: string } };
    expect(details?.sensor?.source).toBe("pi_bridge");
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
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });

  it("csv row auto-attaches and preserves fresh_non_live provenance", async () => {
    snapState.snapshot = snap({
      source: "csv",
      status: "fresh_non_live",
      badge_label: "csv • as of 5m ago",
    });
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("true");
    expect(toggle.disabled).toBe(false);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-attachable")).toBe("true");
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "csv");
    expect(strip.textContent).toMatch(/not current conditions/i);
    expect(strip.textContent).not.toMatch(/will include current sensor context/i);
    const payload = await saveNoteAndGetPayload();
    const details = payload.p_details as { sensor?: { status?: string; source?: string } };
    expect(details?.sensor?.status).toBe("fresh_non_live");
    expect(details?.sensor?.source).toBe("csv");
  });
});

// ---------------------------------------------------------------------------
// Unknown / transport provenance: usable-leak fence
// Strip status is overridden to "usable" in this describe only. Attachable
// stays the real adapter verdict (false). Save must still omit details.sensor.
// ---------------------------------------------------------------------------

describe("attachable gate — unknown/transport provenance", () => {
  beforeEach(() => {
    stripStatusLeak.to = "usable";
  });

  it("transport label: usable leak still omits details.sensor", async () => {
    // Receiving-transport label the resolver treats as invalid/non-attachable.
    snapState.snapshot = snap({
      source: "ecowitt",
      status: "fresh_non_live",
      badge_label: "ecowitt • as of 5m ago",
    });
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-status")).toBe("usable");
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    expect(toggle.disabled).toBe(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-status")).toBe("usable");
    expect(strip.getAttribute("data-attachable")).toBe("false");
    expect(strip.textContent).toContain(STRIP_NON_ATTACHABLE_DESCRIPTION);
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });

  it("unknown label: usable leak still omits details.sensor", async () => {
    snapState.snapshot = snap({
      source: "wat",
      status: "fresh_non_live",
      badge_label: "wat • as of 5m ago",
    });
    renderQL();
    const toggle = (await screen.findByTestId("quick-log-snapshot-toggle")) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-status")).toBe("usable");
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    expect(toggle.disabled).toBe(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-status")).toBe("usable");
    expect(strip.getAttribute("data-attachable")).toBe("false");
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });
});
