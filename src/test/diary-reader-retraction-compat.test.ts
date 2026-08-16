/**
 * Production diary readers must degrade when diary_entries.retracted_at is
 * missing (Postgres 42703 / migration 20260811090000 not applied).
 *
 * Live founder-dashboard evidence 2026-08-15: Daily Grow Check and Today's
 * Grow Checks went Unavailable because useDiaryEntries filtered the missing
 * column. Founder walk 2026-08-16: the paid date-range diary report showed
 * "Unable to load diary report data" for the same 42703. Timeline already
 * used selectWithRetractionCompat; these readers now share that contract.
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
  calls: [] as Array<{ filtered: boolean; plantId?: string; tentId?: string; growId?: string }>,
}));

function builder() {
  const state = {
    filtered: false,
    plantId: undefined as string | undefined,
    tentId: undefined as string | undefined,
    growId: undefined as string | undefined,
  };
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      if (col === "plant_id" && typeof val === "string") state.plantId = val;
      if (col === "tent_id" && typeof val === "string") state.tentId = val;
      if (col === "grow_id" && typeof val === "string") state.growId = val;
      return chain;
    },
    is: (col: string) => {
      if (col === "retracted_at") state.filtered = true;
      return chain;
    },
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (value: QueryResult) => unknown) => {
      harness.calls.push({
        filtered: state.filtered,
        plantId: state.plantId,
        tentId: state.tentId,
        growId: state.growId,
      });
      const next = harness.results.shift() ?? { data: [], error: null };
      return Promise.resolve(next).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => builder(),
  },
}));

import { fetchDiaryEntries } from "@/hooks/use-diary-entries";
import {
  fetchPlantManualSnapshotRows,
  fetchTentManualSnapshotRows,
} from "@/hooks/useManualSnapshotTimelineCards";
import { fetchPlantManualSensorDiaryRows } from "@/hooks/usePlantManualSensorHistory";
import { fetchConnectedActivationDiaryRows } from "@/hooks/useOneTentActivationEvidence";
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

describe("fetchDiaryEntries retraction compat", () => {
  it("returns filtered rows when retracted_at exists", async () => {
    harness.results = [{ data: [{ id: "d1" }], error: null }];
    await expect(fetchDiaryEntries()).resolves.toEqual([{ id: "d1" }]);
    expect(harness.calls).toEqual([{ filtered: true }]);
  });

  it("retries once without the filter on the missing-column error", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "legacy" }], error: null },
    ];
    await expect(fetchDiaryEntries()).resolves.toEqual([{ id: "legacy" }]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
  });

  it("does not mask a non-column failure", async () => {
    harness.results = [{ data: null, error: OTHER_ERROR }];
    await expect(fetchDiaryEntries()).rejects.toMatchObject(OTHER_ERROR);
    expect(harness.calls).toHaveLength(1);
  });
});

describe("manual snapshot / sensor diary readers retraction compat", () => {
  it("retries plant snapshot rows without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "snap-1", plant_id: "p1" }], error: null },
    ];
    await expect(fetchPlantManualSnapshotRows("p1", 50)).resolves.toEqual([
      { id: "snap-1", plant_id: "p1" },
    ]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
    expect(harness.calls[0]?.plantId).toBe("p1");
  });

  it("retries tent snapshot rows without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "snap-t", tent_id: "t1" }], error: null },
    ];
    await expect(fetchTentManualSnapshotRows("t1", 50)).resolves.toEqual([
      { id: "snap-t", tent_id: "t1" },
    ]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
  });

  it("retries first-run activation diary evidence without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "act-1", grow_id: "g1" }], error: null },
    ];
    const result = await fetchConnectedActivationDiaryRows("g1");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "act-1", grow_id: "g1" }]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
    expect(harness.calls[0]?.growId).toBe("g1");
  });

  it("retries plant manual-sensor history without retracted_at", async () => {
    harness.results = [
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: "hist-1", entry_at: "2026-08-15T00:00:00.000Z", details: {} }], error: null },
    ];
    await expect(fetchPlantManualSensorDiaryRows("p1")).resolves.toEqual([
      { id: "hist-1", entry_at: "2026-08-15T00:00:00.000Z", details: {} },
    ]);
    expect(harness.calls.map((c) => c.filtered)).toEqual([true, false]);
  });
});

describe("premium report diary readers retraction compat", () => {
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
