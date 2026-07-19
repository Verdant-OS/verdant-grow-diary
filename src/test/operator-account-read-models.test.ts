import { describe, expect, it } from "vitest";
import {
  getLatestSensorSnapshotForOwnedTent,
  listRecentDiaryEntriesForOwnedGrow,
  OPERATOR_SENSOR_METRICS,
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
} from "@/lib/operatorAccountReadModels";

type QueryError = { message: string } | null;

interface MockCall {
  table: string;
  method: string;
  args: unknown[];
}

function diaryClient(input: {
  grow?: { id: string } | null;
  growError?: QueryError;
  entries?: unknown[] | null;
  entriesError?: QueryError;
}) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      if (table === "grows") {
        const chain = {
          select(...args: unknown[]) {
            calls.push({ table, method: "select", args });
            return chain;
          },
          eq(...args: unknown[]) {
            calls.push({ table, method: "eq", args });
            return chain;
          },
          async maybeSingle() {
            calls.push({ table, method: "maybeSingle", args: [] });
            return { data: input.grow ?? null, error: input.growError ?? null };
          },
        };
        return chain;
      }

      if (table !== "diary_entries") throw new Error(`Unexpected table: ${table}`);
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return chain;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          return chain;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return chain;
        },
        async limit(...args: unknown[]) {
          calls.push({ table, method: "limit", args });
          return { data: input.entries ?? null, error: input.entriesError ?? null };
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

function sensorClient(input: {
  tent?: { id: string; name: string; grow_id: string | null } | null;
  tentError?: QueryError;
  rows?: readonly McpSensorQueryRow[];
  queryErrorAt?: number;
}) {
  const calls: MockCall[] = [];
  let sensorQueryIndex = 0;
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      if (table === "tents") {
        const chain = {
          select(...args: unknown[]) {
            calls.push({ table, method: "select", args });
            return chain;
          },
          eq(...args: unknown[]) {
            calls.push({ table, method: "eq", args });
            return chain;
          },
          async maybeSingle() {
            calls.push({ table, method: "maybeSingle", args: [] });
            return { data: input.tent ?? null, error: input.tentError ?? null };
          },
        };
        return chain;
      }

      if (table !== "sensor_readings") throw new Error(`Unexpected table: ${table}`);
      const queryIndex = sensorQueryIndex++;
      let metric = "";
      let capturedMode: "captured" | "legacy" = "captured";
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: "select", args });
          return chain;
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: "eq", args });
          if (args[0] === "metric") metric = String(args[1]);
          return chain;
        },
        not(...args: unknown[]) {
          calls.push({ table, method: "not", args });
          capturedMode = "captured";
          return chain;
        },
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
          capturedMode = "legacy";
          return chain;
        },
        order(...args: unknown[]) {
          calls.push({ table, method: "order", args });
          return chain;
        },
        async limit(...args: unknown[]) {
          calls.push({ table, method: "limit", args });
          if (input.queryErrorAt === queryIndex) {
            return { data: null, error: { message: "sensor query failed" } };
          }
          const data = (input.rows ?? []).filter(
            (row) =>
              row.metric === metric &&
              (capturedMode === "legacy" ? row.captured_at === null : row.captured_at !== null),
          );
          return { data, error: null };
        },
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

function row(overrides: Partial<McpSensorQueryRow> = {}): McpSensorQueryRow {
  return {
    id: "reading-1",
    tent_id: "tent-1",
    metric: "temperature_c",
    value: 24,
    quality: "ok",
    source: "live",
    ts: "2026-07-19T12:00:00.000Z",
    captured_at: "2026-07-19T12:00:00.000Z",
    created_at: "2026-07-19T12:00:01.000Z",
    raw_payload: { stationtype: "GW2000A", secret: "must-not-cross" },
    ...overrides,
  };
}

