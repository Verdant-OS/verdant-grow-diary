import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  mapWateringInputToRpcArgs,
  writeQuickLogWateringTypedEvent,
  type QuickLogWateringEventRpcArgs,
  type WateringRpcClient,
  type WateringTypedEventInput,
} from "@/lib/writeQuickLogWateringTypedEvent";

const REPO_ROOT = resolve(__dirname, "..", "..");

function baseInput(overrides: Partial<WateringTypedEventInput> = {}): WateringTypedEventInput {
  return {
    idempotency_key: "water-save-123",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    occurred_at: "2026-07-20T10:30:00.000Z",
    note: "Pot felt light before watering",
    volume_ml: 750,
    ph: 6.2,
    ec_ms_cm: 2,
    runoff_ml: 175,
    runoff_ph: 6.4,
    runoff_ec: 1.7,
    water_temp_c: 21.5,
    sensor_snapshot: {
      source: "manual",
      captured_at: "2026-07-20T10:30:00.000Z",
      metrics: { temperature_c: 24.5, humidity_pct: 61, vpd_kpa: 1.2 },
    },
    details: {
      root_zone_manual_observation_v1: {
        schema_version: 1,
        source: "manual",
        evidence_type: "root_zone_manual_observation",
        advisory_only: true,
        observed_at: "2026-07-20T10:30:00.000Z",
        pot_weight_feel: "light",
      },
    },
    ...overrides,
  };
}

function makeClient(
  result: { data?: unknown; error?: unknown } = {
    data: { ok: true, grow_event_id: "event-1", reused: false },
  },
) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  const client: WateringRpcClient = {
    rpc: rpc as unknown as WateringRpcClient["rpc"],
  };
  return { client, rpc };
}

