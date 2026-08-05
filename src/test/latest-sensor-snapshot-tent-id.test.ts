/**
 * Regression: useLatestSensorSnapshot now surfaces which tent the winning
 * reading came from (`tentId`), instead of silently discarding it.
 *
 * Root bug this closes: `public.alerts.tent_id` was ALWAYS null because
 * neither `usePersistEnvironmentAlerts` call site had a tent id to attach —
 * `useLatestSensorSnapshot` selected `tent_id` from sensor_readings but
 * threw it away when building the snapshot. `PlantAssignedTentAlertsPanel`
 * (already mounted on Plant Detail) filters open alerts by tent_id, so it
 * always rendered its empty state regardless of real open breaches. See
 * project memory `project-plant-assigned-tent-alerts-tent-id-null`.
 *
 * This file proves the hook now returns the correct tent id for: a single
 * winning tent, multiple tents where only one has the latest reading, the
 * diary fallback, and the empty/no-data case (stays null, no regression).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const state = vi.hoisted(() => ({
  sensorReadingsRows: [] as Array<{
    ts: string;
    metric: string;
    value: number;
    source: string;
    tent_id: string;
    created_at: string;
    raw_payload: unknown;
  }>,
  diaryRows: [] as Array<{
    entry_at: string;
    details: Record<string, unknown> | null;
    tent_id: string | null;
  }>,
}));

function chain(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(result),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "sensor_readings") {
        return chain({ data: state.sensorReadingsRows, error: null });
      }
      if (table === "diary_entries") {
        return chain({ data: state.diaryRows, error: null });
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";

function renderSnapshot(growId: string, tentIds: string[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useLatestSensorSnapshot(growId, tentIds), { wrapper });
}

beforeEach(() => {
  state.sensorReadingsRows = [];
  state.diaryRows = [];
});

describe("useLatestSensorSnapshot · tentId (regression)", () => {
  it("returns the winning reading's tent_id for a single-tent grow", async () => {
    state.sensorReadingsRows = [
      {
        ts: "2026-08-05T12:00:00.000Z",
        metric: "temperature_c",
        value: 24,
        source: "live",
        tent_id: "tent-flower",
        created_at: "2026-08-05T12:00:01.000Z",
        raw_payload: null,
      },
    ];
    const { result } = renderSnapshot("g1", ["tent-flower"]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.tentId).toBe("tent-flower");
  });

  it("attributes to the tent that actually produced the latest reading across multiple tents", async () => {
    state.sensorReadingsRows = [
      // Latest ts: tent-veg. Older rows from tent-flower must not win.
      {
        ts: "2026-08-05T12:05:00.000Z",
        metric: "temperature_c",
        value: 22,
        source: "live",
        tent_id: "tent-veg",
        created_at: "2026-08-05T12:05:01.000Z",
        raw_payload: null,
      },
      {
        ts: "2026-08-05T11:00:00.000Z",
        metric: "temperature_c",
        value: 26,
        source: "live",
        tent_id: "tent-flower",
        created_at: "2026-08-05T11:00:01.000Z",
        raw_payload: null,
      },
    ];
    const { result } = renderSnapshot("g1", ["tent-flower", "tent-veg"]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.temp).toBe(22);
    expect(result.current.tentId).toBe("tent-veg");
  });

  it("falls back to the diary row's tent_id when no sensor_readings exist", async () => {
    state.diaryRows = [
      {
        entry_at: "2026-08-05T09:00:00.000Z",
        details: { sensor_snapshot: { temp: 23, rh: 50, vpd: 1.0 } },
        tent_id: "tent-seedling",
      },
    ];
    const { result } = renderSnapshot("g1", ["tent-seedling"]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.source).toBe("diary");
    expect(result.current.tentId).toBe("tent-seedling");
  });

  it("stays null when nothing is available (no regression vs prior always-null behavior)", async () => {
    const { result } = renderSnapshot("g1", ["tent-flower"]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.source).toBe("unavailable");
    expect(result.current.tentId).toBeNull();
  });

  it("stays null while idle/loading", () => {
    const { result } = renderSnapshot("", []);
    expect(result.current.status).toBe("idle");
    expect(result.current.tentId).toBeNull();
  });
});
