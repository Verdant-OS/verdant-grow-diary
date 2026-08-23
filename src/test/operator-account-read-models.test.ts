import { describe, expect, it } from "vitest";
import {
  findMcpSensorSourceContradictionMetrics,
  getLatestSensorSnapshotForOwnedTent,
  listRecentDiaryEntriesForOwnedGrow,
  listRecentDiaryEntriesForOwnedTent,
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
        is(...args: unknown[]) {
          calls.push({ table, method: "is", args });
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

function tentDiaryClient(input: {
  grow?: { id: string } | null;
  growError?: QueryError;
  tent?: { id: string } | null;
  tentError?: QueryError;
  entries?: unknown[] | null;
  entriesError?: QueryError;
}) {
  const calls: MockCall[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      if (table === "grows" || table === "tents") {
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
            return table === "grows"
              ? { data: input.grow ?? null, error: input.growError ?? null }
              : { data: input.tent ?? null, error: input.tentError ?? null };
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
      let sourceValues: readonly string[] | null = null;
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
        in(...args: unknown[]) {
          calls.push({ table, method: "in", args });
          if (args[0] === "source" && Array.isArray(args[1])) {
            sourceValues = args[1].filter((value): value is string => typeof value === "string");
          }
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
          const limit = typeof args[0] === "number" ? args[0] : Number.POSITIVE_INFINITY;
          const data = (input.rows ?? []).filter(
            (row) =>
              row.metric === metric &&
              (capturedMode === "legacy" ? row.captured_at === null : row.captured_at !== null) &&
              (sourceValues === null || sourceValues.includes(row.source)),
          );
          return { data: data.slice(0, limit), error: null };
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
        method: "is",
        args: ["retracted_at", null],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "limit",
        args: [7],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "order",
        args: ["entry_at", { ascending: false }],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "order",
        args: ["created_at", { ascending: false }],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "order",
        args: ["id", { ascending: false }],
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

  describe("listRecentDiaryEntriesForOwnedTent", () => {
    it("checks the grow and exact tent relation before applying the child-row limit", async () => {
      const entries = [
        {
          id: "entry-flower",
          grow_id: "grow-1",
          plant_id: null,
          tent_id: "tent-flower",
          stage: "flower",
          note: "Pot feels light.",
          entry_at: "2026-07-20T09:00:00Z",
          created_at: "2026-07-20T09:01:00Z",
        },
      ];
      const { client, calls } = tentDiaryClient({
        grow: { id: "grow-1" },
        tent: { id: "tent-flower" },
        entries,
      });

      await expect(
        listRecentDiaryEntriesForOwnedTent(client, "grow-1", "tent-flower", 10),
      ).resolves.toEqual({ ok: true, data: { entries } });
      expect(calls).toContainEqual({
        table: "tents",
        method: "eq",
        args: ["grow_id", "grow-1"],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "eq",
        args: ["grow_id", "grow-1"],
      });
      expect(calls).toContainEqual({
        table: "diary_entries",
        method: "eq",
        args: ["tent_id", "tent-flower"],
      });
      expect(
        calls.findIndex((call) => call.table === "tents" && call.method === "maybeSingle"),
      ).toBeLessThan(
        calls.findIndex((call) => call.table === "diary_entries" && call.method === "from"),
      );
      expect(calls).toContainEqual({ table: "diary_entries", method: "limit", args: [10] });
    });

    it("fails closed before diary rows when the tent is not linked to the owned grow", async () => {
      const { client, calls } = tentDiaryClient({
        grow: { id: "grow-1" },
        tent: null,
        entries: [{ id: "must-not-return" }],
      });

      await expect(
        listRecentDiaryEntriesForOwnedTent(client, "grow-1", "foreign-tent"),
      ).resolves.toEqual({
        ok: false,
        reason: "not_found",
        message: "Tent not found in this grow for the signed-in grower.",
      });
      expect(calls.some((call) => call.table === "diary_entries")).toBe(false);
    });

    it("reports tent and diary read failures as unavailable", async () => {
      const tentFailure = tentDiaryClient({
        grow: { id: "grow-1" },
        tentError: { message: "tent RLS unavailable" },
      });
      await expect(
        listRecentDiaryEntriesForOwnedTent(tentFailure.client, "grow-1", "tent-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "tent RLS unavailable",
      });
      expect(tentFailure.calls.some((call) => call.table === "diary_entries")).toBe(false);

      const diaryFailure = tentDiaryClient({
        grow: { id: "grow-1" },
        tent: { id: "tent-1" },
        entriesError: { message: "tent diary unavailable" },
      });
      await expect(
        listRecentDiaryEntriesForOwnedTent(diaryFailure.client, "grow-1", "tent-1"),
      ).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "tent diary unavailable",
      });
    });
  });

  describe("selectLatestMcpSensorReadings", () => {
    it("finds only coeval contradictions across canonical source classes", () => {
      const now = new Date("2026-07-19T12:05:00Z");
      expect(
        findMcpSensorSourceContradictionMetrics(
          [
            row({
              id: "live-current",
              metric: "temperature_c",
              value: 24,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-current",
              metric: "temperature_c",
              value: 30,
              source: "manual",
              captured_at: "2026-07-19T12:03:30Z",
              ts: "2026-07-19T12:03:30Z",
            }),
            row({
              id: "manual-temperature-rounding",
              metric: "temperature_c",
              value: 24.1,
              source: "csv",
              captured_at: "2026-07-19T12:03:45Z",
              ts: "2026-07-19T12:03:45Z",
            }),
            row({
              id: "old-manual",
              metric: "humidity_pct",
              value: 80,
              source: "manual",
              captured_at: "2026-07-19T11:55:00Z",
              ts: "2026-07-19T11:55:00Z",
            }),
            row({
              id: "new-live",
              metric: "humidity_pct",
              value: 55,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "live-cohort-boundary",
              metric: "vpd_kpa",
              value: 1,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-cohort-boundary",
              metric: "vpd_kpa",
              value: 2,
              source: "manual",
              captured_at: "2026-07-19T11:59:00Z",
              ts: "2026-07-19T11:59:00Z",
            }),
            row({
              id: "live-just-outside-cohort",
              metric: "soil_moisture_pct",
              value: 40,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-just-outside-cohort",
              metric: "soil_moisture_pct",
              value: 60,
              source: "manual",
              captured_at: "2026-07-19T11:58:59.999Z",
              ts: "2026-07-19T11:58:59.999Z",
            }),
            row({
              id: "pi-alias",
              metric: "co2_ppm",
              value: 700,
              source: "pi_bridge",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "live-alias",
              metric: "co2_ppm",
              value: 900,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "live-same-value",
              metric: "ec",
              value: 1.2,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-same-value",
              metric: "ec",
              value: 1.2,
              source: "manual",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
          ],
          { now },
        ),
      ).toEqual(["temperature_c", "vpd_kpa"]);
    });

    it("does not treat source noise within the metric tolerance as a contradiction", () => {
      const now = new Date("2026-07-19T12:05:00Z");
      expect(
        findMcpSensorSourceContradictionMetrics(
          [
            row({
              id: "live-temperature",
              metric: "temperature_c",
              value: 24,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-temperature-rounding",
              metric: "temperature_c",
              value: 24.1,
              source: "manual",
              captured_at: "2026-07-19T12:03:30Z",
              ts: "2026-07-19T12:03:30Z",
            }),
            row({
              id: "live-vpd",
              metric: "vpd_kpa",
              value: 1,
              source: "live",
              captured_at: "2026-07-19T12:04:00Z",
              ts: "2026-07-19T12:04:00Z",
            }),
            row({
              id: "manual-vpd-boundary",
              metric: "vpd_kpa",
              value: 1.2,
              source: "manual",
              captured_at: "2026-07-19T12:03:30Z",
              ts: "2026-07-19T12:03:30Z",
            }),
          ],
          { now },
        ),
      ).toEqual([]);
    });

    it("uses a distinct source-conflict tolerance for every supported metric", () => {
      const now = new Date("2026-07-19T12:05:00Z");
      const cases = [
        { metric: "temperature_c", base: 24, within: 24.1, beyond: 25 },
        { metric: "humidity_pct", base: 50, within: 52, beyond: 54 },
        { metric: "vpd_kpa", base: 1, within: 1.1, beyond: 1.21 },
        { metric: "co2_ppm", base: 700, within: 750, beyond: 801 },
        { metric: "soil_moisture_pct", base: 50, within: 53, beyond: 56 },
        { metric: "soil_temp_c", base: 20, within: 20.1, beyond: 21 },
        { metric: "ph", base: 6, within: 6.1, beyond: 6.3 },
        { metric: "ec", base: 1, within: 1.1, beyond: 1.3 },
        { metric: "ppfd", base: 500, within: 525, beyond: 551 },
      ] as const;

      for (const fixture of cases) {
        const readings = (value: number) => [
          row({
            id: `live-${fixture.metric}`,
            metric: fixture.metric,
            value: fixture.base,
            source: "live",
            captured_at: "2026-07-19T12:04:00Z",
            ts: "2026-07-19T12:04:00Z",
          }),
          row({
            id: `manual-${fixture.metric}`,
            metric: fixture.metric,
            value,
            source: "manual",
            captured_at: "2026-07-19T12:03:30Z",
            ts: "2026-07-19T12:03:30Z",
          }),
        ];

        expect(findMcpSensorSourceContradictionMetrics(readings(fixture.within), { now })).toEqual(
          [],
        );
        expect(findMcpSensorSourceContradictionMetrics(readings(fixture.beyond), { now })).toEqual([
          fixture.metric,
        ]);
      }
    });

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

    it("does not supplement exactly 25 logical candidates or surface a nonexistent recovery failure", async () => {
      const at = "2026-07-19T12:00:00Z";
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        // Index 18 would be the first supplemental request after the 18
        // primary metric/branch reads. Exactly 25 rows must not reach it.
        queryErrorAt: OPERATOR_SENSOR_METRICS.length * 2,
        rows: Array.from({ length: 25 }, (_, index) =>
          row({
            id: `live-${index}`,
            metric: "humidity_pct",
            value: 60,
            source: "live",
            captured_at: at,
            ts: at,
          }),
        ),
      });

      await expect(
        getLatestSensorSnapshotForOwnedTent(client, "tent-1", {
          now: new Date("2026-07-19T12:05:00Z"),
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: { snapshot: { tentId: "tent-1", readings: { humidity_pct: { value: 60 } } } },
      });
      expect(calls.some((call) => call.table === "sensor_readings" && call.method === "in")).toBe(
        false,
      );
    });

    it("uses a 26-row lookahead then recovers a hidden conflicting source", async () => {
      const at = "2026-07-19T12:00:00Z";
      const liveRows = Array.from({ length: 26 }, (_, index) =>
        row({
          id: `live-${index}`,
          metric: "humidity_pct",
          value: 60,
          source: "live",
          captured_at: at,
          ts: at,
        }),
      );
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        rows: [
          ...liveRows,
          row({
            id: "manual-humidity",
            metric: "humidity_pct",
            value: 80,
            source: "manual",
            captured_at: "2026-07-19T11:59:00Z",
            ts: "2026-07-19T11:59:00Z",
          }),
        ],
      });

      const result = await getLatestSensorSnapshotForOwnedTent(client, "tent-1", {
        now: new Date("2026-07-19T12:05:00Z"),
      });

      expect(result).toMatchObject({
        ok: true,
        data: { contradictionMetrics: ["humidity_pct"] },
      });
      expect(calls).toContainEqual({
        table: "sensor_readings",
        method: "in",
        args: ["source", expect.arrayContaining(["manual"])],
      });
      expect(
        calls
          .filter((call) => call.table === "sensor_readings" && call.method === "limit")
          .slice(0, OPERATOR_SENSOR_METRICS.length * 2)
          .map((call) => call.args),
      ).toEqual(Array.from({ length: OPERATOR_SENSOR_METRICS.length * 2 }, () => [26]));
    });

    it("does not count a diagnostic canonical source as represented during a proven overflow", async () => {
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        // These rows are supplied in the database query's DESC order. The
        // first 25 include a diagnostic manual row; the usable manual reading
        // is lookahead-only and needs source-specific recovery.
        rows: [
          ...Array.from({ length: 24 }, (_, index) =>
            row({
              id: `live-${index}`,
              metric: "humidity_pct",
              value: 60,
              source: "live",
              captured_at: "2026-07-19T12:03:00Z",
              ts: "2026-07-19T12:03:00Z",
            }),
          ),
          row({
            id: "manual-diagnostic",
            metric: "humidity_pct",
            value: 80,
            source: "manual",
            captured_at: "2026-07-19T12:02:00Z",
            ts: "2026-07-19T12:02:00Z",
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: { confidence: "test" },
            },
          }),
          row({
            id: "manual-physical",
            metric: "humidity_pct",
            value: 80,
            source: "manual",
            captured_at: "2026-07-19T12:01:00Z",
            ts: "2026-07-19T12:01:00Z",
          }),
        ],
      });

      await expect(
        getLatestSensorSnapshotForOwnedTent(client, "tent-1", {
          now: new Date("2026-07-19T12:05:00Z"),
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: { contradictionMetrics: ["humidity_pct"] },
      });
      expect(calls).toContainEqual({
        table: "sensor_readings",
        method: "in",
        args: ["source", expect.arrayContaining(["manual"])],
      });
    });

    it("recovers a legacy manual alias beyond overflow despite its newest diagnostic row", async () => {
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        rows: [
          ...Array.from({ length: 26 }, (_, index) =>
            row({
              id: `legacy-live-${index}`,
              metric: "humidity_pct",
              value: 60,
              source: "live",
              captured_at: null,
              ts: "2026-07-19T12:03:00Z",
            }),
          ),
          row({
            id: "legacy-manual-diagnostic",
            metric: "humidity_pct",
            value: 80,
            source: "manual",
            captured_at: null,
            ts: "2026-07-19T12:02:00Z",
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: { confidence: "test" },
            },
          }),
          row({
            id: "legacy-user-physical",
            metric: "humidity_pct",
            value: 80,
            source: "user",
            captured_at: null,
            ts: "2026-07-19T12:01:00Z",
          }),
        ],
      });

      await expect(
        getLatestSensorSnapshotForOwnedTent(client, "tent-1", {
          now: new Date("2026-07-19T12:05:00Z"),
        }),
      ).resolves.toMatchObject({
        ok: true,
        data: { contradictionMetrics: ["humidity_pct"] },
      });

      const manualSourceScope = calls.findIndex(
        (call) =>
          call.table === "sensor_readings" &&
          call.method === "in" &&
          call.args[0] === "source" &&
          Array.isArray(call.args[1]) &&
          call.args[1].includes("user"),
      );
      expect(manualSourceScope).toBeGreaterThanOrEqual(0);
      expect(
        calls
          .slice(manualSourceScope)
          .find((call) => call.table === "sensor_readings" && call.method === "limit")?.args,
      ).toEqual([25]);
    });

    it("does not fan out trusted-source reads when a metric branch is unsaturated", async () => {
      const { client, calls } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        rows: [row({ metric: "humidity_pct", value: 60 })],
      });

      await expect(getLatestSensorSnapshotForOwnedTent(client, "tent-1")).resolves.toMatchObject({
        ok: true,
      });
      expect(calls.some((call) => call.table === "sensor_readings" && call.method === "in")).toBe(
        false,
      );
    });

    it("fails closed after a proven overflow when a source recovery read is unavailable", async () => {
      const at = "2026-07-19T12:00:00Z";
      const { client } = sensorClient({
        tent: { id: "tent-1", name: "Home tent", grow_id: "grow-1" },
        queryErrorAt: OPERATOR_SENSOR_METRICS.length * 2,
        rows: Array.from({ length: 26 }, (_, index) =>
          row({
            id: `live-${index}`,
            metric: "humidity_pct",
            value: 60,
            source: "live",
            captured_at: at,
            ts: at,
          }),
        ),
      });

      await expect(getLatestSensorSnapshotForOwnedTent(client, "tent-1")).resolves.toEqual({
        ok: false,
        reason: "unavailable",
        message: "sensor query failed",
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
