/**
 * Quick Log — forced Attach-toggle gestures are refused when
 * trustBadge.attachable is false (GDP #1170 residual).
 *
 * `disabled` on the Switch is presentation, not a fence: React's
 * delegated event system won't even deliver a click to a props-disabled
 * button (verified — a DOM-level `disabled=false` + click never reaches
 * the handler), so the reachable force is an invocation of the
 * component's own `onCheckedChange` contract — a regression that drops
 * `disabled`, a programmatic caller, or a devtools dispatch. The handler
 * itself must therefore refuse `setSnapshot(true)` when the trust
 * verdict forbids attach, and the refused gesture must not count as a
 * grower touch. The save payload's own attachable AND stays regardless.
 *
 * To make that invocation possible under test, THIS suite (and only this
 * suite) stubs `@/components/ui/switch` with a faithful controlled
 * button that records the live props per data-testid; the companion
 * suite `quicklog-attachable-save-gate.test.tsx` keeps the real Radix
 * Switch for everything else on this path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, snapState, switchPropsByTestId } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  snapState: {
    status: "ready" as "ready" | "loading" | "empty",
    snapshot: null as unknown,
  },
  switchPropsByTestId: new Map<string, Record<string, unknown>>(),
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

// Faithful controlled stub: renders the states the dialog asserts on
// (aria-checked, disabled, data-*), records the live props so tests can
// force the onCheckedChange contract directly.
vi.mock("@/components/ui/switch", () => ({
  Switch: (props: Record<string, unknown>) => {
    const testId = props["data-testid"] as string | undefined;
    if (testId) switchPropsByTestId.set(testId, props);
    const { checked, disabled } = props as { checked?: boolean; disabled?: boolean };
    const dataAttrs = Object.fromEntries(
      Object.entries(props).filter(([k]) => k.startsWith("data-") || k.startsWith("aria-")),
    );
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked ? "true" : "false"}
        disabled={disabled}
        {...dataAttrs}
        onClick={() => (props.onCheckedChange as ((v: boolean) => void) | undefined)?.(!checked)}
      />
    );
  },
}));

import QuickLog from "@/components/QuickLog";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

const TOGGLE_ID = "quick-log-snapshot-toggle";

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

// Stable identities: a fresh prefill object per render would re-run the
// target-apply path and reset the dialog's local snapshot state machine,
// masking exactly what these tests observe.
const STABLE_PREFILL = { plantId: "p2", plantName: "505 Headbanger", growId: "g1" };
const STABLE_ON_OPEN_CHANGE = () => {};

function renderQL() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // Rebuild the element per (re)render: React bails out of re-rendering
  // when handed the exact same element reference, which would keep the
  // mocked snapshot hook from re-reading snapState after a test flips it.
  const build = () => (
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={STABLE_ON_OPEN_CHANGE} prefill={STABLE_PREFILL} />
    </QueryClientProvider>
  );
  const result = render(build());
  return { ...result, rerenderQL: () => result.rerender(build()) };
}

function forceToggle(v: boolean) {
  const props = switchPropsByTestId.get(TOGGLE_ID);
  expect(props).toBeTruthy();
  act(() => {
    (props!.onCheckedChange as (next: boolean) => void)(v);
  });
}

async function saveNoteAndGetPayload(): Promise<Record<string, unknown>> {
  const note = (await screen.findByTestId("quicklog-note")) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "forced toggle probe" } });
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
  switchPropsByTestId.clear();
  snapState.status = "ready";
  snapState.snapshot = snap({
    source: "sensor",
    status: "fresh_non_live",
    badge_label: "sensor • as of 5m ago",
  });
});
afterEach(() => cleanup());

describe("forced onCheckedChange(true) refused when attachable is false", () => {
  it("does not arm snapshot: toggle stays unchecked and save excludes details.sensor", async () => {
    renderQL();
    const toggle = (await screen.findByTestId(TOGGLE_ID)) as HTMLButtonElement;
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("false");
    forceToggle(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    const payload = await saveNoteAndGetPayload();
    const details = (payload.p_details ?? null) as Record<string, unknown> | null;
    expect(details === null || !("sensor" in details)).toBe(true);
  });

  it("is refused entirely — not a grower touch, so auto-attach still fires once the row is really fresh_live", async () => {
    const { rerenderQL } = renderQL();
    const toggle = (await screen.findByTestId(TOGGLE_ID)) as HTMLButtonElement;
    forceToggle(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    // The row becomes genuinely live. If the forced gesture had armed
    // state or consumed snapshotUserTouchedRef, auto-attach would skip
    // and the toggle would stay OFF — the refusal must be total.
    snapState.snapshot = snap();
    rerenderQL();
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(toggle.getAttribute("data-snapshot-attachable")).toBe("true");
  });

  it("forced onCheckedChange(false) is still honored, and a real fresh_live toggle round-trips", async () => {
    snapState.snapshot = snap();
    renderQL();
    const toggle = (await screen.findByTestId(TOGGLE_ID)) as HTMLButtonElement;
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    forceToggle(false);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    // Attachable row: the guard must not over-block a legitimate ON.
    forceToggle(true);
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    const payload = await saveNoteAndGetPayload();
    const details = payload.p_details as { sensor?: { status?: string } };
    expect(details?.sensor?.status).toBe("fresh_live");
  });
});
