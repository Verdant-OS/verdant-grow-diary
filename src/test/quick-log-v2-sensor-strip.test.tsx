/**
 * QuickLogV2Sheet — live sensor snapshot strip mount tests.
 *
 * The One-Tent Loop's Quick Log → Sensor Snapshot link on the primary
 * (v2) logging surface: the sheet mounts QuickLogSensorSnapshotStrip in
 * `context` variant above the manual snapshot fields whenever a target
 * is resolved and the action is not "feed".
 *
 * Contract under test:
 *  - strip renders for a resolved tent target and a resolved plant target;
 *  - strip copy is the context variant — it never claims the reading will
 *    be attached to the saved log;
 *  - no target selected → no strip (an empty sheet stays quiet);
 *  - Feed action → no strip (parity with the manual snapshot block);
 *  - the manual fields remain present and explicitly labeled manual, so
 *    live context and manual entry can never be confused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "Plant 1", tent_id: "t1", grow_id: "g1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/hooks/useRecentFeedingsForDefaults", () => ({
  useRecentFeedingsForDefaults: () => ({ data: [] }),
}));

const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";

function freshSnapshot(): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live • as of 5 min ago • source: live",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
  };
}

const mockUseLatestTentSensorSnapshot = vi.fn();
vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: (...args: unknown[]) => mockUseLatestTentSensorSnapshot(...args),
  };
});

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet(defaultTargetKey?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUseLatentSnapshotReady();
});

function mockUseLatentSnapshotReady() {
  mockUseLatestTentSensorSnapshot.mockReturnValue({
    status: "ready",
    snapshot: freshSnapshot(),
    lastUpdatedAt: Date.parse("2026-06-02T12:00:00Z"),
  });
}

describe("QuickLogV2Sheet — sensor snapshot strip", () => {
  it("renders the context-variant strip for a resolved tent target", () => {
    renderSheet("tent:t1");
    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip.getAttribute("data-variant")).toBe("context");
    expect(strip.getAttribute("data-status")).toBe("usable");
    expect(mockUseLatestTentSensorSnapshot).toHaveBeenCalledWith("t1");
    expect(screen.getByText("Latest tent reading, shown for context only.")).toBeTruthy();
    // Context surfaces never promise attachment.
    expect(screen.queryByText(/will include/i)).toBeNull();
  });

  it("renders the strip for a plant target via the plant's tent", () => {
    renderSheet("plant:p1");
    expect(screen.getByTestId("quicklog-sensor-snapshot-strip")).toBeTruthy();
    expect(mockUseLatestTentSensorSnapshot).toHaveBeenCalledWith("t1");
  });

  it("renders no strip when no target is selected", () => {
    renderSheet(undefined);
    expect(screen.queryByTestId("quicklog-sensor-snapshot-strip")).toBeNull();
  });

  it("hides the strip for the Feed action (parity with the manual block)", () => {
    renderSheet("plant:p1");
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(screen.queryByTestId("quicklog-sensor-snapshot-strip")).toBeNull();
  });

  it("keeps the manual snapshot fields present and labeled manual", () => {
    renderSheet("tent:t1");
    expect(screen.getByText("Manual sensor snapshot (optional)")).toBeTruthy();
    expect(screen.getByText(/Source: manual/i)).toBeTruthy();
  });
});
