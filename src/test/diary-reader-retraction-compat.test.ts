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
  }>,
}));

function builder() {
  const state = {
    filtered: false,
    growId: undefined as string | undefined,
    plantId: undefined as string | undefined,
    tentId: undefined as string | undefined,
  };
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      if (column === "grow_id" && typeof value === "string") state.growId = value;
      if (column === "plant_id" && typeof value === "string") state.plantId = value;
      if (column === "tent_id" && typeof value === "string") state.tentId = value;
      return chain;
    },
    is: (column: string) => {
      if (column === "retracted_at") state.filtered = true;
      return chain;
    },
    order: () => chain,
    limit: () => chain,
    then: (resolve: (value: QueryResult) => unknown) => {
      harness.calls.push({
        filtered: state.filtered,
        growId: state.growId,
        plantId: state.plantId,
        tentId: state.tentId,
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
  fetchTentManualSnapshotRows,
} from "@/hooks/useManualSnapshotTimelineCards";
import { fetchPlantManualSensorDiaryRows } from "@/hooks/usePlantManualSensorHistory";
import { fetchDiaryEntries } from "@/hooks/use-diary-entries";
import { fetchDashboardDiaryRows } from "@/hooks/useDashboardScopedData";
import { fetchConnectedActivationDiaryRows } from "@/hooks/useOneTentActivationEvidence";
import { fetchPlantLogDays } from "@/hooks/usePlantLogDays";
import { fetchPlantRecentActivityRows } from "@/hooks/usePlantRecentActivity";
import { fetchTentPlantRosterActivityRows } from "@/hooks/useTentPlantRosterActivity";

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
      { filtered: true, growId: undefined, plantId: "plant-1", tentId: undefined },
      { filtered: false, growId: undefined, plantId: "plant-1", tentId: undefined },
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
