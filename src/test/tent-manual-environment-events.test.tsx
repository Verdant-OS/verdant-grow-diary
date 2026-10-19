/**
 * Production QA 2026-10-14: a Fast Check sensor snapshot logged on the TENT
 * showed in the tent page's Quick Log memory list, yet the same page said
 * "No manual snapshots saved yet for this tent" and "No manual sensor
 * snapshots in this tent’s diary yet", and a reading saved seconds earlier
 * was labelled "Historical review reading". Quick Log V2 stores snapshots
 * only in grow_events + environment_events, which these readers never
 * loaded. Owner decision (Batch 2, bugs 2 and 5): readers learn
 * environment_events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const db = vi.hoisted(() => ({
  byTable: {} as Record<string, unknown[]>,
  reads: [] as string[],
  failTables: new Set<string>(),
  holdTables: new Set<string>(),
  orders: [] as Array<{ table: string; column: string; ascending: boolean | undefined }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "not", "is", "in", "neq", "gte", "lte"]) {
      q[m] = () => q;
    }
    q.order = (column: string, opts?: { ascending?: boolean }) => {
      db.orders.push({ table, column, ascending: opts?.ascending });
      return q;
    };
    q.limit = () => {
      db.reads.push(table);
      if (db.holdTables.has(table)) return new Promise(() => {});
      if (db.failTables.has(table)) {
        return Promise.resolve({ data: null, error: { message: "read failed" } });
      }
      return Promise.resolve({ data: db.byTable[table] ?? [], error: null });
    };
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: db.byTable[table] ?? [], error: null }).then(onFulfilled);
    return q;
  }
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

function eventRow(occurredAt: string, id = "ev-1") {
  return {
    id,
    plant_id: null,
    tent_id: TENT_ID,
    occurred_at: occurredAt,
    event_type: "environment",
    source: "manual",
    is_deleted: false,
    environment_events: { temperature_c: 35, humidity_pct: 20, vpd_kpa: 2.5 },
  };
}

import {
  buildTentManualHistoryRead,
  dropEventsMirroredByDiaryRows,
  manualEnvironmentEventsToChangeContextRows,
  manualEnvironmentEventsToSnapshotRecords,
  parseTentManualEnvironmentEvents,
} from "@/lib/tentManualEnvironmentEventRules";
import ManualSnapshotTimelineSection from "@/components/ManualSnapshotTimelineSection";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";
import { useTentManualEnvironmentEvents } from "@/hooks/useTentManualEnvironmentEvents";
import { fireEvent, waitFor } from "@testing-library/react";
import type { ManualSnapshotTimelineCard as CardModel } from "@/lib/manualSensorSnapshotViewModel";

beforeEach(() => {
  db.byTable = {};
  db.reads = [];
  db.failTables = new Set();
  db.holdTables = new Set();
  db.orders = [];
});
afterEach(() => cleanup());

function withProviders(node: React.ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<>{node}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("tent manual environment events — rules", () => {
  it("parses tent-level and plant-level manual environment events, ignoring deleted and non-manual rows", () => {
    const events = parseTentManualEnvironmentEvents([
      eventRow("2026-10-14T10:00:00.000Z", "a"),
      { ...eventRow("2026-10-14T09:00:00.000Z", "b"), plant_id: "p1" },
      { ...eventRow("2026-10-14T08:00:00.000Z", "c"), is_deleted: true },
      { ...eventRow("2026-10-14T07:00:00.000Z", "d"), source: "live" },
      { ...eventRow("2026-10-14T06:00:00.000Z", "e"), event_type: "observation" },
      null,
    ]);
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(events[0]).toMatchObject({
      tentId: TENT_ID,
      plantId: null,
      temperatureC: 35,
      humidityPct: 20,
      vpdKpa: 2.5,
    });
  });

  it("projects events into tent-tagged change-context rows for the history list", () => {
    const rows = manualEnvironmentEventsToChangeContextRows(
      parseTentManualEnvironmentEvents([eventRow("2026-10-14T10:00:00.000Z")]),
    );
    expect(rows).toEqual([
      {
        ts: "2026-10-14T10:00:00.000Z",
        metric: "temperature_c",
        value: 35,
        source: "manual",
        tent_id: TENT_ID,
        snapshot_id: "ev-1",
      },
      {
        ts: "2026-10-14T10:00:00.000Z",
        metric: "humidity_pct",
        value: 20,
        source: "manual",
        tent_id: TENT_ID,
        snapshot_id: "ev-1",
      },
      {
        ts: "2026-10-14T10:00:00.000Z",
        metric: "vpd_kpa",
        value: 2.5,
        source: "manual",
        tent_id: TENT_ID,
        snapshot_id: "ev-1",
      },
    ]);
  });

  it("projects events into validated snapshot records for the timeline cards", () => {
    const records = manualEnvironmentEventsToSnapshotRecords(
      parseTentManualEnvironmentEvents([eventRow("2026-10-14T10:00:00.000Z")]),
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "ev-1",
      tentId: TENT_ID,
      plantId: null,
      capturedAt: "2026-10-14T10:00:00.000Z",
    });
    const temp = records[0].validation.metrics.find((m) => m.field === "air_temp_c");
    expect(temp?.value).toBe(35);
  });
});

describe("tent manual snapshot timeline section", () => {
  it("renders a card from a tent-level grow_events snapshot when the diary has none", async () => {
    db.byTable = { diary_entries: [], grow_events: [eventRow("2026-10-14T10:00:00.000Z")] };
    withProviders(<ManualSnapshotTimelineSection scope="tent" tentId={TENT_ID} />);
    expect(await screen.findByTestId("manual-snapshot-timeline-card")).toBeInTheDocument();
    expect(screen.queryByText(/No manual sensor snapshots in this tent/)).toBeNull();
    expect(db.reads).toContain("grow_events");
  });
});

describe("manual snapshot timeline card freshness", () => {
  function card(capturedAt: string): CardModel {
    return {
      id: "card-1",
      title: "Manual sensor snapshot",
      capturedAt,
      sourceLabel: "Manual",
      source: "manual",
      tentId: TENT_ID,
      plantId: null,
      isTentLevel: true,
      notes: null,
      readings: [
        { field: "air_temp_c", value: 25, unit: "°C", derived: false },
        { field: "humidity_pct", value: 55, unit: "%", derived: false },
      ],
      severity: "ok",
      warnings: [],
      errors: [],
    };
  }

  it("labels a snapshot saved minutes ago as a current reading", () => {
    const justNow = new Date(Date.now() - 5 * 60_000).toISOString();
    withProviders(<ManualSnapshotTimelineCard card={card(justNow)} />);
    expect(screen.getByText("Usable current reading")).toBeInTheDocument();
    expect(screen.queryByText(/Historical reading —/)).toBeNull();
    // The quality region announces the same freshness as its visible copy.
    expect(screen.getByRole("region", { name: "Current snapshot quality" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Historical snapshot quality" })).toBeNull();
  });

  it("still labels a snapshot older than the current window as historical", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
    withProviders(<ManualSnapshotTimelineCard card={card(threeDaysAgo)} />);
    expect(screen.getByText("Historical review reading")).toBeInTheDocument();
    expect(screen.getByText(/Historical reading —/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Historical snapshot quality" })).toBeInTheDocument();
  });
});

// Codex FAIL on #2114 at 1a3cf7ed (P1-1): the history list took readStatus,
// isFetching and Retry from the sensor_readings query alone, so a pending or
// failed grow_events read still let the list declare "No manual snapshots".
describe("tent manual snapshot history — both sources gate the read state", () => {
  const settled = { status: "success" as const, isFetching: false };
  type Read = { status: "pending" | "error" | "success"; isFetching: boolean };

  it("is success only when both reads succeed, and fetching if either fetches", () => {
    const pending: Read = { status: "pending", isFetching: true };
    const failed: Read = { status: "error", isFetching: false };
    const refreshing: Read = { status: "success", isFetching: true };
    const view = (sensor: Read, manual: Read) =>
      buildTentManualHistoryRead({
        sensor: { ...sensor, data: [], refetch: () => {} },
        manual: { ...manual, data: [], refetch: () => {} },
      });
    expect(view(settled, settled)).toMatchObject({ readStatus: "success", isFetching: false });
    expect(view(settled, pending)).toMatchObject({ readStatus: "pending", isFetching: true });
    expect(view(settled, failed)).toMatchObject({ readStatus: "error" });
    expect(view(failed, settled)).toMatchObject({ readStatus: "error" });
    expect(view(failed, pending)).toMatchObject({ readStatus: "error", isFetching: true });
    expect(view(settled, refreshing)).toMatchObject({ readStatus: "success", isFetching: true });
    // A paused first read is pending with no fetch in flight: still not settled.
    expect(view(settled, { status: "pending", isFetching: false })).toMatchObject({
      readStatus: "pending",
    });
  });

  it("merges manual rows only from data, keeping the sensor rows first", () => {
    const ev = parseTentManualEnvironmentEvents([eventRow("2026-10-14T10:00:00.000Z")] as never);
    const sensorRow = {
      ts: "2026-10-13T10:00:00.000Z",
      metric: "temperature_c",
      value: 24,
      source: "manual",
      tent_id: TENT_ID,
    };
    const read = buildTentManualHistoryRead({
      sensor: { ...settled, data: [sensorRow], refetch: () => {} },
      manual: { ...settled, data: ev, refetch: () => {} },
    });
    expect(read.readings[0]).toEqual(sensorRow);
    expect(read.readings).toHaveLength(1 + manualEnvironmentEventsToChangeContextRows(ev).length);
  });

  it("retries both sources", () => {
    const sensorRefetch = vi.fn();
    const manualRefetch = vi.fn();
    buildTentManualHistoryRead({
      sensor: { status: "error", isFetching: false, data: [], refetch: sensorRefetch },
      manual: { status: "error", isFetching: false, data: [], refetch: manualRefetch },
    }).onRetry();
    expect(sensorRefetch).toHaveBeenCalledTimes(1);
    expect(manualRefetch).toHaveBeenCalledTimes(1);
  });

  function HistoryWithRealManualRead({ sensorRefetch }: { sensorRefetch: () => void }) {
    const manual = useTentManualEnvironmentEvents(TENT_ID);
    const read = buildTentManualHistoryRead({
      sensor: { ...settled, data: [], refetch: sensorRefetch },
      manual,
    });
    return (
      <TentManualSnapshotHistoryList
        tentId={TENT_ID}
        readings={read.readings}
        readStatus={read.readStatus}
        isFetching={read.isFetching}
        onRetry={read.onRetry}
      />
    );
  }

  it("shows loading, not an empty history, while only the events read is pending", async () => {
    db.holdTables.add("grow_events");
    withProviders(<HistoryWithRealManualRead sensorRefetch={() => {}} />);
    expect(await screen.findByTestId("tent-manual-snapshot-history-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-manual-snapshot-history-empty")).toBeNull();
  });

  it("shows the error and recovers both sources on Retry when only the events read failed", async () => {
    db.failTables.add("grow_events");
    const sensorRefetch = vi.fn();
    withProviders(<HistoryWithRealManualRead sensorRefetch={sensorRefetch} />);
    expect(await screen.findByTestId("tent-manual-snapshot-history-error")).toBeInTheDocument();
    expect(screen.queryByTestId("tent-manual-snapshot-history-empty")).toBeNull();

    db.failTables.delete("grow_events");
    db.byTable = { grow_events: [eventRow("2026-10-14T10:00:00.000Z")] };
    fireEvent.click(screen.getByTestId("tent-manual-snapshot-history-retry"));
    expect(sensorRefetch).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByTestId("tent-manual-snapshot-history-error")).toBeNull(),
    );
    expect(screen.queryByTestId("tent-manual-snapshot-history-empty")).toBeNull();
  });
});

import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";
import { fetchTentManualEnvironmentEvents } from "@/hooks/useTentManualEnvironmentEvents";

describe("tent manual environment events — Codex review on #2114", () => {
  it("orders by a unique id after occurred_at before limiting", async () => {
    await fetchTentManualEnvironmentEvents(TENT_ID);
    const cols = db.orders.filter((o) => o.table === "grow_events").map((o) => o.column);
    expect(cols).toEqual(["occurred_at", "id"]);
  });

  it("refetches after the frozen Quick Log post-save refresh runs for this tent", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Probe() {
      const q = useTentManualEnvironmentEvents(TENT_ID);
      return <p data-testid="probe-count">{q.data?.length ?? -1}</p>;
    }
    render(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("probe-count").textContent).toBe("0"));
    const readsBefore = db.reads.filter((t) => t === "grow_events").length;

    db.byTable = { grow_events: [eventRow("2026-10-14T10:00:00.000Z")] };
    applyQuickLogV2Refresh(qc, { targetType: "tent", targetId: TENT_ID, tentId: TENT_ID });

    await waitFor(() => expect(screen.getByTestId("probe-count").textContent).toBe("1"));
    expect(db.reads.filter((t) => t === "grow_events").length).toBe(readsBefore + 1);
  });
});

import { useManualSnapshotTimelineCards } from "@/hooks/useManualSnapshotTimelineCards";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";

function plantQuickLogCompanion(entryAt: string, linkedGrowEventId: string, id = "diary-1") {
  return {
    id,
    plant_id: "plant-1",
    tent_id: TENT_ID,
    entry_at: entryAt,
    note: "Plant Quick Log",
    details: {
      linked_grow_event_id: linkedGrowEventId,
      manual_sensor_snapshot: { source: "manual", temp_f: 95, humidity_percent: 20 },
    },
  };
}

describe("tent manual snapshots — Codex re-review on #2114", () => {
  function CardsProbe({ limit }: { limit?: number }) {
    const r = useManualSnapshotTimelineCards({ kind: "tent", tentId: TENT_ID }, limit);
    return (
      <p data-testid="cards-probe" data-status={r.readStatus}>
        {r.cards.map((c) => c.id).join(",")}
      </p>
    );
  }

  async function cardIds(): Promise<string[]> {
    await waitFor(() =>
      expect(screen.getByTestId("cards-probe").getAttribute("data-status")).toBe("success"),
    );
    const text = screen.getByTestId("cards-probe").textContent ?? "";
    return text === "" ? [] : text.split(",");
  }

  // quicklog_save_manual (20260927160000_quicklog_manual_plant_tent_lineage)
  // writes a parent action event, a sibling environment event with its OWN
  // id, and a diary mirror whose linked_grow_event_id is the PARENT id. All
  // three share tent_id, plant_id and occurred_at / entry_at.
  it("renders one card for a Plant Quick Log save whose mirror links the parent, not the environment sibling", async () => {
    const at = "2026-10-14T10:00:00.000Z";
    db.byTable = {
      diary_entries: [plantQuickLogCompanion(at, "parent-1")],
      grow_events: [{ ...eventRow(at, "env-1"), plant_id: "plant-1" }],
    };
    withProviders(<CardsProbe />);
    expect(await cardIds()).toEqual(["diary-1"]);
  });

  it("keeps an environment event at the same instant for a different plant", async () => {
    const at = "2026-10-14T10:00:00.000Z";
    db.byTable = {
      diary_entries: [plantQuickLogCompanion(at, "parent-1")],
      grow_events: [{ ...eventRow(at, "env-2"), plant_id: "plant-2" }],
    };
    withProviders(<CardsProbe />);
    expect(await cardIds()).toEqual(["diary-1", "env-2"]);
  });

  it("keeps an environment event when the same-instant diary row is not a Quick Log mirror", async () => {
    const at = "2026-10-14T10:00:00.000Z";
    const unlinked = plantQuickLogCompanion(at, "parent-1");
    delete (unlinked.details as Record<string, unknown>).linked_grow_event_id;
    db.byTable = {
      diary_entries: [unlinked],
      grow_events: [{ ...eventRow(at, "env-3"), plant_id: "plant-1" }],
    };
    withProviders(<CardsProbe />);
    expect(await cardIds()).toEqual(["diary-1", "env-3"]);
  });

  it("keeps an environment event that no fetched diary row mirrors", async () => {
    db.byTable = {
      diary_entries: [plantQuickLogCompanion("2026-10-14T10:00:00.000Z", "ev-1")],
      grow_events: [eventRow("2026-10-14T11:00:00.000Z", "ev-2")],
    };
    withProviders(<CardsProbe />);
    expect(await cardIds()).toEqual(["ev-2", "diary-1"]);
  });

  it("re-applies the limit to the merged timeline", async () => {
    db.byTable = {
      diary_entries: [
        plantQuickLogCompanion("2026-10-14T09:00:00.000Z", "other-a", "diary-a"),
        plantQuickLogCompanion("2026-10-14T07:00:00.000Z", "other-b", "diary-b"),
      ],
      grow_events: [
        eventRow("2026-10-14T10:00:00.000Z", "ev-a"),
        eventRow("2026-10-14T08:00:00.000Z", "ev-b"),
      ],
    };
    withProviders(<CardsProbe limit={2} />);
    expect(await cardIds()).toEqual(["ev-a", "diary-a"]);
  });

  it("keeps two same-instant saves as two history snapshots with their own values", () => {
    const at = "2026-10-14T10:00:00.000Z";
    const events = parseTentManualEnvironmentEvents([
      { ...eventRow(at, "ev-a"), environment_events: { temperature_c: 24, humidity_pct: 50 } },
      { ...eventRow(at, "ev-b"), environment_events: { temperature_c: 26, humidity_pct: 60 } },
    ]);
    const rows = manualEnvironmentEventsToChangeContextRows(events);
    const list = buildManualSnapshotHistoryList(rows, {
      tentId: TENT_ID,
      temperatureUnit: "celsius",
    });
    expect(list).toHaveLength(2);
    expect(new Set(list.map((e) => e.key)).size).toBe(2);
    const temps = list.map((e) => e.metrics.find((m) => m.key === "temperature_c")?.formatted);
    expect(temps).toEqual(expect.arrayContaining(["24.0°C", "26.0°C"]));

    render(
      <TentManualSnapshotHistoryList
        tentId={TENT_ID}
        readings={rows}
        readStatus="success"
        onRetry={() => {}}
      />,
    );
    expect(screen.getAllByTestId("tent-manual-snapshot-history-item")).toHaveLength(2);
  });
});

describe("tent manual snapshots — Codex re-review on #2114 (same-instant saves)", () => {
  function CardsProbe2() {
    const r = useManualSnapshotTimelineCards({ kind: "tent", tentId: TENT_ID });
    return (
      <p data-testid="cards-probe-2" data-status={r.readStatus}>
        {r.cards.map((c) => c.id).join(",")}
      </p>
    );
  }
  async function ids(): Promise<string[]> {
    await waitFor(() =>
      expect(screen.getByTestId("cards-probe-2").getAttribute("data-status")).toBe("success"),
    );
    const text = screen.getByTestId("cards-probe-2").textContent ?? "";
    return text === "" ? [] : text.split(",");
  }
  const at = "2026-10-14T10:00:00.000Z";

  it("drops only the mirror's own sibling and keeps another manual save at the same instant", async () => {
    db.byTable = {
      // Mirror records 95°F / 20% (the sibling env-1 stores 35°C / 20%).
      diary_entries: [plantQuickLogCompanion(at, "parent-1")],
      grow_events: [
        { ...eventRow(at, "env-1"), plant_id: "plant-1" },
        {
          ...eventRow(at, "env-2"),
          plant_id: "plant-1",
          environment_events: { temperature_c: 24, humidity_pct: 60, vpd_kpa: 1.2 },
        },
      ],
    };
    withProviders(<CardsProbe2 />);
    expect(await ids()).toEqual(["diary-1", "env-2"]);
  });

  it("drops nothing when no same-instant event carries the mirror's readings", async () => {
    db.byTable = {
      diary_entries: [plantQuickLogCompanion(at, "parent-1")],
      grow_events: [
        {
          ...eventRow(at, "env-3"),
          plant_id: "plant-1",
          environment_events: { temperature_c: 24, humidity_pct: 60, vpd_kpa: 1.2 },
        },
      ],
    };
    withProviders(<CardsProbe2 />);
    expect(await ids()).toEqual(["diary-1", "env-3"]);
  });

  it("two identical saves at one instant, each with its mirror, collapse one each", () => {
    const events = parseTentManualEnvironmentEvents([
      { ...eventRow(at, "env-a"), plant_id: "plant-1" },
      { ...eventRow(at, "env-b"), plant_id: "plant-1" },
    ]);
    const kept = dropEventsMirroredByDiaryRows(events, [
      plantQuickLogCompanion(at, "parent-a", "diary-a"),
    ]);
    expect(kept.map((e) => e.id)).toEqual(["env-b"]);
    expect(
      dropEventsMirroredByDiaryRows(events, [
        plantQuickLogCompanion(at, "parent-a", "diary-a"),
        plantQuickLogCompanion(at, "parent-b", "diary-b"),
      ]),
    ).toEqual([]);
  });

  it("does not claim a partially overlapping event that lacks a metric the mirror recorded", () => {
    // Mirror records 95°F AND 20% RH. env-a (lower id) is a separate
    // temperature-only 35°C save; env-b is the mirror's real sibling.
    const events = parseTentManualEnvironmentEvents([
      {
        ...eventRow(at, "env-a"),
        plant_id: "plant-1",
        environment_events: { temperature_c: 35, humidity_pct: null, vpd_kpa: null },
      },
      { ...eventRow(at, "env-b"), plant_id: "plant-1" },
    ]);
    const kept = dropEventsMirroredByDiaryRows(events, [plantQuickLogCompanion(at, "parent-1")]);
    expect(kept.map((e) => e.id)).toEqual(["env-a"]);
  });

  it("does not claim an event carrying a metric the mirror did not record", () => {
    const tempOnlyMirror = {
      ...plantQuickLogCompanion(at, "parent-1"),
      details: {
        linked_grow_event_id: "parent-1",
        manual_sensor_snapshot: { source: "manual", temp_f: 95, humidity_percent: null },
      },
    };
    const events = parseTentManualEnvironmentEvents([
      { ...eventRow(at, "env-a"), plant_id: "plant-1" },
      {
        ...eventRow(at, "env-b"),
        plant_id: "plant-1",
        environment_events: { temperature_c: 35, humidity_pct: null, vpd_kpa: null },
      },
    ]);
    const kept = dropEventsMirroredByDiaryRows(events, [tempOnlyMirror]);
    expect(kept.map((e) => e.id)).toEqual(["env-a"]);
  });
});
