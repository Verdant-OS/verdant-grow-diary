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
}));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "not", "is", "in", "order", "neq", "gte", "lte"]) {
      q[m] = () => q;
    }
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
      },
      {
        ts: "2026-10-14T10:00:00.000Z",
        metric: "humidity_pct",
        value: 20,
        source: "manual",
        tent_id: TENT_ID,
      },
      {
        ts: "2026-10-14T10:00:00.000Z",
        metric: "vpd_kpa",
        value: 2.5,
        source: "manual",
        tent_id: TENT_ID,
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
  });

  it("still labels a snapshot older than the current window as historical", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
    withProviders(<ManualSnapshotTimelineCard card={card(threeDaysAgo)} />);
    expect(screen.getByText("Historical review reading")).toBeInTheDocument();
    expect(screen.getByText(/Historical reading —/)).toBeInTheDocument();
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
