import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mapFeedingInputToRpcArgs,
  writeFeedingTypedEvent,
  type FeedingRpcClient,
  type FeedingTypedEventInput,
  type QuickLogFeedingEventRpcArgs,
} from "@/lib/writeFeedingTypedEvent";
import { ROOT_ZONE_PRODUCT_CAP } from "@/lib/rootZoneObservationRules";
import { getTypedEventWriteReadiness } from "@/lib/quickLogTypedEventPayloadRules";

const REPO_ROOT = resolve(__dirname, "..", "..");

function baseInput(overrides: Partial<FeedingTypedEventInput> = {}): FeedingTypedEventInput {
  return {
    idempotency_key: "feed-save-123",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    nutrient_line_id: "veg-week-3",
    products: [{ name: "CRONK Base A", amount: 2, unit: "ml_per_l" }],
    volume_ml: 750,
    occurred_at: "2026-06-12T10:00:00.000Z",
    note: "Leaves held posture after feed",
    ph: 6.1,
    ec_in: 1.6,
    ec_out: 1.9,
    runoff_ml: 250,
    runoff_ph: 6.4,
    runoff_ec: 2.1,
    water_temp_c: 21,
    ...overrides,
  };
}

function makeClient(
  result: { data?: unknown; error?: unknown } = {
    data: { ok: true, grow_event_id: "evt-uuid-123", reused: false },
  },
) {
  const rpc = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  const client: FeedingRpcClient = {
    rpc: rpc as unknown as FeedingRpcClient["rpc"],
  };
  return { client, rpc };
}

describe("feeding typed-event readiness", () => {
  it("keeps feeding marked rpc_available", () => {
    expect(getTypedEventWriteReadiness("feeding")).toBe("rpc_available");
  });
});

