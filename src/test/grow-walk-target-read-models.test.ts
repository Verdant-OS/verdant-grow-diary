import { describe, expect, it } from "vitest";

import { listGrowWalkTargetsForOwnedGrow } from "@/lib/growWalkTargetReadModels";

interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

type FixtureResult = { data: unknown; error: { message: string; code?: string } | null };

function clientFor(
  fixtures: Record<string, FixtureResult>,
  options: { missingDiaryRetractionColumn?: boolean } = {},
) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      let filtersRetractedAt = false;
      const tentEquals = new Map<string, unknown>();
      const tentInFilters = new Map<string, readonly unknown[]>();
      let alertLastSeenAtCutoff: string | null = null;
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return chain;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          if (table === "tents" && typeof args[0] === "string") {
            tentEquals.set(args[0], args[1]);
          }
          return chain;
        },
        neq(...args: unknown[]) {
          calls.push({ table, method: "neq", args });
          return chain;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          if (table === "diary_entries" && args[0] === "retracted_at") {
            filtersRetractedAt = true;
          }
          return chain;
        },
        not(...args: unknown[]) {
          calls.push({ table, method: "not", args });
          return chain;
        },
        gte(...args: unknown[]) {
          calls.push({ table, method: "gte", args });
          if (table === "alerts" && args[0] === "last_seen_at") {
            alertLastSeenAtCutoff = String(args[1]);
          }
          return chain;
        },
        in(...args: unknown[]) {
          calls.push({ table, method: "in", args });
          if (table === "tents" && typeof args[0] === "string" && Array.isArray(args[1])) {
            tentInFilters.set(args[0], args[1]);
          }
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
          const data = Array.isArray(fixture.data) ? (fixture.data[0] ?? null) : fixture.data;
          return Promise.resolve({ data, error: fixture.error });
        },
        then<TResult1 = FixtureResult, TResult2 = never>(
          onfulfilled?: ((value: FixtureResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          const fixture =
            table === "diary_entries" && options.missingDiaryRetractionColumn && filtersRetractedAt
              ? {
                  data: null,
                  error: {
                    code: "42703",
                    message: "column diary_entries.retracted_at does not exist",
                  },
                }
              : (fixtures[table] ?? { data: [], error: null });
          let data = fixture.data;
          if (table === "tents" && Array.isArray(data)) {
            data = data.filter((row) => {
              if (typeof row !== "object" || row === null || Array.isArray(row)) return false;
              const values = row as Record<string, unknown>;
              for (const [column, value] of tentEquals) {
                if (values[column] !== value) return false;
              }
              for (const [column, valuesForColumn] of tentInFilters) {
                if (!valuesForColumn.includes(values[column])) return false;
              }
              return true;
            });
          }
          const alertCutoff = alertLastSeenAtCutoff;
          if (table === "alerts" && Array.isArray(data) && alertCutoff) {
            data = data.filter((row) => {
              const lastSeenAt = (row as { last_seen_at?: unknown }).last_seen_at;
              return typeof lastSeenAt !== "string" || lastSeenAt >= alertCutoff;
            });
          }
          return Promise.resolve({ data, error: fixture.error }).then(onfulfilled, onrejected);
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
    grows: { data: { id: "grow-1", name: "Home Grow", is_archived: false }, error: null },
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
    diary_entries: {
      data: [
        {
          id: "photo-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-08-07T08:00:00.000Z",
          photo_url: null,
          details: { photo_url: "verdant-photo://private/legacy-photo" },
          retracted_at: null,
        },
        {
          id: "retracted-photo",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          entry_at: "2026-08-07T10:00:00.000Z",
          photo_url: "verdant-photo://private/retracted-photo",
          details: {},
          retracted_at: "2026-08-07T10:05:00.000Z",
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
    expect(legacyPlant?.targetArchived).toBe(false);
    expect(legacyPlant?.summaryComplete).toBe(false);
    expect(result.data.receipt.omittedLanes).toEqual(["sensors"]);

    expect(calls).toContainEqual({
      table: "plants",
      method: "or",
      args: ["grow_id.eq.grow-1,tent_id.in.(tent-1,tent-empty)"],
    });
    expect(calls).toContainEqual({
      table: "diary_entries",
      method: "is",
      args: ["retracted_at", null],
    });
  });

  it("keeps output presenter-safe even when the sensor query needs internal provenance", async () => {
    const { client } = clientFor(successFixtures());
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /raw_payload|access_token|refresh_token|authorization|signed_url|storage_path|target_device|legacy-photo|retracted-photo/i,
    );
  });

  it("retries diary-photo metadata without the new column only for a pre-migration database", async () => {
    const { client, calls } = clientFor(successFixtures(), { missingDiaryRetractionColumn: true });
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.data.targets.find((target) => target.targetId === "plant-1")?.lastPhotoEventAt,
    ).toBe("2026-08-07T08:00:00.000Z");
    const selects = calls
      .filter((call) => call.table === "diary_entries" && call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain("retracted_at");
    expect(selects[1]).not.toContain("retracted_at");
  });

  it("bounds a large target list before detailed sensor work and marks its summary incomplete", async () => {
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
    fixtures.grow_events = {
      data: Array.from({ length: 501 }, (_, index) => ({
        ...successFixtures().grow_events.data![0],
        id: `event-${index}`,
        tent_id: `tent-${String(index % 110).padStart(3, "0")}`,
      })),
      error: null,
    };
    fixtures.sensor_readings = {
      data: [
        {
          ...SENSOR_ROWS[0],
          id: "legacy-ts-newer",
          captured_at: null,
          ts: "2026-08-07T11:58:00.000Z",
        },
        {
          ...SENSOR_ROWS[0],
          id: "captured-newest",
          captured_at: "2026-08-07T11:59:00.000Z",
          ts: "2026-08-07T08:00:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      limit: 1,
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.targets).toHaveLength(1);
    expect(result.data.targets[0]?.latestSensorCapturedAt).toBeNull();
    expect(result.data.targets[0]?.summaryComplete).toBe(false);
    expect(result.data.receipt).toMatchObject({
      candidateTargetLimit: 100,
      candidateTargetsTruncated: true,
      returnedTargetsTruncated: true,
      truncatedLanes: ["events"],
      omittedLanes: ["sensors"],
    });
    expect(calls.filter((call) => call.table === "sensor_readings")).toHaveLength(0);
    expect(calls).toContainEqual({ table: "tents", method: "limit", args: [101] });
    expect(calls).toContainEqual({ table: "plants", method: "limit", args: [101] });
    expect(calls).toContainEqual({ table: "grow_events", method: "limit", args: [501] });
  });

  it("does not report a summary lane truncated when it contains exactly 500 rows", async () => {
    const fixtures = successFixtures();
    const eventSeed = fixtures.grow_events.data?.[0];
    if (!eventSeed) throw new Error("Expected Grow Walk event fixture.");
    fixtures.grow_events = {
      data: Array.from({ length: 500 }, (_, index) => ({
        ...eventSeed,
        id: `event-${index}`,
      })),
      error: null,
    };
    const { client, calls } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.receipt.truncatedLanes).not.toContain("events");
    expect(calls).toContainEqual({ table: "grow_events", method: "limit", args: [501] });
  });

  it("derives worsening attention from the canonical Quick Log response-check note", async () => {
    const fixtures = successFixtures();
    const existingEvents = Array.isArray(fixtures.grow_events.data)
      ? fixtures.grow_events.data
      : [];
    fixtures.grow_events = {
      data: [
        ...existingEvents,
        {
          id: "response-worse",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:30:00.000Z",
          note: "Response check: Worse.",
          created_at: "2026-08-07T11:30:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };
    fixtures.alerts = { data: [], error: null };
    const { client } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.data.targets.find((row) => row.targetId === "plant-1");
    expect(target?.reasonCodes).toContain("worsening_observation");
    expect(target?.latestAdverseEvidenceAt).toBe("2026-08-07T11:30:00.000Z");
  });

  it("summarizes only environmental enclosing-tent events for a plant without importing watering, Worse, sibling, or grow-wide logs", async () => {
    const fixtures = successFixtures();
    fixtures.grow_events = {
      data: [
        ...(fixtures.grow_events.data as Record<string, unknown>[]),
        {
          id: "tent-environment",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "environment",
          source: "manual",
          occurred_at: "2026-08-07T11:30:00.000Z",
          note: "Tent-wide humidity check.",
          created_at: "2026-08-07T11:30:01.000Z",
          is_deleted: false,
        },
        {
          id: "tent-watering",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "watering",
          source: "manual",
          occurred_at: "2026-08-07T11:40:00.000Z",
          note: "Tent-only watering must not become a plant log.",
          created_at: "2026-08-07T11:40:01.000Z",
          is_deleted: false,
        },
        {
          id: "tent-worse",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: null,
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:45:00.000Z",
          note: "Response check: Worse.",
          created_at: "2026-08-07T11:45:01.000Z",
          is_deleted: false,
        },
        {
          id: "sibling-quick-log",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-2",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:40:00.000Z",
          note: "Sibling-only check.",
          created_at: "2026-08-07T11:40:01.000Z",
          is_deleted: false,
        },
        {
          id: "grow-wide-quick-log",
          grow_id: "grow-1",
          tent_id: null,
          plant_id: null,
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:45:00.000Z",
          note: "Grow-wide check.",
          created_at: "2026-08-07T11:45:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };
    fixtures.alerts = { data: [], error: null };
    const { client } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.data.targets.find((row) => row.targetId === "plant-1");
    expect(target?.lastLogAt).toBe("2026-08-07T11:30:00.000Z");
    expect(target?.recentMajorChangeCount48h).toBe(1);
    expect(target?.reasonCodes).not.toContain("worsening_observation");
  });

  it("keeps an acknowledged current alert when it predates the target-summary lookback", async () => {
    const fixtures = successFixtures();
    fixtures.alerts = {
      data: [
        ...(fixtures.alerts.data as Record<string, unknown>[]),
        {
          id: "acknowledged-current-alert",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          title: "Older active humidity alert",
          reason: "Acknowledged alerts remain current until resolved.",
          severity: "medium",
          status: "acknowledged",
          metric: "humidity_pct",
          source: "live",
          last_seen_at: "2026-07-01T11:45:00.000Z",
        },
      ],
      error: null,
    };
    const { client, calls } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const target = result.data.targets.find((row) => row.targetId === "plant-1");
    expect(target?.activeAlertCount).toBe(2);
    expect(calls).not.toContainEqual({
      table: "alerts",
      method: "gte",
      args: ["last_seen_at", "2026-08-04T12:00:00.000Z"],
    });
  });

  it("labels every target historical when its owned grow is archived", async () => {
    const fixtures = successFixtures();
    fixtures.grows = {
      data: { id: "grow-1", name: "Archived Grow", is_archived: true },
      error: null,
    };
    const { client } = clientFor(fixtures);

    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.targets).not.toHaveLength(0);
    expect(result.data.targets.every((target) => target.targetArchived)).toBe(true);
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

  it("keeps returned plant targets aligned with their archived or omitted owned tent context", async () => {
    const fixtures = successFixtures();
    fixtures.tents = {
      data: [
        ...Array.from({ length: 101 }, (_, index) => ({
          id: `tent-${String(index).padStart(3, "0")}`,
          name: `Tent ${String(index).padStart(3, "0")}`,
          grow_id: "grow-1",
          stage: "flower",
          is_archived: false,
        })),
        {
          id: "tent-archived",
          name: "Archived Tent",
          grow_id: "grow-1",
          stage: "flower",
          is_archived: true,
        },
        {
          id: "tent-foreign",
          name: "Foreign Tent",
          grow_id: "foreign-grow",
          stage: "flower",
          is_archived: true,
        },
      ],
      error: null,
    };
    fixtures.plants = {
      data: [
        {
          id: "archived-parent-plant",
          name: "Archived Parent Plant",
          strain: null,
          tent_id: "tent-archived",
          grow_id: "grow-1",
          stage: "flower",
          health: null,
          is_archived: false,
          medium: null,
          pot_size: null,
          plant_type: null,
          started_at: null,
        },
        {
          id: "inactive-archived-parent-plant",
          name: "Inactive Archived Parent Plant",
          strain: null,
          tent_id: "tent-archived",
          grow_id: "grow-1",
          stage: "flower",
          health: null,
          is_archived: true,
          medium: null,
          pot_size: null,
          plant_type: null,
          started_at: null,
        },
        {
          id: "omitted-parent-plant",
          name: "Omitted Parent Plant",
          strain: null,
          tent_id: "tent-100",
          grow_id: "grow-1",
          stage: "flower",
          health: null,
          is_archived: false,
          medium: null,
          pot_size: null,
          plant_type: null,
          started_at: null,
        },
        {
          id: "foreign-tent-plant",
          name: "Foreign Tent Plant",
          strain: null,
          tent_id: "tent-foreign",
          grow_id: "grow-1",
          stage: "flower",
          health: null,
          is_archived: false,
          medium: null,
          pot_size: null,
          plant_type: null,
          started_at: null,
        },
      ],
      error: null,
    };
    fixtures.grow_events = {
      data: [
        {
          id: "archived-tent-quick-log",
          grow_id: "grow-1",
          tent_id: "tent-archived",
          plant_id: null,
          event_type: "environment",
          source: "manual",
          occurred_at: "2026-08-07T11:30:00.000Z",
          note: "Tent-wide environmental check.",
          created_at: "2026-08-07T11:30:01.000Z",
          is_deleted: false,
        },
        {
          id: "omitted-tent-quick-log",
          grow_id: "grow-1",
          tent_id: "tent-100",
          plant_id: null,
          event_type: "environment",
          source: "manual",
          occurred_at: "2026-08-07T11:31:00.000Z",
          note: "Tent-wide environmental check.",
          created_at: "2026-08-07T11:31:01.000Z",
          is_deleted: false,
        },
        {
          id: "foreign-plant-event",
          grow_id: "grow-1",
          tent_id: "tent-foreign",
          plant_id: "foreign-tent-plant",
          event_type: "observation",
          source: "manual",
          occurred_at: "2026-08-07T11:32:00.000Z",
          note: "Response check: Worse.",
          created_at: "2026-08-07T11:32:01.000Z",
          is_deleted: false,
        },
      ],
      error: null,
    };
    fixtures.diary_entries = { data: [], error: null };
    fixtures.alerts = { data: [], error: null };

    const { client, calls } = clientFor(fixtures);
    const result = await listGrowWalkTargetsForOwnedGrow(client, "grow-1", {
      limit: 100,
      now: new Date("2026-08-07T12:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const archivedParent = result.data.targets.find(
      (target) => target.targetId === "archived-parent-plant",
    );
    expect(archivedParent).toMatchObject({
      targetType: "plant",
      tentId: "tent-archived",
      targetArchived: true,
      lastLogAt: "2026-08-07T11:30:00.000Z",
    });
    const omittedParent = result.data.targets.find(
      (target) => target.targetId === "omitted-parent-plant",
    );
    expect(omittedParent).toMatchObject({
      targetType: "plant",
      tentId: "tent-100",
      targetArchived: false,
      lastLogAt: "2026-08-07T11:31:00.000Z",
    });
    expect(result.data.targets.map((target) => target.targetId)).not.toContain("tent-archived");
    expect(result.data.targets.map((target) => target.targetId)).not.toContain(
      "foreign-tent-plant",
    );
    expect(result.data.receipt.candidateTargetsTruncated).toBe(true);
    expect(calls).toContainEqual({ table: "tents", method: "limit", args: [101] });
    expect(calls).toContainEqual({ table: "tents", method: "limit", args: [100] });
    expect(calls).toContainEqual({
      table: "tents",
      method: "in",
      args: ["id", expect.arrayContaining(["tent-archived", "tent-100", "tent-foreign"])],
    });

    const { client: includeInactiveClient } = clientFor(fixtures);
    const includeInactive = await listGrowWalkTargetsForOwnedGrow(includeInactiveClient, "grow-1", {
      includeInactivePlants: true,
      limit: 100,
      now: new Date("2026-08-07T12:00:00.000Z"),
    });
    expect(includeInactive.ok).toBe(true);
    if (!includeInactive.ok) return;
    expect(
      includeInactive.data.targets.find(
        (target) => target.targetId === "inactive-archived-parent-plant",
      ),
    ).toMatchObject({
      tentId: "tent-archived",
      targetArchived: true,
      lastLogAt: "2026-08-07T11:30:00.000Z",
    });
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
