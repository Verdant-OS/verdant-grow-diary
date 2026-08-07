import { describe, expect, it } from "vitest";

import { listGrowWalkTargetsForOwnedGrow } from "@/lib/growWalkTargetReadModels";

interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

type FixtureResult = { data: unknown; error: { message: string } | null };

function clientFor(fixtures: Record<string, FixtureResult>) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return chain;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          return chain;
        },
        neq(...args: unknown[]) {
          calls.push({ table, method: "neq", args });
          return chain;
        },
        gte(...args: unknown[]) {
          calls.push({ table, method: "gte", args });
          return chain;
        },
        in(...args: unknown[]) {
          calls.push({ table, method: "in", args });
          return chain;
        },
        or(...args: unknown[]) {
          calls.push({ table, method: "or", args });
          return chain;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return chain;
        },
        limit(...args: unknown[]) {
          calls.push({ table, method: "limit", args });
          return chain;
        },
        maybeSingle() {
          calls.push({ table, method: "maybeSingle", args: [] });
          const fixture = fixtures[table] ?? { data: null, error: null };
          const data = Array.isArray(fixture.data) ? fixture.data[0] ?? null : fixture.data;
          return Promise.resolve({ data, error: fixture.error });
        },
        then<TResult1 = FixtureResult, TResult2 = never>(
          onfulfilled?: ((value: FixtureResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const fixture = fixtures[table] ?? { data: [], error: null };
          return Promise.resolve(fixture).then(onfulfilled, onrejected);
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

const SENSOR_ROWS = [
  {
    id: "reading-1",
    tent_id: "tent-1",
    metric: "humidity_pct",
    value: 78,
    quality: "ok",
    source: "live",
    ts: "2026-08-07T11:45:00.000Z",
    captured_at: "2026-08-07T11:45:00.000Z",
    created_at: "2026-08-07T11:45:01.000Z",
    raw_payload: null,
  },
];

function successFixtures(): Record<string, FixtureResult> {
  return {
    grows: { data: { id: "grow-1", name: "Home Grow" }, error: null },
    tents: {
      data: [
        {
          id: "tent-1",
          name: "Flower Tent",
          grow_id: "grow-1",
          stage: "flower",
          is_archived: false,
        },
        {
          id: "tent-empty",
          name: "Empty Tent",
          grow_id: "grow-1",
          stage: "veg",
          is_archived: false,
        },
      ],
      error: null,
    },
    plants: {
      data: [
        {
          id: "plant-1",
          name: "Sour Diesel Auto",
          strain: "Sour Diesel",
          tent_id: "tent-1",
          grow_id: null,
          stage: "flower",
          health: "watch",
          is_archived: false,
          medium: "coco",
          pot_size: "5 gal",
          plant_type: "autoflower",
          started_at: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "archived-plant",
          name: "Archived Plant",
          strain: null,
          tent_id: "tent-1",
          grow_id: "grow-1",
          stage: "flower",
          health: "healthy",
          is_archived: true,
          medium: null,
          pot_size: null,
          plant_type: null,
          started_at: null,
        },
      ],
      error: null,
    },
    grow_events: {
      data: [
        {
          id: "feed-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "feeding",
          source: "manual",
          occurred_at: "2026-08-07T09:00:00.000Z",
          note: "Changed feed strength.",
          created_at: "2026-08-07T09:00:01.000Z",
          is_deleted: false,
        },
        {
          id: "photo-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "photo",
          source: "manual",
          occurred_at: "2026-08-07T08:00:00.000Z",
          note: null,
          created_at: "2026-08-07T08:00:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    },
    alerts: {
      data: [
        {
          id: "alert-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          title: "High humidity",
          reason: "Humidity needs physical confirmation.",
          severity: "high",
          status: "open",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-08-07T11:50:00.000Z",
        },
      ],
      error: null,
    },
    sensor_readings: { data: SENSOR_ROWS, error: null },
  };
}

describe("listGrowWalkTargetsForOwnedGrow", () => {
  it("proves grow ownership before reading any child table", async () => {
    const { client, calls } = clientFor({
      grows: { data: null, error: null },
      tents: { data: [{ id: "foreign" }], error: null },
    });

    await expect(listGrowWalkTargetsForOwnedGrow(client, "foreign-grow")).resolves.toEqual({
      ok: false,
      reason: "not_found",
      message: "Grow not found for the signed-in grower.",
    });
    expect(calls.some((call) => call.table !== "grows")).toBe(false);
  });

  it("returns owned tent and plant targets, including an empty tent and a legacy tent-attributed plant", async () => {
    const { client, calls } = clientFor(successFixtures());
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.grow).toEqual({ id: "grow-1", name: "Home Grow" });
    expect(result.data.generatedAt).toBe("2026-08-07T12:00:00.000Z");
    expect(result.data.targets.map((row) => row.targetId)).toContain("tent-empty");
    expect(result.data.targets.map((row) => row.targetId)).toContain("plant-1");
    expect(result.data.targets.map((row) => row.targetId)).not.toContain("archived-plant");

    const legacyPlant = result.data.targets.find((row) => row.targetId === "plant-1");
    expect(legacyPlant?.growId).toBe("grow-1");
    expect(legacyPlant?.missingEvidenceCodes).toContain("plant_profile_incomplete");
    expect(legacyPlant?.highestAlertSeverity).toBe("high");
    expect(legacyPlant?.lastPhotoEventAt).toBe("2026-08-07T08:00:00.000Z");

    expect(calls).toContainEqual({
      table: "plants",
      method: "or",
      args: ["grow_id.eq.grow-1,tent_id.in.(tent-1,tent-empty)"],
    });
  });

  it("keeps output presenter-safe even when the sensor query needs internal provenance", async () => {
    const { client } = clientFor(successFixtures());
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /raw_payload|access_token|refresh_token|authorization|signed_url|storage_path|target_device/i,
    );
  });

  it.each([
    { requested: undefined, expected: 50 },
    { requested: Number.NaN, expected: 50 },
    { requested: 0, expected: 1 },
    { requested: 4.9, expected: 4 },
    { requested: 500, expected: 100 },
  ])("clamps target limit $requested to $expected", async ({ requested, expected }) => {
    const fixtures = successFixtures();
    fixtures.tents = {
      data: Array.from({ length: 110 }, (_, index) => ({
        id: `tent-${String(index).padStart(3, "0")}`,
        name: `Tent ${index}`,
        grow_id: "grow-1",
        stage: "veg",
        is_archived: false,
      })),
      error: null,
    };
    fixtures.plants = { data: [], error: null };
    fixtures.grow_events = { data: [], error: null };
    fixtures.alerts = { data: [], error: null };
    fixtures.sensor_readings = { data: [], error: null };
    const { client } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      limit: requested,
      now: new Date("2026-08-07T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.targets).toHaveLength(expected);
  });

  it("includes archived plants only when explicitly requested", async () => {
    const { client } = clientFor(successFixtures());
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      includeInactivePlants: true,
      now: new Date("2026-08-07T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.targets.map((row) => row.targetId)).toContain("archived-plant");
    }
  });

  it("reports child-lane failures as unavailable instead of returning a false all-clear list", async () => {
    const fixtures = successFixtures();
    fixtures.alerts = { data: null, error: { message: "alerts unavailable" } };
    const { client } = clientFor(fixtures);

    await expect(listGrowWalkTargetsForOwnedGrow(client, "grow-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      message: "Grow Walk target evidence unavailable.",
    });
  });

  it("uses the same not-found response for a foreign or nonexistent grow", async () => {
    for (const growId of ["foreign-grow", "missing-grow"]) {
      const { client } = clientFor({ grows: { data: null, error: null } });
      await expect(listGrowWalkTargetsForOwnedGrow(client, growId)).resolves.toEqual({
        ok: false,
        reason: "not_found",
        message: "Grow not found for the signed-in grower.",
      });
    }
  });
});
