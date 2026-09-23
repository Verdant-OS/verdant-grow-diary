import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlantMemoryEpisodes } from "@/lib/plantMemoryEpisodeService";

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));

const TENT = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ROOT = "33333333-3333-4333-8333-333333333333";
const OBSERVED = "2026-07-01T11:00:00.000Z";
const args = {
  growId: "grow-1",
  plantId: "plant-1",
  includeSensorEvidence: true,
  nowIso: "2026-07-02T12:00:00.000Z",
};
const action = {
  id: "action-1",
  grow_id: "grow-1",
  tent_id: TENT,
  plant_id: "plant-1",
  source: "manual",
  target_metric: "temperature_c",
  suggested_change: null,
  reason: "Grower adjustment",
  status: "completed",
  completed_at: "2026-07-01T12:00:00.000Z",
};
const row = () => ({
  id: ROOT,
  user_id: OWNER,
  tent_id: TENT,
  metric: "temperature_c",
  value: 24,
  ts: OBSERVED,
  captured_at: OBSERVED,
  created_at: OBSERVED,
  device_id: null,
  source: "manual",
  quality: "ok",
  raw_payload: {},
  correction_valid: true,
});
type Result = { data: unknown; error: unknown; rejection?: Error };
type Fixtures = Record<string, Result>;
const fixtures = (): Fixtures => ({
  action_queue: { data: [action], error: null },
  diary_entries: { data: [], error: null },
  sensor_readings_effective: { data: [row()], error: null },
  // A legacy replacement is deliberately different. It must never be used as a new observation.
  sensor_readings: {
    data: [
      {
        ...row(),
        id: "44444444-4444-4444-8444-444444444444",
        captured_at: "2026-07-01T13:00:00.000Z",
      },
    ],
    error: null,
  },
});
function arrange(values = fixtures()) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  mock.from.mockImplementation((table: string) => {
    const result = values[table] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "in", "gte", "lte", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    for (const method of ["insert", "update", "delete", "upsert", "rpc"]) {
      chain[method] = () => {
        throw new Error("Forbidden write: " + method);
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      (result.rejection ? Promise.reject(result.rejection) : Promise.resolve(result)).then(
        resolve,
        reject,
      );
    return chain;
  });
  return calls;
}
beforeEach(() => vi.clearAllMocks());

describe("Plant Memory episode effective evidence read", () => {
  it("uses the corrected root identity at its original observation time and preserves manual source", async () => {
    const calls = arrange();
    const result = await loadPlantMemoryEpisodes(args);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected episodes");
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].evidence.sensorSnapshots).toEqual([
      expect.objectContaining({
        snapshotId: ROOT,
        capturedAt: OBSERVED,
        tentId: TENT,
        source: "manual",
        window: "before",
        usable: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("raw_payload");
    expect(mock.from.mock.calls.map((c) => c[0])).toEqual([
      "action_queue",
      "diary_entries",
      "sensor_readings_effective",
    ]);
    expect(calls).toContainEqual({
      table: "action_queue",
      method: "eq",
      args: ["grow_id", "grow-1"],
    });
    expect(calls).toContainEqual({
      table: "action_queue",
      method: "eq",
      args: ["plant_id", "plant-1"],
    });
    expect(calls).toContainEqual({
      table: "sensor_readings_effective",
      method: "in",
      args: ["tent_id", [TENT]],
    });
    expect(calls).toContainEqual({
      table: "sensor_readings_effective",
      method: "limit",
      args: [200],
    });
    expect(
      calls.filter(
        (c) => c.table === "sensor_readings_effective" && ["gte", "lte"].includes(c.method),
      ),
    ).toHaveLength(2);
  });

  it.each(["action_queue", "diary_entries", "sensor_readings_effective"])(
    "distinguishes null %s from successful empty",
    async (table) => {
      const values = fixtures();
      values[table] = { data: null, error: null };
      arrange(values);
      expect(await loadPlantMemoryEpisodes(args)).toEqual({
        status: "error",
        message: "Could not load learning episodes. Try again shortly.",
      });
    },
  );

  it.each(["action_queue", "diary_entries", "sensor_readings_effective"])(
    "sanitizes a failed %s read",
    async (table) => {
      const values = fixtures();
      values[table] = { data: [], error: { message: "PRIVATE provider error" } };
      arrange(values);
      expect(await loadPlantMemoryEpisodes(args)).toEqual({
        status: "error",
        message: "Could not load learning episodes. Try again shortly.",
      });
    },
  );

  it.each(["action_queue", "diary_entries", "sensor_readings_effective"])(
    "sanitizes a rejected %s request",
    async (table) => {
      const values = fixtures();
      values[table] = { data: null, error: null, rejection: new Error("PRIVATE transport error") };
      arrange(values);
      expect(await loadPlantMemoryEpisodes(args)).toEqual({
        status: "error",
        message: "Could not load learning episodes. Try again shortly.",
      });
    },
  );

  it.each([
    ["invalid correction", [{ ...row(), correction_valid: false }]],
    ["missing validity", [{ ...row(), correction_valid: undefined }]],
    ["duplicate identity", [row(), row()]],
    ["invalid observation time", [{ ...row(), captured_at: "bad-time" }]],
  ])("rejects %s instead of presenting unverified evidence", async (_label, data) => {
    const values = fixtures();
    values.sensor_readings_effective.data = data;
    arrange(values);
    expect(await loadPlantMemoryEpisodes(args)).toMatchObject({ status: "error" });
  });

  it("short-circuits a successful empty action read", async () => {
    const values = fixtures();
    values.action_queue.data = [];
    arrange(values);
    expect(await loadPlantMemoryEpisodes(args)).toEqual({ status: "ok", episodes: [] });
    expect(mock.from.mock.calls.map((c) => c[0])).toEqual(["action_queue"]);
  });

  it("preserves successful empty sensor evidence", async () => {
    const values = fixtures();
    values.sensor_readings_effective.data = [];
    values.sensor_readings.data = [];
    arrange(values);
    const result = await loadPlantMemoryEpisodes(args);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.episodes[0].evidence.sensorSnapshots).toEqual([]);
  });

  it("does not request sensors when the caller omits sensor context", async () => {
    arrange();
    expect((await loadPlantMemoryEpisodes({ ...args, includeSensorEvidence: false })).status).toBe(
      "ok",
    );
    expect(mock.from.mock.calls.map((c) => c[0])).toEqual(["action_queue", "diary_entries"]);
  });

  it("preserves the diagnostic provenance fence", async () => {
    const values = fixtures();
    values.sensor_readings_effective.data = [
      {
        ...row(),
        source: "live",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test", verdant_source: "live" },
        },
      },
    ];
    arrange(values);
    const result = await loadPlantMemoryEpisodes(args);
    expect(result.status).toBe("ok");
    if (result.status === "ok")
      expect(result.episodes[0].evidence.sensorSnapshots).toEqual([
        expect.objectContaining({ source: "demo", usable: false, status: "needs_review" }),
      ]);
    expect(JSON.stringify(result)).not.toContain("raw_payload");
  });

  it("is deterministic for the same rows and injected clock", async () => {
    arrange();
    const a = await loadPlantMemoryEpisodes(args);
    arrange();
    const b = await loadPlantMemoryEpisodes(args);
    expect(b).toEqual(a);
  });
});