describe("mapFeedingInputToRpcArgs", () => {
  it("maps the complete feed into the atomic Quick Log payload", () => {
    const result = mapFeedingInputToRpcArgs(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expected: QuickLogFeedingEventRpcArgs = {
      p_idempotency_key: "feed-save-123",
      p_grow_id: "grow-1",
      p_event_type: "feeding",
      p_tent_id: "tent-1",
      p_plant_id: "plant-1",
      p_note: "Leaves held posture after feed",
      p_photo_url: null,
      p_sensor_snapshot: null,
      p_occurred_at: "2026-06-12T10:00:00.000Z",
      p_details: null,
      p_water: null,
      p_feed: {
        line_id: "veg-week-3",
        products: [{ name: "CRONK Base A", amount: 2, unit: "ml_per_l" }],
        volume_ml: 750,
        ph: 6.1,
        ec_in: 1.6,
        ec_out: 1.9,
        runoff_ml: 250,
        runoff_ph: 6.4,
        runoff_ec: 2.1,
        water_temp_c: 21,
      },
    };
    expect(result.args).toEqual(expected);
  });

  it("accepts line_id as an alias and preserves explicit nulls at the RPC boundary", () => {
    const result = mapFeedingInputToRpcArgs(
      baseInput({
        nutrient_line_id: undefined,
        line_id: "flower-1",
        tent_id: null,
        plant_id: undefined,
        note: "  ",
        occurred_at: null,
        ph: null,
        ec_in: undefined,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.p_tent_id).toBeNull();
    expect(result.args.p_plant_id).toBeNull();
    expect(result.args.p_note).toBeNull();
    expect(result.args.p_occurred_at).toBeNull();
    expect(result.args.p_feed.line_id).toBe("flower-1");
    expect(result.args.p_feed).not.toHaveProperty("ph");
    expect(result.args.p_feed).not.toHaveProperty("ec_in");
  });
});

describe("writeFeedingTypedEvent — validation", () => {
  it("rejects invalid identity and required evidence before the RPC", async () => {
    const cases: Array<[Partial<FeedingTypedEventInput>, string]> = [
      [{ idempotency_key: "short" }, "idempotency_key:invalid"],
      [{ grow_id: "   " }, "grow_id:missing"],
      [{ nutrient_line_id: null, line_id: null }, "line_id:missing"],
      [{ volume_ml: 0 }, "volume_ml:invalid"],
      [{ volume_ml: Number.NaN }, "volume_ml:invalid"],
      [{ volume_ml: 1_000_001 }, "volume_ml:invalid"],
      [{ occurred_at: 1e20 }, "occurred_at:invalid"],
    ];
    const { client, rpc } = makeClient();
    for (const [patch, reason] of cases) {
      expect(await writeFeedingTypedEvent(baseInput(patch), { client })).toEqual({
        ok: false,
        reason,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed, empty, and oversized product arrays", async () => {
    const { client, rpc } = makeClient();
    expect(
      await writeFeedingTypedEvent(baseInput({ products: { name: "x" } as unknown as unknown[] }), {
        client,
      }),
    ).toEqual({ ok: false, reason: "products:not_array" });
    expect(await writeFeedingTypedEvent(baseInput({ products: [] }), { client })).toEqual({
      ok: false,
      reason: "products:empty",
    });
    expect(
      await writeFeedingTypedEvent(
        baseInput({
          products: Array.from({ length: ROOT_ZONE_PRODUCT_CAP + 1 }, () => ({
            name: "Part",
          })),
        }),
        { client },
      ),
    ).toEqual({ ok: false, reason: "products:too_many" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-finite optional metrics", async () => {
    const { client, rpc } = makeClient();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(await writeFeedingTypedEvent(baseInput({ ec_in: bad }), { client })).toEqual({
        ok: false,
        reason: "numeric:not_finite",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects token-like product payloads", async () => {
    const { client, rpc } = makeClient();
    for (const products of [
      [{ name: "Base", api_key: "abc123" }],
      [{ name: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" }],
      [{ secret: "hunter2" }],
      [{ token: "sk_live_xyz" }],
    ]) {
      expect(await writeFeedingTypedEvent(baseInput({ products }), { client })).toEqual({
        ok: false,
        reason: "products:contains_secret",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("writeFeedingTypedEvent — RPC behavior", () => {
  it("returns the event id and replay state from a successful envelope", async () => {
    const { client, rpc } = makeClient({
      data: { ok: true, grow_event_id: "evt-uuid-123", reused: true },
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: true,
      eventId: "evt-uuid-123",
      reused: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("quicklog_save_event");
  });

  it("fails closed on a server rejection without exposing its raw reason", async () => {
    const { client } = makeClient({
      data: { ok: false, reason: "grow_not_owned" },
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: false,
      reason: "rpc:rejected",
    });
  });

  it("surfaces transport errors safely", async () => {
    const { client } = makeClient({
      error: { message: "permission denied for table feeding_events" },
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: false,
      reason: "rpc:error",
    });

    const throwingClient: FeedingRpcClient = {
      rpc: vi.fn().mockRejectedValue(new Error("boom")) as unknown as FeedingRpcClient["rpc"],
    };
    expect(await writeFeedingTypedEvent(baseInput(), { client: throwingClient })).toEqual({
      ok: false,
      reason: "rpc:error",
    });
  });

  it("rejects a malformed success envelope with no event id", async () => {
    const { client } = makeClient({ data: { ok: true, reused: false } });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: false,
      reason: "rpc:no_event_id",
    });
  });
});

describe("writeFeedingTypedEvent — static safety guards", () => {
  it("uses only the atomic Quick Log RPC and never writes tables directly", () => {
    const src = readFileSync(resolve(REPO_ROOT, "src/lib/writeFeedingTypedEvent.ts"), "utf8");
    expect(src).toMatch(/client\.rpc\("quicklog_save_event"/);
    expect(src).not.toMatch(/create_feeding_event/);
    expect(src).not.toMatch(/\.from\(\s*["'](?:feeding_events|grow_events)["']\s*\)/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|createClient\s*\(/);
  });
});