describe("mapWateringInputToRpcArgs", () => {
  it("maps the full record to the existing atomic Quick Log RPC exactly", () => {
    const result = mapWateringInputToRpcArgs(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expected: QuickLogWateringEventRpcArgs = {
      p_idempotency_key: "water-save-123",
      p_grow_id: "grow-1",
      p_event_type: "watering",
      p_tent_id: "tent-1",
      p_plant_id: "plant-1",
      p_note: "Pot felt light before watering",
      p_photo_url: null,
      p_sensor_snapshot: {
        source: "manual",
        captured_at: "2026-07-20T10:30:00.000Z",
        metrics: { temperature_c: 24.5, humidity_pct: 61, vpd_kpa: 1.2 },
      },
      p_occurred_at: "2026-07-20T10:30:00.000Z",
      p_details: {
        root_zone_manual_observation_v1: {
          schema_version: 1,
          source: "manual",
          evidence_type: "root_zone_manual_observation",
          advisory_only: true,
          observed_at: "2026-07-20T10:30:00.000Z",
          pot_weight_feel: "light",
        },
      },
      p_water: {
        volume_ml: 750,
        ph: 6.2,
        ec_ms_cm: 2,
        runoff_ml: 175,
        runoff_ph: 6.4,
        runoff_ec: 1.7,
        water_temp_c: 21.5,
      },
      p_feed: null,
    };

    expect(result.args).toEqual(expected);
  });

  it("trims identifiers and note while preserving explicit nulls", () => {
    const result = mapWateringInputToRpcArgs(
      baseInput({
        idempotency_key: "  water-save-123  ",
        grow_id: " grow-1 ",
        tent_id: " ",
        plant_id: undefined,
        note: "  ",
        occurred_at: null,
        ph: null,
        ec_ms_cm: undefined,
        sensor_snapshot: null,
        details: null,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args).toMatchObject({
      p_idempotency_key: "water-save-123",
      p_grow_id: "grow-1",
      p_tent_id: null,
      p_plant_id: null,
      p_note: null,
      p_occurred_at: null,
      p_sensor_snapshot: null,
      p_details: null,
    });
    expect(result.args.p_water).not.toHaveProperty("ph");
    expect(result.args.p_water).not.toHaveProperty("ec_ms_cm");
  });

  it("normalizes date and numeric timestamps to ISO", () => {
    const dateResult = mapWateringInputToRpcArgs(
      baseInput({ occurred_at: new Date("2026-07-20T10:30:00.000Z") }),
    );
    const numberResult = mapWateringInputToRpcArgs(
      baseInput({ occurred_at: Date.parse("2026-07-20T10:30:00.000Z") }),
    );

    expect(dateResult.ok && dateResult.args.p_occurred_at).toBe("2026-07-20T10:30:00.000Z");
    expect(numberResult.ok && numberResult.args.p_occurred_at).toBe("2026-07-20T10:30:00.000Z");
  });

  it("is deterministic and leaves nested evidence untouched", () => {
    const input = baseInput();
    const before = structuredClone(input);
    const first = mapWateringInputToRpcArgs(input);
    const second = mapWateringInputToRpcArgs(input);

    expect(first).toEqual(second);
    expect(input).toEqual(before);
  });
});

describe("writeQuickLogWateringTypedEvent — validation", () => {
  it.each([
    [{ idempotency_key: "short" }, "idempotency_key:invalid"],
    [{ idempotency_key: "x".repeat(201) }, "idempotency_key:invalid"],
    [{ grow_id: "  " }, "grow_id:missing"],
    [{ volume_ml: 0 }, "volume_ml:invalid"],
    [{ volume_ml: -1 }, "volume_ml:invalid"],
    [{ volume_ml: 1_000_001 }, "volume_ml:invalid"],
    [{ volume_ml: Number.NaN }, "volume_ml:invalid"],
    [{ occurred_at: "not-a-date" }, "occurred_at:invalid"],
    [{ note: "x".repeat(501) }, "note:invalid"],
  ] as const)("rejects invalid required/input evidence before RPC", async (patch, reason) => {
    const { client, rpc } = makeClient();

    expect(
      await writeQuickLogWateringTypedEvent(baseInput(patch as Partial<WateringTypedEventInput>), {
        client,
      }),
    ).toEqual({ ok: false, reason });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite optional metric %s",
    async (bad) => {
      const { client, rpc } = makeClient();
      expect(
        await writeQuickLogWateringTypedEvent(baseInput({ runoff_ec: bad }), { client }),
      ).toEqual({ ok: false, reason: "numeric:not_finite" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ ph: -0.01 }, "numeric:out_of_range"],
    [{ ph: 14.01 }, "numeric:out_of_range"],
    [{ ec_ms_cm: 10.01 }, "numeric:out_of_range"],
    [{ runoff_ml: -0.01 }, "numeric:out_of_range"],
    [{ runoff_ph: 14.01 }, "numeric:out_of_range"],
    [{ runoff_ec: 10.01 }, "numeric:out_of_range"],
    [{ water_temp_c: 60.01 }, "numeric:out_of_range"],
  ] as const)("rejects an out-of-band root-zone value", async (patch, reason) => {
    const { client, rpc } = makeClient();
    expect(
      await writeQuickLogWateringTypedEvent(baseInput(patch as Partial<WateringTypedEventInput>), {
        client,
      }),
    ).toEqual({ ok: false, reason });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts inclusive root-zone boundaries and a 500-character note", async () => {
    const { client, rpc } = makeClient();
    const result = await writeQuickLogWateringTypedEvent(
      baseInput({
        volume_ml: 1_000_000,
        ph: 0,
        ec_ms_cm: 10,
        runoff_ml: 0,
        runoff_ph: 14,
        runoff_ec: 0,
        water_temp_c: -10,
        note: "x".repeat(500),
      }),
      { client },
    );

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      { source: "live", captured_at: "2026-07-20T10:30:00.000Z", metrics: { temperature_c: 24 } },
      "wrong source",
    ],
    [{ source: "manual", captured_at: "bad", metrics: { temperature_c: 24 } }, "bad time"],
    [{ source: "manual", captured_at: "2026-07-20T10:30:00.000Z", metrics: {} }, "empty"],
    [
      { source: "manual", captured_at: "2026-07-20T10:30:00.000Z", metrics: { co2_ppm: 900 } },
      "unknown metric",
    ],
    [
      { source: "manual", captured_at: "2026-07-20T10:30:00.000Z", metrics: { humidity_pct: 101 } },
      "out of range",
    ],
    [
      {
        source: "manual",
        captured_at: "2026-07-20T10:30:00.000Z",
        metrics: { vpd_kpa: Number.NaN },
      },
      "non-finite",
    ],
  ])("rejects invalid manual sensor snapshot (%s)", async (snapshot, _label) => {
    const { client, rpc } = makeClient();
    expect(
      await writeQuickLogWateringTypedEvent(
        baseInput({
          sensor_snapshot: snapshot as WateringTypedEventInput["sensor_snapshot"],
        }),
        { client },
      ),
    ).toEqual({ ok: false, reason: "sensor_snapshot:invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe, malformed, circular, and oversized details", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const cases: unknown[] = [
      [] as unknown[],
      { user_id: "other-user" },
      { auth_uid: "other-user" },
      { payload: "x".repeat(20_001) },
      circular,
    ];

    for (const details of cases) {
      const { client, rpc } = makeClient();
      expect(
        await writeQuickLogWateringTypedEvent(
          baseInput({ details: details as Record<string, unknown> }),
          { client },
        ),
      ).toEqual({ ok: false, reason: "details:invalid" });
      expect(rpc).not.toHaveBeenCalled();
    }
  });
});

describe("writeQuickLogWateringTypedEvent — RPC behavior and idempotency", () => {
  it("returns event identity and reuse state from a successful envelope", async () => {
    const { client, rpc } = makeClient({
      data: { ok: true, grow_event_id: "event-1", reused: true },
    });

    expect(await writeQuickLogWateringTypedEvent(baseInput(), { client })).toEqual({
      ok: true,
      eventId: "event-1",
      reused: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("quicklog_save_event", expect.any(Object));
  });

  it("reuses the exact idempotency key and RPC args on a logical retry", async () => {
    const { client, rpc } = makeClient({
      data: { ok: true, grow_event_id: "event-1", reused: true },
    });
    const input = baseInput({ idempotency_key: "stable-water-retry" });

    await writeQuickLogWateringTypedEvent(input, { client });
    await writeQuickLogWateringTypedEvent(input, { client });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe("stable-water-retry");
  });

  it("fails closed on rejected and malformed envelopes", async () => {
    const rejected = makeClient({ data: { ok: false, reason: "grow_not_owned" } });
    const missingId = makeClient({ data: { ok: true, reused: false } });
    const malformed = makeClient({ data: ["unexpected"] });

    expect(await writeQuickLogWateringTypedEvent(baseInput(), { client: rejected.client })).toEqual(
      {
        ok: false,
        reason: "rpc:rejected",
      },
    );
    expect(
      await writeQuickLogWateringTypedEvent(baseInput(), { client: missingId.client }),
    ).toEqual({
      ok: false,
      reason: "rpc:no_event_id",
    });
    expect(
      await writeQuickLogWateringTypedEvent(baseInput(), { client: malformed.client }),
    ).toEqual({
      ok: false,
      reason: "rpc:rejected",
    });
  });

  it("turns transport and thrown errors into a safe reason", async () => {
    const errored = makeClient({ error: { message: "permission denied" } });
    const throwingClient: WateringRpcClient = {
      rpc: vi.fn().mockRejectedValue(new Error("boom")) as unknown as WateringRpcClient["rpc"],
    };

    expect(await writeQuickLogWateringTypedEvent(baseInput(), { client: errored.client })).toEqual({
      ok: false,
      reason: "rpc:error",
    });
    expect(await writeQuickLogWateringTypedEvent(baseInput(), { client: throwingClient })).toEqual({
      ok: false,
      reason: "rpc:error",
    });
  });
});

describe("writeQuickLogWateringTypedEvent — static safety", () => {
  it("uses only quicklog_save_event and never invokes the dormant watering RPC or direct writes", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/lib/writeQuickLogWateringTypedEvent.ts"),
      "utf8",
    );

    expect(source).toMatch(/client\.rpc\("quicklog_save_event"/);
    expect(source).not.toMatch(/create_watering_event/);
    expect(source).not.toMatch(
      /\.from\(\s*["'](?:watering_events|grow_events|diary_entries)["']\s*\)/,
    );
    expect(source).not.toMatch(/\.(?:insert|update|delete|upsert)\s*\(/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createClient\s*\(/);
    expect(source).not.toMatch(/device_command|action_queue|create_alert/);
  });
});
