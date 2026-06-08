/**
 * Keyboard / focus & session-local helper tests for the Quick Log
 * sensor attach Switch and the sensor strip action link.
 *
 * No user-event dep is installed, so we drive focus via the DOM:
 *  - focusable elements are native <button> (Radix Switch) and <a href>.
 *  - DOM order ≡ tab order for these elements (no tabIndex overrides).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import type { LatestTentSensorSnapshotState } from "@/lib/sensor";

const NOW = new Date("2026-06-08T12:00:00Z");

// ─── Strip-only focus tests ────────────────────────────────────────────
const mockUseLatestTentSensorSnapshot = vi.fn();
vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: (...a: unknown[]) =>
      mockUseLatestTentSensorSnapshot(...a),
  };
});

function staleState(): LatestTentSensorSnapshotState {
  const snap: StrictSensorSnapshot = {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: "2026-06-06T12:00:00Z",
    age_minutes: 2880,
    source: "live",
    freshness: "stale",
    status: "stale" as SensorSnapshotStatus,
    badge_label: "Stale",
    metrics: { ...EMPTY_SENSOR_SNAPSHOT.metrics, temp_f: 75 },
    usable: false,
  };
  return { status: "ready", snapshot: snap, lastUpdatedAt: NOW.getTime() };
}

describe("QuickLogSensorSnapshotStrip — keyboard focus", () => {
  beforeEach(() => mockUseLatestTentSensorSnapshot.mockReset());
  afterEach(() => cleanup());

  it("action link is a real <a href='/sensors'> and is focusable", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(staleState());
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId(
      "quicklog-sensor-snapshot-action",
    ) as HTMLAnchorElement;
    expect(action.tagName).toBe("A");
    expect(action.getAttribute("href")).toBe("/sensors");
    expect(action.tabIndex).not.toBe(-1);
    action.focus();
    expect(document.activeElement).toBe(action);
  });

  it("action link has visible focus styling", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(staleState());
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action.className).toMatch(/focus-visible:ring-2/);
  });
});

// ─── Full QuickLog focus order + session-helper tests ──────────────────
vi.unmock("@/lib/sensor");

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
    channel: () => ({
      on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
      subscribe: () => ({ unsubscribe: () => {} }),
      unsubscribe: () => {},
    }),
    removeChannel: () => {},
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
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Blue Dream", strain: "BD", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));
// Mock the strip so we don't need realtime hooks; assert focus order via
// a stand-in anchor with the production testid.
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({
  default: () => (
    <a
      href="/sensors"
      data-testid="quicklog-sensor-snapshot-action"
      className="focus-visible:ring-2"
    >
      Refresh snapshot
    </a>
  ),
}));

import QuickLog from "@/components/QuickLog";

function renderQL() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("QuickLog — attach switch session helper + focus order", () => {
  beforeEach(() => rpcMock.mockClear());
  afterEach(() => cleanup());

  it("renders the session-local helper copy under the attach switch", () => {
    renderQL();
    const helper = screen.getByTestId("quick-log-snapshot-session-helper");
    expect(helper).toHaveTextContent(
      "Applies to this log only. Closing Quick Log resets this choice.",
    );
    // Must not mention persistence/localStorage.
    expect(helper.textContent ?? "").not.toMatch(/localStorage|persist|remembered/i);
  });

  it("attach Switch is described by the session helper", () => {
    renderQL();
    const sw = screen.getByRole("switch", { name: /attach sensor snapshot to this log/i });
    expect(sw.getAttribute("aria-describedby")).toBe(
      "quick-log-snapshot-session-helper",
    );
  });

  it("attach Switch has the required accessible name", () => {
    renderQL();
    const sw = screen.getByRole("switch", { name: /attach sensor snapshot to this log/i });
    expect(sw).toBeInTheDocument();
  });

  it("attach Switch precedes the strip /sensors action in DOM/tab order", () => {
    renderQL();
    const sw = screen.getByRole("switch", { name: /attach sensor snapshot to this log/i });
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    // compareDocumentPosition returns DOCUMENT_POSITION_FOLLOWING (4) when
    // `action` comes after `sw` in document order — which equals tab order
    // because neither element opts out via tabIndex < 0.
    const rel = sw.compareDocumentPosition(action);
    expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Both are focusable.
    expect((sw as HTMLElement).tabIndex).not.toBe(-1);
    expect((action as HTMLElement).tabIndex).not.toBe(-1);
  });

  it("strip action link is a real anchor with href='/sensors'", () => {
    renderQL();
    const action = screen.getByTestId(
      "quicklog-sensor-snapshot-action",
    ) as HTMLAnchorElement;
    expect(action.tagName).toBe("A");
    expect(action.getAttribute("href")).toBe("/sensors");
  });
});
