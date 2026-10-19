/**
 * Plant page must read Quick Log V2 manual environment readings.
 *
 * Production bug: a plant-level manual reading saved via the V2 sheet
 * (78°F / 60% RH / 1.3 kPa) is stored only in grow_events +
 * environment_events. The Sensors tent view showed it; the Plant page showed
 * "Current environment: Unknown" and "Manual sensor memory: No recent log"
 * because both plant readers only looked at sensor_readings_effective and
 * diary_entries.details.manual_sensor_snapshot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

type TableData = Record<string, unknown[]>;
const tableData: TableData = {};
const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
const failTables = new Set<string>();

function chainFor(table: string) {
  const chain: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ table, method, args });
      return chain;
    };
  for (const m of ["select", "eq", "is", "or", "order", "limit", "in"]) chain[m] = record(m);
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(
      failTables.has(table)
        ? { data: null, error: { message: "read failed" } }
        : { data: tableData[table] ?? [], error: null },
    ).then(resolve, reject);
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ table, method: "from", args: [table] });
      return chainFor(table);
    },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

import {
  manualEnvironmentEventsToTentReadingRows,
  latestManualReadingsFromEnvironmentEvents,
  mergePlantTentReadingsWithManualEvents,
  parsePlantManualEnvironmentEvents,
} from "@/lib/plantManualEnvironmentEventRules";
import { usePlantManualEnvironmentReadings } from "@/hooks/usePlantManualEnvironmentReadings";
import { usePlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

const PLANT = "plant-1";
const TENT = "tent-1";

function envRow(over: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    plant_id: PLANT,
    tent_id: TENT,
    occurred_at: "2026-10-14T12:00:00+00:00",
    event_type: "environment",
    source: "manual",
    is_deleted: false,
    note: null,
    environment_events: [{ temperature_c: 25.56, humidity_pct: 60, vpd_kpa: 1.3 }],
    ...over,
  };
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  for (const k of Object.keys(tableData)) delete tableData[k];
  calls.length = 0;
  failTables.clear();
});

describe("plantManualEnvironmentEventRules (pure)", () => {
  it("maps a 78°F (25.56°C) manual environment event to manual-labelled tent reading rows", () => {
    const rows = manualEnvironmentEventsToTentReadingRows([envRow()]);
    expect(rows).toEqual([
      {
        ts: "2026-10-14T12:00:00+00:00",
        captured_at: "2026-10-14T12:00:00+00:00",
        metric: "temperature_c",
        value: 25.56,
        source: "manual",
        device_id: null,
      },
      {
        ts: "2026-10-14T12:00:00+00:00",
        captured_at: "2026-10-14T12:00:00+00:00",
        metric: "humidity_pct",
        value: 60,
        source: "manual",
        device_id: null,
      },
      {
        ts: "2026-10-14T12:00:00+00:00",
        captured_at: "2026-10-14T12:00:00+00:00",
        metric: "vpd_kpa",
        value: 1.3,
        source: "manual",
        device_id: null,
      },
    ]);
    expect(rows.every((r) => r.source === "manual")).toBe(true);
  });

  it("maps the same event to manual sensor memory in °F with ph/ec left null", () => {
    const latest = latestManualReadingsFromEnvironmentEvents([envRow()]);
    expect(latest.temp_f).toEqual({ value: 78, loggedAt: "2026-10-14T12:00:00+00:00" });
    expect(latest.humidity_percent).toEqual({ value: 60, loggedAt: "2026-10-14T12:00:00+00:00" });
    expect(latest.ph).toBeNull();
    expect(latest.ec).toBeNull();
  });

  it("skips null, garbage, deleted, non-manual, non-environment and undated rows", () => {
    const parsed = parsePlantManualEnvironmentEvents([
      null,
      "garbage",
      envRow({ id: "no-values", environment_events: [] }),
      envRow({
        id: "all-null",
        environment_events: { temperature_c: null, humidity_pct: "abc", vpd_kpa: NaN },
      }),
      envRow({ id: "deleted", is_deleted: true }),
      envRow({ id: "live", source: "live" }),
      envRow({ id: "watering", event_type: "watering" }),
      envRow({ id: "undated", occurred_at: "not-a-date" }),
    ] as never);
    expect(parsed).toEqual([]);
  });

  it("keeps partial values as null and never invents missing metrics", () => {
    const parsed = parsePlantManualEnvironmentEvents([
      envRow({ environment_events: { temperature_c: "24.5", humidity_pct: null, vpd_kpa: null } }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ temperatureC: 24.5, humidityPct: null, vpdKpa: null });
    const rows = manualEnvironmentEventsToTentReadingRows([
      envRow({ environment_events: { temperature_c: "24.5", humidity_pct: null, vpd_kpa: null } }),
    ]);
    expect(rows.map((r) => r.metric)).toEqual(["temperature_c"]);
    const latest = latestManualReadingsFromEnvironmentEvents([
      envRow({ environment_events: { temperature_c: null, humidity_pct: 55, vpd_kpa: null } }),
    ]);
    expect(latest.temp_f).toBeNull();
    expect(latest.humidity_percent?.value).toBe(55);
  });

  it("sorts newest first with a deterministic id tie-breaker", () => {
    const input = [
      envRow({ id: "b", occurred_at: "2026-10-14T10:00:00+00:00" }),
      envRow({ id: "c", occurred_at: "2026-10-14T12:00:00+00:00" }),
      envRow({ id: "a", occurred_at: "2026-10-14T10:00:00+00:00" }),
    ];
    const ids = parsePlantManualEnvironmentEvents(input).map((e) => e.id);
    expect(ids).toEqual(["c", "a", "b"]);
    expect(parsePlantManualEnvironmentEvents([...input].reverse()).map((e) => e.id)).toEqual(ids);
  });

  it("merges into sensor rows newest-first without reordering sensor rows or duplicating", () => {
    const sensor = [
      { ts: "2026-10-14T13:00:00+00:00", metric: "temperature_c", value: 24, source: "live" },
      { ts: "2026-10-14T11:00:00+00:00", metric: "temperature_c", value: 23, source: "live" },
    ];
    const manual = manualEnvironmentEventsToTentReadingRows([
      envRow({ environment_events: { temperature_c: 25.56, humidity_pct: null, vpd_kpa: null } }),
    ]);
    const merged = mergePlantTentReadingsWithManualEvents(sensor, manual);
    expect(merged.map((r) => r.value)).toEqual([24, 25.56, 23]);
    expect(mergePlantTentReadingsWithManualEvents(sensor, [])).toBe(sensor);
    const dup = [{ ...manual[0] }];
    expect(mergePlantTentReadingsWithManualEvents(dup, manual)).toEqual(dup);
  });
});

describe("plant hooks surface manual environment_events", () => {
  it("usePlantManualEnvironmentReadings returns the plant's manual reading from environment_events", async () => {
    tableData.sensor_readings_effective = [];
    tableData.grow_events = [envRow()];
    const { result } = renderHook(() => usePlantManualEnvironmentReadings(TENT, PLANT), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const temp = result.current.data?.find((r) => r.metric === "temperature_c");
    expect(temp).toMatchObject({ value: 25.56, source: "manual" });
    const growCalls = calls.filter((c) => c.table === "grow_events");
    expect(growCalls).toContainEqual({
      table: "grow_events",
      method: "eq",
      args: ["tent_id", TENT],
    });
    expect(growCalls).toContainEqual({
      table: "grow_events",
      method: "or",
      args: [`plant_id.eq.${PLANT},plant_id.is.null`],
    });
  });

  it("usePlantManualSensorHistory returns the manual reading when diary details are empty", async () => {
    tableData.diary_entries = [];
    tableData.grow_events = [envRow()];
    const { result } = renderHook(() => usePlantManualSensorHistory(PLANT), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.temp_f).toEqual({
      value: 78,
      loggedAt: "2026-10-14T12:00:00+00:00",
    });
    expect(result.current.data?.humidity_percent?.value).toBe(60);
    expect(calls).toContainEqual({ table: "grow_events", method: "eq", args: ["plant_id", PLANT] });
  });
});

import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { buildQuickLogRevisionInvalidationKeys } from "@/lib/quickLogRevisionInvalidationRules";

describe("Codex review on #2115", () => {
  function clientAndWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    return { qc, w };
  }
  const growReads = () =>
    calls.filter((c) => c.table === "grow_events" && c.method === "from").length;

  it("the plant environment read refetches after the frozen Quick Log post-save refresh", async () => {
    tableData.grow_events = [];
    const { qc, w } = clientAndWrapper();
    const { result } = renderHook(() => usePlantManualEnvironmentReadings(TENT, PLANT), {
      wrapper: w,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    const before = growReads();

    tableData.grow_events = [envRow()];
    applyQuickLogV2Refresh(qc, { targetType: "plant", targetId: PLANT, tentId: TENT });

    await waitFor(() =>
      expect(result.current.data?.find((r) => r.metric === "temperature_c")).toMatchObject({
        value: 25.56,
      }),
    );
    expect(growReads()).toBe(before + 1);
  });

  it("the plant environment read is covered by the correction/retraction invalidation set", async () => {
    tableData.grow_events = [];
    const { qc, w } = clientAndWrapper();
    const { result } = renderHook(() => usePlantManualEnvironmentReadings(TENT, PLANT), {
      wrapper: w,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const before = growReads();
    tableData.grow_events = [envRow()];
    for (const queryKey of buildQuickLogRevisionInvalidationKeys({
      plantId: PLANT,
      tentId: TENT,
    })) {
      void qc.invalidateQueries({ queryKey });
    }
    await waitFor(() => expect(result.current.data?.length ?? 0).toBeGreaterThan(0));
    expect(growReads()).toBe(before + 1);
  });

  it("keeps diary-backed manual memory when the grow_events read fails", async () => {
    tableData.diary_entries = [
      {
        id: "d-1",
        entry_at: "2026-10-13T09:00:00+00:00",
        details: { manual_sensor_snapshot: { source: "manual", temp_f: 74, humidity_percent: 55 } },
      },
    ];
    failTables.add("grow_events");
    const { w } = clientAndWrapper();
    const { result } = renderHook(() => usePlantManualSensorHistory(PLANT), { wrapper: w });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data?.temp_f).toEqual({
      value: 74,
      loggedAt: "2026-10-13T09:00:00+00:00",
    });
    expect(result.current.data?.humidity_percent?.value).toBe(55);
  });

  it("still fails when the diary read itself fails", async () => {
    failTables.add("diary_entries");
    const { w } = clientAndWrapper();
    const { result } = renderHook(() => usePlantManualSensorHistory(PLANT), { wrapper: w });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

import { snapshotFromReadings } from "@/lib/sensorSnapshot";

describe("Codex re-review on #2115 — equal-time collisions", () => {
  const AT = "2026-10-14T12:00:00+00:00";

  it.each(["live", "csv"])(
    "a manual reading wins a same-metric, same-time collision with a %s row",
    (other) => {
      const sensor = [
        { ts: AT, captured_at: AT, metric: "temperature_c", value: 20, source: other },
      ];
      const manual = manualEnvironmentEventsToTentReadingRows([
        envRow({ environment_events: { temperature_c: 25.56, humidity_pct: null, vpd_kpa: null } }),
      ]);
      const merged = mergePlantTentReadingsWithManualEvents(sensor, manual);
      expect(merged.map((r) => r.source)).toEqual(["manual", other]);
      const snap = snapshotFromReadings(merged as never);
      expect(snap?.source).toBe("manual");
      expect(snap?.temp).toBe(25.56);
    },
  );

  it("keeps sensor rows' relative order and puts strictly older manual rows after them", () => {
    const sensor = [
      { ts: AT, metric: "temperature_c", value: 24, source: "live" },
      { ts: AT, metric: "humidity_pct", value: 50, source: "live" },
    ];
    const manual = manualEnvironmentEventsToTentReadingRows([
      envRow({
        occurred_at: "2026-10-14T11:00:00+00:00",
        environment_events: { temperature_c: 25.56, humidity_pct: null, vpd_kpa: null },
      }),
    ]);
    const merged = mergePlantTentReadingsWithManualEvents(sensor, manual);
    expect(merged.map((r) => `${r.source}:${r.metric}`)).toEqual([
      "live:temperature_c",
      "live:humidity_pct",
      "manual:temperature_c",
    ]);
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";
import PlantStatusStrip from "@/components/PlantStatusStrip";
import { combinePlantEnvironmentReads } from "@/lib/plantManualEnvironmentEventRules";

describe("Codex re-review on #2115 — environment read state covers both reads", () => {
  const ok = {
    isError: false,
    isPending: false,
    isLoading: false,
    isFetching: false,
    fetchStatus: "idle",
  };

  it("is an error when only the manual read failed, and retries both sources", () => {
    const sensorRefetch = vi.fn();
    const manualRefetch = vi.fn();
    const read = combinePlantEnvironmentReads({
      sensor: { ...ok, refetch: sensorRefetch },
      manual: { ...ok, isError: true, refetch: manualRefetch },
      manualEnabled: true,
    });
    expect(read.isError).toBe(true);
    read.refetch();
    expect(sensorRefetch).toHaveBeenCalledTimes(1);
    expect(manualRefetch).toHaveBeenCalledTimes(1);
  });

  it("is pending or paused while only the manual read is", () => {
    expect(
      combinePlantEnvironmentReads({
        sensor: { ...ok, refetch: () => {} },
        manual: {
          ...ok,
          isPending: true,
          isLoading: true,
          fetchStatus: "fetching",
          refetch: () => {},
        },
        manualEnabled: true,
      }),
    ).toMatchObject({ isPending: true, isLoading: true, fetchStatus: "fetching" });
    expect(
      combinePlantEnvironmentReads({
        sensor: { ...ok, refetch: () => {} },
        manual: { ...ok, isPending: true, fetchStatus: "paused", refetch: () => {} },
        manualEnabled: true,
      }).fetchStatus,
    ).toBe("paused");
  });

  it("ignores a disabled manual read (no plant id)", () => {
    const manualRefetch = vi.fn();
    const read = combinePlantEnvironmentReads({
      sensor: { ...ok, refetch: () => {} },
      manual: { ...ok, isPending: true, refetch: manualRefetch },
      manualEnabled: false,
    });
    expect(read).toMatchObject({ isError: false, isPending: false, fetchStatus: "idle" });
    read.refetch();
    expect(manualRefetch).not.toHaveBeenCalled();
  });

  function renderWithProviders(node: React.ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>{node}</MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("the panel shows unavailable, not 'No sensor readings', when only grow_events failed, and Retry reads both", async () => {
    tableData.sensor_readings_effective = [];
    failTables.add("grow_events");
    renderWithProviders(<PlantTentEnvironmentPanel tentId={TENT} plantId={PLANT} />);
    expect(await screen.findByText("Sensor readings unavailable.")).toBeInTheDocument();
    expect(screen.queryByTestId("plant-tent-environment-empty-no-readings")).toBeNull();

    const before = calls.filter((c) => c.method === "from").map((c) => c.table);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      const after = calls.filter((c) => c.method === "from").map((c) => c.table);
      const added = after.slice(before.length);
      expect(added).toContain("grow_events");
      expect(added.some((t) => t !== "grow_events")).toBe(true);
    });
  });

  it("the status strip does not call the environment known while grow_events failed", async () => {
    tableData.sensor_readings_effective = [];
    failTables.add("grow_events");
    renderWithProviders(<PlantStatusStrip tentId={TENT} growId="grow-1" plantId={PLANT} />);
    expect(await screen.findByText(/Unavailable/)).toBeInTheDocument();
  });
});

describe("Codex re-review on #2115 — implausible manual metrics", () => {
  it("drops an event whose every metric fails the canonical validity guards", () => {
    expect(
      parsePlantManualEnvironmentEvents([
        envRow({ environment_events: { temperature_c: 95, humidity_pct: 120, vpd_kpa: 15 } }),
      ]),
    ).toEqual([]);
  });

  it("keeps only the valid metrics of a mixed event, in every projection", () => {
    const row = envRow({
      environment_events: { temperature_c: 95, humidity_pct: 55, vpd_kpa: -1 },
    });
    const [ev] = parsePlantManualEnvironmentEvents([row]);
    expect(ev).toMatchObject({ temperatureC: null, humidityPct: 55, vpdKpa: null });
    expect(manualEnvironmentEventsToTentReadingRows([row]).map((r) => r.metric)).toEqual([
      "humidity_pct",
    ]);
    const latest = latestManualReadingsFromEnvironmentEvents([row]);
    expect(latest.temp_f).toBeNull();
    expect(latest.humidity_percent?.value).toBe(55);
  });

  it("keeps boundary values the guards accept", () => {
    const [ev] = parsePlantManualEnvironmentEvents([
      envRow({ environment_events: { temperature_c: 60, humidity_pct: 100, vpd_kpa: 0 } }),
    ]);
    expect(ev).toMatchObject({ temperatureC: 60, humidityPct: 100, vpdKpa: 0 });
  });
});
