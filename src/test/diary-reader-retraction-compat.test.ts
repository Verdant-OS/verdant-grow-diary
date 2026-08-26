/**
 * Production diary readers must degrade when diary_entries.retracted_at is
 * missing (Postgres 42703 / migration 20260811090000 not applied).
 *
 * #1013 covers Free readers (Daily Grow Check, dashboard, activation,
 * plant/tent activity). This branch also covers premium report fetchers
 * that hit the same missing-column failure on the founder walk.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const MISSING_COLUMN = {
  code: "42703",
  message: "column diary_entries.retracted_at does not exist",
};

const OTHER_ERROR = { code: "PGRST301", message: "JWT expired" };

type QueryResult = { data: unknown; error: { code: string; message: string } | null };

const harness = vi.hoisted(() => ({
  results: [] as QueryResult[],
  calls: [] as Array<{
    filtered: boolean;
    growId?: string;
    plantId?: string;
    tentId?: string;
    snapshotExists: boolean;
    manualSnapshotSource: boolean;
    orders: Array<{ column: string; ascending?: boolean }>;
  }>,
}));

function builder() {
  const state = {
    filtered: false,
    growId: undefined as string | undefined,
    plantId: undefined as string | undefined,
    tentId: undefined as string | undefined,
    snapshotExists: false,
    manualSnapshotSource: false,
    orders: [] as Array<{ column: string; ascending?: boolean }>,
  };
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: (column: string, value: unknown) => {
      if (column === "grow_id" && typeof value === "string") state.growId = value;
      if (column === "plant_id" && typeof value === "string") state.plantId = value;
      if (column === "tent_id" && typeof value === "string") state.tentId = value;
      if (column === "details->manual_sensor_snapshot->>source" && value === "manual") {
        state.manualSnapshotSource = true;
      }
      return chain;
    },
    not: (column: string, operator: string, value: unknown) => {
      if (column === "details->manual_sensor_snapshot" && operator === "is" && value === null) {
        state.snapshotExists = true;
      }
      return chain;
    },
    is: (column: string) => {
      if (column === "retracted_at") state.filtered = true;
      return chain;
    },
    gte: () => chain,
    lte: () => chain,
    order: (column: string, options?: { ascending?: boolean }) => {
      state.orders.push({ column, ascending: options?.ascending });
      return chain;
    },
    limit: () => chain,
    range: () => chain,
    then: (resolve: (value: QueryResult) => unknown) => {
      harness.calls.push({
        filtered: state.filtered,
        growId: state.growId,
        plantId: state.plantId,
        tentId: state.tentId,
        snapshotExists: state.snapshotExists,
        manualSnapshotSource: state.manualSnapshotSource,
        orders: state.orders,
      });
      return Promise.resolve(harness.results.shift() ?? { data: [], error: null }).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => builder() },
}));

import {
  fetchPlantManualSnapshotRows,
  fetchTentManualSnapshotBatchPage,
  fetchTentManualSnapshotRows,
} from "@/hooks/useManualSnapshotTimelineCards";
import { fetchPlantManualSensorDiaryRows } from "@/hooks/usePlantManualSensorHistory";
import { fetchDiaryEntries } from "@/hooks/use-diary-entries";
import { fetchDashboardDiaryRows } from "@/hooks/useDashboardScopedData";
import { fetchConnectedActivationDiaryRows } from "@/hooks/useOneTentActivationEvidence";
import { fetchPlantLogDays } from "@/hooks/usePlantLogDays";
import { fetchPlantRecentActivityRows } from "@/hooks/usePlantRecentActivity";
import { fetchTentPlantRosterActivityRows } from "@/hooks/useTentPlantRosterActivity";
import { fetchDiaryRangeReportDiaryRows } from "@/hooks/useDiaryRangeReportData";
import { fetchPostGrowLearningDiaryRows } from "@/hooks/usePostGrowLearningReportData";
import {
  fetchReportsHubActivityDiaryRows,
  fetchReportsHubDiaryLast7d,
  fetchReportsHubDiaryTotal,
} from "@/hooks/useReportsHubData";

beforeEach(() => {
  harness.results = [];
  harness.calls = [];
});

describe("manual diary readers retraction compatibility", () => {
  it("retries plant snapshots once without the missing column filter", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "legacy", plant_id: "plant-1" }], error: null },
    ];

    await expect(fetchPlantManualSnapshotRows("plant-1", 50)).resolves.toEqual([
      { id: "legacy", plant_id: "plant-1" },
    ]);
    expect(harness.calls).toEqual([
      {
        filtered: true,
        growId: undefined,
        plantId: "plant-1",
        tentId: undefined,
        snapshotExists: true,
        manualSnapshotSource: true,
        orders: [
          { column: "entry_at", ascending: false },
          { column: "id", ascending: true },
        ],
      },
      {
        filtered: false,
        growId: undefined,
        plantId: "plant-1",
        tentId: undefined,
        snapshotExists: true,
        manualSnapshotSource: true,
        orders: [
          { column: "entry_at", ascending: false },
          { column: "id", ascending: true },
        ],
      },
    ]);
  });

  it("retries tent snapshots once without the missing column filter", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "legacy", tent_id: "tent-1" }], error: null },
    ];

    await expect(fetchTentManualSnapshotRows("tent-1", 50)).resolves.toEqual([
      { id: "legacy", tent_id: "tent-1" },
    ]);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true, false]);
    expect(
      harness.calls.every(
        (call) => call.snapshotExists && call.manualSnapshotSource && call.orders.length === 2,
      ),
    ).toBe(true);
  });

  it("preserves JSON predicates when a batch page retries without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      {
        data: [{ id: "legacy", tent_id: "00000000-0000-4000-8000-000000000001" }],
        error: null,
      },
    ];

    await expect(
      fetchTentManualSnapshotBatchPage({
        chunkIndex: 0,
        pageIndex: 0,
        tentIds: ["00000000-0000-4000-8000-000000000001"],
        from: 0,
        to: 199,
        upperBoundEntryAt: null,
        expectedBoundaryRowId: null,
      }),
    ).resolves.toEqual([{ id: "legacy", tent_id: "00000000-0000-4000-8000-000000000001" }]);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true, false]);
    expect(
      harness.calls.every(
        (call) => call.snapshotExists && call.manualSnapshotSource && call.orders.length === 2,
      ),
    ).toBe(true);
  });

  it("keeps manual sensor history available before the migration", async () => {
    const row = { id: "legacy", entry_at: "2026-08-15T00:00:00.000Z", details: {} };
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [row], error: null },
    ];

    await expect(fetchPlantManualSensorDiaryRows("plant-1")).resolves.toEqual([row]);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true, false]);
  });

  it("does not hide unrelated provider errors", async () => {
    harness.results = [{ data: null, error: OTHER_ERROR }];

    await expect(fetchPlantManualSensorDiaryRows("plant-1")).rejects.toMatchObject(OTHER_ERROR);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true]);
  });
});

describe("core Free diary readers retraction compatibility", () => {
  it.each([
    ["account diary", () => fetchDiaryEntries(), undefined, [{ id: "legacy" }]],
    ["dashboard", () => fetchDashboardDiaryRows("grow-1"), "grow-1", [{ id: "legacy" }]],
    [
      "activation evidence",
      () => fetchConnectedActivationDiaryRows("grow-1"),
      "grow-1",
      [{ id: "legacy" }],
    ],
    [
      "plant recent activity",
      () => fetchPlantRecentActivityRows("plant-1"),
      undefined,
      [{ id: "legacy" }],
    ],
    [
      "tent roster activity",
      () => fetchTentPlantRosterActivityRows("plant-1"),
      undefined,
      [{ id: "legacy" }],
    ],
  ] as const)("keeps %s available before the migration", async (_name, load, growId, expected) => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: expected, error: null },
    ];

    await expect(load()).resolves.toEqual(expected);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true, false]);
    if (growId) expect(harness.calls.every((call) => call.growId === growId)).toBe(true);
  });

  it("keeps plant log days available before the migration", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ entry_at: "2026-08-15T00:00:00.000Z" }], error: null },
    ];

    await expect(fetchPlantLogDays("plant-1")).resolves.toEqual(["2026-08-15T00:00:00.000Z"]);
    expect(harness.calls.map((call) => call.filtered)).toEqual([true, false]);
  });
});

describe("premium report diary readers retraction compatibility", () => {
  it("retries date-range diary report rows without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "range-1", grow_id: "g1" }], error: null },
    ];
    const result = await fetchDiaryRangeReportDiaryRows(
      "g1",
      "2026-08-10T00:00:00.000Z",
      "2026-08-16T23:59:59.999Z",
    );
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "range-1", grow_id: "g1" }]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
    expect(harness.calls[0]?.growId).toBe("g1");
  });

  it("retries post-grow learning diary rows without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "pg-1", grow_id: "g1" }], error: null },
    ];
    const result = await fetchPostGrowLearningDiaryRows("g1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "pg-1", grow_id: "g1" }]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
  });

  it("retries reports-hub diary counts and activity rows without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: [], error: null },
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "hub-1", grow_id: "g1" }], error: null },
    ];
    const total = await fetchReportsHubDiaryTotal("g1");
    const last7d = await fetchReportsHubDiaryLast7d("g1", "2026-08-09T00:00:00.000Z");
    const activity = await fetchReportsHubActivityDiaryRows("g1");
    expect(total.error).toBeNull();
    expect(last7d.error).toBeNull();
    expect(activity.error).toBeNull();
    expect(activity.data).toEqual([{ id: "hub-1", grow_id: "g1" }]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false, true, false, true, false]);
  });

  it("does not mask a non-column failure on the date-range report reader", async () => {
    harness.results = [{ data: null, error: OTHER_ERROR }];
    const result = await fetchDiaryRangeReportDiaryRows(
      "g1",
      "2026-08-10T00:00:00.000Z",
      "2026-08-16T23:59:59.999Z",
    );
    expect(result.error).toMatchObject(OTHER_ERROR);
    expect(harness.calls).toHaveLength(1);
  });
});
