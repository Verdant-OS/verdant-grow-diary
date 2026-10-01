import { describe, expect, it } from "vitest";
import { getLatestSensorSnapshotForOwnedTent } from "@/lib/operatorAccountReadModels";

const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = "2026-09-16T12:00:00.000Z";
const now = new Date("2026-09-17T18:00:00.000Z");
const row = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  user_id: owner,
  tent_id: tent,
  metric: "temperature_c",
  value: 26,
  quality: "ok",
  source: "manual",
  ts: at,
  captured_at: at,
  created_at: at,
  device_id: null,
  raw_payload: { secret: "never-export" },
  correction_valid: true,
};
function clientFor(data: unknown, failure?: "error" | "reject" | "owner") {
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      let metric = "",
        legacy = false;
      const q = {
        select: () => q,
        eq: (key: string, value: string) => {
          if (key === "metric") metric = value;
          return q;
        },
        is: () => {
          legacy = true;
          return q;
        },
        not: () => q,
        order: () => q,
        in: () => q,
        maybeSingle: async () => ({
          data: failure === "owner" ? null : { id: tent, grow_id: "grow-a", name: "Tent A" },
          error: null,
        }),
        limit: async () => {
          if (failure === "reject") throw new Error("private database detail");
          if (failure === "error")
            return { data: null, error: { message: "private database detail" } };
          if (table === "sensor_readings")
            return {
              data: (Array.isArray(data) && data.length === 0
                ? []
                : [{ ...row, value: 24 }]
              ).filter((r) => !legacy && r.metric === metric),
              error: null,
            };
          return {
            data: Array.isArray(data) ? data.filter((r) => !legacy && r.metric === metric) : data,
            error: null,
          };
        },
      };
      return q;
    },
  };
  return { client: client as never, tables };
}
describe("Operator effective sensor evidence", () => {
  it("returns corrected values at the original identity/time without promoting old manual evidence to live", async () => {
    const fixture = clientFor([row]);
    const result = await getLatestSensorSnapshotForOwnedTent(fixture.client, tent, { now });
    expect(result).toMatchObject({
      ok: true,
      data: {
        snapshot: {
          tentId: tent,
          readings: {
            temperature_c: {
              id: row.id,
              value: 26,
              source: "manual",
              ts: at,
              captured_at: at,
              current_live: false,
              freshness: "stale",
            },
          },
        },
      },
    });
    expect(fixture.tables).not.toContain("sensor_readings");
    expect(fixture.tables.slice(1).every((t) => t === "sensor_readings_effective")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/raw_payload|never-export|user_id|correction_valid/);
  });
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["invalid correction", [{ ...row, correction_valid: false }]],
    ["missing validity", [{ ...row, correction_valid: undefined }]],
    ["null value", [{ ...row, value: null }]],
    ["duplicate identity", [row, row]],
    ["wrong tent", [{ ...row, tent_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }]],
  ])("reports %s as unavailable without falling back to raw values", async (_label, data) => {
    const fixture = clientFor(data);
    const result = await getLatestSensorSnapshotForOwnedTent(fixture.client, tent, { now });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    expect(fixture.tables).not.toContain("sensor_readings");
  });
  it.each(["error", "reject"] as const)(
    "sanitizes %s failures and returns unavailable",
    async (failure) => {
      const fixture = clientFor([], failure);
      const result = await getLatestSensorSnapshotForOwnedTent(fixture.client, tent, { now });
      expect(result).toMatchObject({ ok: false, reason: "unavailable" });
      expect(JSON.stringify(result)).not.toContain("private database detail");
    },
  );
  it("retains successful empty reads", async () => {
    const fixture = clientFor([]);
    expect(await getLatestSensorSnapshotForOwnedTent(fixture.client, tent, { now })).toMatchObject({
      ok: true,
      data: { snapshot: null },
    });
  });
  it("checks owner visibility before reading any sensor evidence", async () => {
    const fixture = clientFor([row], "owner");
    expect(await getLatestSensorSnapshotForOwnedTent(fixture.client, tent, { now })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(fixture.tables).toEqual(["tents"]);
  });
});
