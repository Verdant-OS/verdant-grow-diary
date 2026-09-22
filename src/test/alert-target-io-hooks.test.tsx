/**
 * Alert target I/O hooks — behavioral regression pins.
 *
 * useAlertTargetNames and useAlertLinkedTargetEvidence are mocked in every
 * Alert Detail / list page test. A hook that always returned empty maps would
 * keep those suites green while routing every failure to "Name unavailable".
 *
 * These tests drive the real hooks with a mocked Supabase client and assert on
 * resolved hook state (maps, status, idsLoading) — not source scans.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAlertTargetNames } from "@/hooks/useAlertTargetNames";
import { useAlertLinkedTargetEvidence } from "@/hooks/useAlertLinkedTargetEvidence";

type TablePayload = { data: unknown; error: unknown };

const supabaseState = vi.hoisted(() => ({
  tables: {} as Record<string, TablePayload>,
  from: vi.fn((table: string) => {
    const payload = supabaseState.tables[table] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      then: (resolve: (value: TablePayload) => unknown) =>
        Promise.resolve({ data: payload.data, error: payload.error }).then(resolve),
    };
    return builder;
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: supabaseState.from },
}));

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT_A = "33333333-3333-4333-8333-333333333333";
const GROW_A = "44444444-4444-4444-8444-444444444444";
const GROW_B = "55555555-5555-4555-8555-555555555555";
const SNAPSHOT_ID = "66666666-6666-4666-8666-666666666666";
const ALERT_ID = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  supabaseState.from.mockReset();
  supabaseState.from.mockImplementation((table: string) => {
    const payload = supabaseState.tables[table] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      then: (resolve: (value: TablePayload) => unknown) =>
        Promise.resolve({ data: payload.data, error: payload.error }).then(resolve),
    };
    return builder;
  });
  supabaseState.tables = {};
});

describe("useAlertTargetNames", () => {
  it("loads tent and plant name maps and sole-tent grow fallback", async () => {
    supabaseState.tables.tents = {
      data: [
        { id: TENT_A, name: "One-Tent", grow_id: GROW_A },
        { id: TENT_B, name: "Second Tent", grow_id: GROW_B },
        { id: "88888888-8888-4888-8888-888888888888", name: "Solo Tent", grow_id: GROW_B },
      ],
      error: null,
    };
    supabaseState.tables.plants = {
      data: [{ id: PLANT_A, name: "Keeper A" }],
      error: null,
    };

    const { result } = renderHook(() => useAlertTargetNames());

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.tentNameById.get(TENT_A)).toBe("One-Tent");
    expect(result.current.plantNameById.get(PLANT_A)).toBe("Keeper A");
    expect(result.current.singleTentIdByGrowId.get(GROW_A)).toBe(TENT_A);
    expect(result.current.singleTentIdByGrowId.has(GROW_B)).toBe(false);
    expect(supabaseState.from).toHaveBeenCalledWith("tents");
    expect(supabaseState.from).toHaveBeenCalledWith("plants");
  });

  it("drops UUID-shaped names instead of surfacing internal ids", async () => {
    supabaseState.tables.tents = {
      data: [{ id: TENT_A, name: TENT_A, grow_id: GROW_A }],
      error: null,
    };
    supabaseState.tables.plants = {
      data: [{ id: PLANT_A, name: "   " }],
      error: null,
    };

    const { result } = renderHook(() => useAlertTargetNames());

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.tentNameById.size).toBe(0);
    expect(result.current.plantNameById.size).toBe(0);
  });

  it("fail-closed on read error — empty maps and unavailable status", async () => {
    supabaseState.tables.tents = { data: null, error: { message: "denied" } };
    supabaseState.tables.plants = {
      data: [{ id: PLANT_A, name: "Keeper A" }],
      error: null,
    };

    const { result } = renderHook(() => useAlertTargetNames());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.tentNameById.size).toBe(0);
    expect(result.current.plantNameById.size).toBe(0);
    expect(result.current.singleTentIdByGrowId.size).toBe(0);
  });

  it("fail-closed when plants read errors even if tents succeed", async () => {
    supabaseState.tables.tents = {
      data: [{ id: TENT_A, name: "One-Tent", grow_id: GROW_A }],
      error: null,
    };
    supabaseState.tables.plants = { data: null, error: { message: "denied" } };

    const { result } = renderHook(() => useAlertTargetNames());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.tentNameById.size).toBe(0);
    expect(result.current.plantNameById.size).toBe(0);
    expect(result.current.singleTentIdByGrowId.size).toBe(0);
  });

  it("fail-closed when the parallel fetch rejects", async () => {
    supabaseState.from.mockImplementation((table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (resolve: (value: TablePayload) => unknown, reject?: (reason: Error) => unknown) =>
          (table === "tents"
            ? Promise.reject(new Error("network"))
            : Promise.resolve({ data: [], error: null })
          ).then(resolve, reject),
      };
      return builder;
    });

    const { result } = renderHook(() => useAlertTargetNames());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.tentNameById.size).toBe(0);
    expect(result.current.plantNameById.size).toBe(0);
  });
});

describe("useAlertLinkedTargetEvidence", () => {
  it("skips lookup when alert columns already carry tent and plant ids", async () => {
    const { result } = renderHook(() =>
      useAlertLinkedTargetEvidence([
        {
          id: ALERT_ID,
          tent_id: TENT_A,
          plant_id: PLANT_A,
          originating_timeline_events: [
            { id: SNAPSHOT_ID, type: "sensor_snapshot", source: "manual" },
          ],
        },
      ]),
    );

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.evidenceByAlertId.size).toBe(0);
    expect(result.current.idsLoading).toBe(false);
    expect(supabaseState.from).not.toHaveBeenCalled();
  });

  it("resolves tent/plant ids from linked sensor snapshot evidence", async () => {
    supabaseState.tables.sensor_readings = {
      data: [{ id: SNAPSHOT_ID, tent_id: TENT_A }],
      error: null,
    };
    supabaseState.tables.diary_entries = { data: [], error: null };
    supabaseState.tables.grow_events = { data: [], error: null };

    const { result } = renderHook(() =>
      useAlertLinkedTargetEvidence([
        {
          id: ALERT_ID,
          tent_id: null,
          plant_id: null,
          originating_timeline_events: [
            { id: SNAPSHOT_ID, type: "sensor_snapshot", source: "manual" },
          ],
        },
      ]),
    );

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.idsLoading).toBe(false);
    const evidence = result.current.evidenceByAlertId.get(ALERT_ID);
    expect(evidence).toEqual([{ tentId: TENT_A, plantId: null }]);
    expect(supabaseState.from).toHaveBeenCalledWith("sensor_readings");
    expect(supabaseState.from).toHaveBeenCalledWith("diary_entries");
    expect(supabaseState.from).toHaveBeenCalledWith("grow_events");
  });

  it("merges diary and grow_event rows and skips deleted events", async () => {
    const diaryId = "99999999-9999-4999-8999-999999999999";
    supabaseState.tables.sensor_readings = { data: [], error: null };
    supabaseState.tables.diary_entries = {
      data: [{ id: diaryId, tent_id: TENT_A, plant_id: PLANT_A }],
      error: null,
    };
    supabaseState.tables.grow_events = {
      data: [
        { id: diaryId, tent_id: TENT_B, plant_id: null, is_deleted: true },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          tent_id: TENT_B,
          plant_id: null,
          is_deleted: false,
        },
      ],
      error: null,
    };

    const { result } = renderHook(() =>
      useAlertLinkedTargetEvidence([
        {
          id: ALERT_ID,
          tent_id: null,
          plant_id: null,
          originating_timeline_events: [
            { id: diaryId, type: "diary_entry", source: "manual" },
            { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "diary_entry", source: "manual" },
          ],
        },
      ]),
    );

    await waitFor(() => expect(result.current.status).toBe("ok"));
    const evidence = result.current.evidenceByAlertId.get(ALERT_ID);
    expect(evidence).toEqual([
      { tentId: TENT_A, plantId: PLANT_A },
      { tentId: TENT_B, plantId: null },
    ]);
  });

  it("fail-closed on read error — empty evidence and unavailable status", async () => {
    supabaseState.tables.sensor_readings = { data: null, error: { message: "denied" } };
    supabaseState.tables.diary_entries = { data: [], error: null };
    supabaseState.tables.grow_events = { data: [], error: null };

    const { result } = renderHook(() =>
      useAlertLinkedTargetEvidence([
        {
          id: ALERT_ID,
          tent_id: null,
          plant_id: null,
          originating_timeline_events: [
            { id: SNAPSHOT_ID, type: "sensor_snapshot", source: "manual" },
          ],
        },
      ]),
    );

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.evidenceByAlertId.size).toBe(0);
    expect(result.current.idsLoading).toBe(false);
  });

  it("reports idsLoading while linked evidence is still fetching", async () => {
    let resolveReadings!: (value: TablePayload) => void;
    const readingsPromise = new Promise<TablePayload>((resolve) => {
      resolveReadings = resolve;
    });

    supabaseState.from.mockImplementation((table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        then: (resolve: (value: TablePayload) => unknown) => {
          if (table === "sensor_readings") {
            return readingsPromise.then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    });

    const { result } = renderHook(() =>
      useAlertLinkedTargetEvidence([
        {
          id: ALERT_ID,
          tent_id: null,
          plant_id: null,
          originating_timeline_events: [
            { id: SNAPSHOT_ID, type: "sensor_snapshot", source: "manual" },
          ],
        },
      ]),
    );

    await waitFor(() => expect(result.current.status).toBe("loading"));
    expect(result.current.idsLoading).toBe(true);

    resolveReadings({ data: [{ id: SNAPSHOT_ID, tent_id: TENT_A }], error: null });

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.idsLoading).toBe(false);
    expect(result.current.evidenceByAlertId.get(ALERT_ID)).toEqual([
      { tentId: TENT_A, plantId: null },
    ]);
  });
});