describe("owner-scoped Operator account read models", () => {
  describe("listRecentDiaryEntriesForOwnedGrow", () => {
    it("checks grow visibility before returning presenter-safe recent entries", async () => {
      const entries = [
        {
          id: "entry-1",
          grow_id: "grow-1",
          plant_id: null,
          tent_id: "tent-1",
          stage: "flower",
          note: "Checked runoff.",
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:01:00Z",
        },
      ];
      const { client, calls } = diaryClient({ grow: { id: "grow-1" }, entries });

      await expect(listRecentDiaryEntriesForOwnedGrow(client, "grow-1", 7)).resolves.toEqual({
        ok: true,
        data: { entries },
      });
      expect(
        calls.findIndex((call) => call.table === "grows" && call.method === "maybeSingle"),
      ).toBeLessThan(
        calls.findIndex((call) => call.table === "diary_entries" && call.method === "from"),
      );
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "eq",
        args: ["grow_id", "grow-1"],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "limit",
        args: [7],
      });
    });

    it.each([
      { requested: undefined, expected: 10 },
      { requested: Number.NaN, expected: 10 },
      { requested: Number.POSITIVE_INFINITY, expected: 10 },
      { requested: 0, expected: 1 },
      { requested: -12, expected: 1 },
      { requested: 4.9, expected: 4 },
      { requested: 99, expected: 50 },
    ])("clamps diary limit $requested to $expected", async ({ requested, expected }) => {
      const { client, calls } = diaryClient({ grow: { id: "grow-1" }, entries: [] });
      await listRecentDiaryEntriesForOwnedGrow(client, "grow-1", requested);
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "limit",
        args: [expected],
      });
    });

    it("fails closed and skips child rows when the grow is not visible", async () => {
      const { client, calls } = diaryClient({ grow: null, entries: [{ id: "cross-user" }] });

      await expect(listRecentDiaryEntriesForOwnedGrow(client, "foreign-grow")).resolves.toEqual({
        ok: false,
        reason: "not_found",
        message: "Grow not found for the signed-in grower.",
      });
      expect(calls.some((call) => call.table === "diary_entries")).toBe(false);
    });

    it("reports owner-check and diary-query failures as unavailable", async () => {
      const ownerFailure = diaryClient({ growError: { message: "grow RLS unavailable" } });
      await expect(
        listRecentDiaryEntriesForOwnedGrow(ownerFailure.client, "grow-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "grow RLS unavailable",
      });
      expect(ownerFailure.calls.some((call) => call.table === "diary_entries")).toBe(false);

      const rowsFailure = diaryClient({
        grow: { id: "grow-1" },
        entriesError: { message: "diary read unavailable" },
      });
      await expect(
        listRecentDiaryEntriesForOwnedGrow(rowsFailure.client, "grow-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "diary read unavailable",
      });
    });
  });

  describe("selectLatestMcpSensorReadings", () => {
    it("selects deterministically by capture, ingest, created, then id descending", () => {
      const rows = [
        row({
          id: "capture-older",
          metric: "temperature_c",
          captured_at: "2026-07-19T12:03:00Z",
          ts: "2026-07-19T12:09:00Z",
        }),
        row({
          id: "capture-newer",
          metric: "temperature_c",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:04:00Z",
        }),
        row({
          id: "ingest-older",
          metric: "humidity_pct",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:04:00Z",
        }),
        row({
          id: "ingest-newer",
          metric: "humidity_pct",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:05:00Z",
        }),
        row({
          id: "created-older",
          metric: "vpd_kpa",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:05:00Z",
          created_at: "2026-07-19T12:05:30Z",
        }),
        row({
          id: "created-newer",
          metric: "vpd_kpa",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:05:00Z",
          created_at: "2026-07-19T12:06:00Z",
        }),
        row({
          id: "a-id",
          metric: "co2_ppm",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:05:00Z",
          created_at: "2026-07-19T12:06:00Z",
        }),
        row({
          id: "z-id",
          metric: "co2_ppm",
          captured_at: "2026-07-19T12:04:00Z",
          ts: "2026-07-19T12:05:00Z",
          created_at: "2026-07-19T12:06:00Z",
        }),
      ];

      const expected = selectLatestMcpSensorReadings(rows, {
        now: new Date("2026-07-19T12:10:00Z"),
      });
      expect(
        Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, value.id])),
      ).toEqual({
        temperature_c: "capture-newer",
        humidity_pct: "ingest-newer",
        vpd_kpa: "created-newer",
        co2_ppm: "z-id",
      });
      expect(
        selectLatestMcpSensorReadings([...rows].reverse(), {
          now: new Date("2026-07-19T12:10:00Z"),
        }),
      ).toEqual(expected);
    });

    it("uses ts as the effective capture time for legacy null-captured rows", () => {
      const readings = selectLatestMcpSensorReadings(
        [
          row({ id: "captured", captured_at: "2026-07-19T11:58:00Z" }),
          row({
            id: "legacy",
            captured_at: null,
            ts: "2026-07-19T12:01:00Z",
          }),
        ],
        { now: new Date("2026-07-19T12:02:00Z") },
      );
      expect(readings.temperature_c.id).toBe("legacy");
      expect(readings.temperature_c.captured_at).toBeNull();
    });

    it("excludes diagnostics and unsupported metrics before selecting", () => {
      const readings = selectLatestMcpSensorReadings(
        [
          row({
            id: "diagnostic",
            value: 99,
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: { confidence: "test" },
            },
          }),
          row({ id: "physical", value: 24, captured_at: "2026-07-19T11:59:00Z" }),
          row({ id: "unknown", metric: "fan_speed_pct" }),
        ],
        { now: new Date("2026-07-19T12:05:00Z") },
      );
      expect(Object.keys(readings)).toEqual(["temperature_c"]);
      expect(readings.temperature_c.id).toBe("physical");
    });

    it("never exposes raw_payload or the created_at query tie-break", () => {
      const [reading] = Object.values(
        selectLatestMcpSensorReadings([row()], {
          now: new Date("2026-07-19T12:05:00Z"),
        }),
      );
      expect(reading).not.toHaveProperty("raw_payload");
      expect(reading).not.toHaveProperty("created_at");
      expect(JSON.stringify(reading)).not.toContain("must-not-cross");
    });

    it.each([
      {
        name: "fresh live ok",
        overrides: {},
        freshness: "fresh",
        currentLive: true,
      },
      {
        name: "manual",
        overrides: { source: "manual" },
        freshness: "fresh",
        currentLive: false,
      },
      {
        name: "csv",
        overrides: { source: "csv" },
        freshness: "fresh",
        currentLive: false,
      },
      {
        name: "legacy provider source",
        overrides: { source: "ecowitt" },
        freshness: "fresh",
        currentLive: false,
      },
      {
        name: "degraded",
        overrides: { quality: "degraded" },
        freshness: "fresh",
        currentLive: false,
      },
      {
        name: "aged live",
        overrides: { captured_at: "2026-07-19T11:29:59Z", ts: "2026-07-19T11:29:59Z" },
        freshness: "stale",
        currentLive: false,
      },
      {
        name: "stale label",
        overrides: { quality: "stale" },
        freshness: "stale",
        currentLive: false,
      },
      {
        name: "invalid label",
        overrides: { source: "invalid" },
        freshness: "invalid",
        currentLive: false,
      },
      {
        name: "invalid timestamp",
        overrides: { captured_at: "not-a-date", ts: "not-a-date" },
        freshness: "invalid",
        currentLive: false,
      },
      {
        name: "future timestamp beyond tolerated clock skew",
        overrides: {
          captured_at: "2026-07-19T12:02:01Z",
          ts: "2026-07-19T12:02:01Z",
        },
        freshness: "invalid",
        currentLive: false,
      },
    ])(
      "classifies $name without overstating current live trust",
      ({ overrides, freshness, currentLive }) => {
        const readings = selectLatestMcpSensorReadings([row(overrides)], {
          now: new Date("2026-07-19T12:00:00Z"),
        });
        expect(readings.temperature_c).toMatchObject({
          freshness,
          current_live: currentLive,
        });
      },
    );

    it.each([
      ["temperature_c", 60],
      ["humidity_pct", 99],
      ["vpd_kpa", 10],
      ["co2_ppm", 5_000],
      ["soil_moisture_pct", 99],
      ["soil_temp_c", -10],
      ["ph", 9],
      ["ec", 5],
      ["ppfd", 0],
    ])("keeps the plausible %s boundary current", (metric, value) => {
      const reading = selectLatestMcpSensorReadings([row({ metric, value })], {
        now: new Date("2026-07-19T12:00:00Z"),
      })[metric];
      expect(reading).toMatchObject({ freshness: "fresh", current_live: true });
    });

    it.each([
      ["temperature_c", 60.01],
      ["humidity_pct", 0],
      ["humidity_pct", 100],
      ["vpd_kpa", 10.01],
      ["co2_ppm", 5_001],
      ["soil_moisture_pct", 0],
      ["soil_moisture_pct", 100],
      ["soil_temp_c", -10.01],
      ["ph", 9.01],
      ["ec", 5.01],
      ["ppfd", -0.01],
    ])("fails implausible %s=%s closed as invalid context", (metric, value) => {
      const reading = selectLatestMcpSensorReadings([row({ metric, value })], {
        now: new Date("2026-07-19T12:00:00Z"),
      })[metric];
      expect(reading).toMatchObject({ freshness: "invalid", current_live: false });
    });

    it("is null-safe and repeatable", () => {
      expect(selectLatestMcpSensorReadings(null)).toEqual({});
      expect(selectLatestMcpSensorReadings(undefined)).toEqual({});
      const rows = [row(), row({ id: "humidity", metric: "humidity_pct", value: 55 })];
      const options = { now: new Date("2026-07-19T12:05:00Z") };
      expect(selectLatestMcpSensorReadings(rows, options)).toEqual(
        selectLatestMcpSensorReadings(rows, options),
      );
    });
  });

  describe("getLatestSensorSnapshotForOwnedTent", () => {
    it("checks tent ownership before reading every supported metric", async () => {
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        rows: [row()],
      });

      const result = await getLatestSensorSnapshotForOwnedTent(client, "tent-1", {
        now: new Date("2026-07-19T12:05:00Z"),
      });
      expect(result).toMatchObject({
        ok: true,
        data: {
          tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
          snapshot: {
            tentId: "tent-1",
            readings: { temperature_c: { current_live: true } },
          },
        },
      });
      expect(
        calls.findIndex((call) => call.table === "tents" && call.method === "maybeSingle"),
      ).toBeLessThan(
        calls.findIndex((call) => call.table === "sensor_readings" && call.method === "from"),
      );
      expect(
        calls.filter((call) => call.table === "sensor_readings" && call.method === "from"),
      ).toHaveLength(OPERATOR_SENSOR_METRICS.length * 2);
      expect(calls).toContainEqual({
        table: "sensor_readings",
        method: "select",
        args: ["id,tent_id,metric,value,quality,source,ts,captured_at,created_at,raw_payload"],
      });
    });

    it("returns snapshot null when the owned tent has no eligible rows", async () => {
      const { client } = sensorClient({
        tent: { id: "tent-1", name: "Empty tent", grow_id: "grow-1" },
      });
      await expect(getLatestSensorSnapshotForOwnedTent(client, "tent-1")).resolves.toEqual({
        ok: true,
        data: {
          tent: { id: "tent-1", name: "Empty tent", grow_id: "grow-1" },
          snapshot: null,
        },
      });
    });

    it("fails closed and skips sensor rows when the tent is not visible", async () => {
      const { client, calls } = sensorClient({ tent: null, rows: [row()] });
      await expect(getLatestSensorSnapshotForOwnedTent(client, "foreign-tent")).resolves.toEqual({
        ok: false,
        reason: "not_found",
        message: "Tent not found for the signed-in grower.",
      });
      expect(calls.some((call) => call.table === "sensor_readings")).toBe(false);
    });

    it("reports owner-check and metric-query failures as unavailable", async () => {
      const ownerFailure = sensorClient({ tentError: { message: "tent RLS unavailable" } });
      await expect(
        getLatestSensorSnapshotForOwnedTent(ownerFailure.client, "tent-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "tent RLS unavailable",
      });
      expect(ownerFailure.calls.some((call) => call.table === "sensor_readings")).toBe(false);

      const queryFailure = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        queryErrorAt: 4,
      });
      await expect(
        getLatestSensorSnapshotForOwnedTent(queryFailure.client, "tent-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "sensor query failed",
      });
    });
  });
});
