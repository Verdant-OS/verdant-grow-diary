/**
 * Tests for Daily Grow Check refresh behavior after QuickLog submit.
 *
 * Covers:
 *  - pure helper contract (`refreshDailyCheckQueries`)
 *  - Dashboard `Today's Grow Checks` panel re-invalidates after the
 *    `verdant:entry-created` window event
 *  - Plant Detail Daily Grow Check consistency card re-invalidates after
 *    the same event
 *  - static safety guardrails (no new persistence/RPC/automation surface,
 *    no fake local-only checked state)
 *
 * No QuickLog write-path tests live here — write behavior is owned by
 * existing v0-loop-bug-fixes tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DAILY_CHECK_REFRESH_QUERY_KEYS,
  ENTRY_CREATED_EVENT,
  refreshDailyCheckQueries,
} from "@/lib/dailyCheckRefreshRules";

// ---------------------------------------------------------------------------
// Hook mocks — Daily Grow Check surfaces are read-only, so we feed them
// deterministic empty data and assert on cache invalidation behavior.
// ---------------------------------------------------------------------------
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [] }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({ data: [] }),
  useGrowTents: () => ({ data: [] }),
}));

import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";

function wrap(ui: React.ReactNode, qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------
describe("refreshDailyCheckQueries · pure rules", () => {
  it("invalidates every Daily Grow Check freshness queryKey", () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: ReadonlyArray<string> }) => {
        calls.push(queryKey);
        return undefined;
      },
    };
    refreshDailyCheckQueries(client);
    expect(calls).toEqual([["diary_entries"], ["sensor_readings"]]);
  });

  it("never references write-only or automation surfaces", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/dailyCheckRefreshRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/service_role|action_queue|automation|mqtt|relay|rpc\(/i);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("only lists the two read paths Daily Grow Check derives from", () => {
    expect(DAILY_CHECK_REFRESH_QUERY_KEYS.map((k) => k[0])).toEqual([
      "diary_entries",
      "sensor_readings",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Dashboard panel
// ---------------------------------------------------------------------------
describe("DashboardDailyGrowCheckPanel · entry-created refresh", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidateSpy = vi.fn();
    qc.invalidateQueries = invalidateSpy as never;
  });

  it("invalidates diary_entries + sensor_readings on verdant:entry-created", () => {
    render(wrap(<DashboardDailyGrowCheckPanel scopedGrowId={null} />, qc));
    invalidateSpy.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent(ENTRY_CREATED_EVENT));
    });

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(keys).toContain("diary_entries");
    expect(keys).toContain("sensor_readings");
  });

  it("does not invalidate when no entry-created event fires", () => {
    render(wrap(<DashboardDailyGrowCheckPanel scopedGrowId={null} />, qc));
    invalidateSpy.mockClear();
    // No event dispatched.
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("removes its listener on unmount (no leak, no cross-grow refresh)", () => {
    const { unmount } = render(
      wrap(<DashboardDailyGrowCheckPanel scopedGrowId="grow-a" />, qc),
    );
    unmount();
    invalidateSpy.mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent(ENTRY_CREATED_EVENT));
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Plant Detail consistency card
// ---------------------------------------------------------------------------
describe("PlantDailyGrowCheckConsistencyCard · entry-created refresh", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidateSpy = vi.fn();
    qc.invalidateQueries = invalidateSpy as never;
  });

  it("invalidates diary_entries + sensor_readings on verdant:entry-created", () => {
    render(
      wrap(
        <PlantDailyGrowCheckConsistencyCard
          plantId="p-1"
          currentTentId="t-1"
        />,
        qc,
      ),
    );
    invalidateSpy.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent(ENTRY_CREATED_EVENT));
    });

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(keys).toContain("diary_entries");
    expect(keys).toContain("sensor_readings");
  });

  it("removes its listener on unmount", () => {
    const { unmount } = render(
      wrap(
        <PlantDailyGrowCheckConsistencyCard
          plantId="p-1"
          currentTentId={null}
        />,
        qc,
      ),
    );
    unmount();
    invalidateSpy.mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent(ENTRY_CREATED_EVENT));
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Static safety guardrails
// ---------------------------------------------------------------------------
describe("Daily Grow Check refresh · static safety", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

  const DASH = read("src/components/DashboardDailyGrowCheckPanel.tsx");
  const PLANT = read("src/components/PlantDailyGrowCheckConsistencyCard.tsx");
  const RULES = read("src/lib/dailyCheckRefreshRules.ts");

  it("Dashboard panel listens for the shared entry-created event", () => {
    expect(DASH).toMatch(/ENTRY_CREATED_EVENT/);
    expect(DASH).toMatch(/refreshDailyCheckQueries/);
    expect(DASH).toMatch(/addEventListener\(/);
    expect(DASH).toMatch(/removeEventListener\(/);
  });

  it("Plant Detail card listens for the shared entry-created event", () => {
    expect(PLANT).toMatch(/ENTRY_CREATED_EVENT/);
    expect(PLANT).toMatch(/refreshDailyCheckQueries/);
    expect(PLANT).toMatch(/addEventListener\(/);
    expect(PLANT).toMatch(/removeEventListener\(/);
  });

  it("neither panel introduces a local checked-state shortcut not backed by data", () => {
    // Both panels must continue to derive checked-today from the rules
    // helpers — no setState-based 'optimistic checked' shortcut.
    expect(DASH).not.toMatch(/setChecked|optimistic|fakeChecked/i);
    expect(PLANT).not.toMatch(/setChecked|optimistic|fakeChecked/i);
    expect(DASH).toMatch(/buildDashboardDailyGrowCheckPanel/);
    expect(PLANT).toMatch(/buildDailyGrowCheckConsistency/);
  });

  it("refresh wiring does not add persistence, RPC, sensor ingestion, alerts, action queue, automation, or service_role strings", () => {
    for (const src of [DASH, PLANT, RULES]) {
      expect(src).not.toMatch(
        /service_role|action_queue|automation|mqtt|home[\s_-]?assistant|relay|device_command|\.rpc\(/i,
      );
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });

  it("event name stays the shared verdant:entry-created contract", () => {
    expect(RULES).toMatch(/"verdant:entry-created"/);
  });
});
