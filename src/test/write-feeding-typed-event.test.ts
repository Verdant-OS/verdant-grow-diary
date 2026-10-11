import { describe, expect, it, vi } from "vitest";
import { TYPED_REUSED_RECEIPT_READ_DEADLINE_MS } from "@/lib/quickLogTypedReusedReceiptService";
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

describe("typed Feed permanent refusal boundary", () => {
  const reasons = [
    "idempotency_key_unverified",
    "idempotency_receipt_missing",
    "idempotency_key_retracted",
    "idempotency_key_conflict",
  ];
  it.each(reasons)("preserves the explicit %s server refusal", async (reason) => {
    const { client, rpc } = makeClient({ data: { ok: false, reason } });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({ ok: false, reason });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe("feed-save-123");
  });
  it.each([null, undefined, "unknown", "plant_tent_grow_mismatch", 42])(
    "keeps unknown or repairable rejection %s generic",
    async (reason) => {
      const { client } = makeClient({ data: { ok: false, reason } });
      expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
        ok: false,
        reason: "rpc:rejected",
      });
    },
  );
  it.each([undefined, null, "false", 0])(
    "does not infer permanent refusal from malformed ok=%s",
    async (ok) => {
      const { client } = makeClient({ data: { ok, reason: "idempotency_key_retracted" } });
      expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
        ok: false,
        reason: "rpc:rejected",
      });
    },
  );
  it("does not override an accepted receipt with a stray refusal reason", async () => {
    const { client } = makeClient({
      data: {
        ok: true,
        grow_event_id: "aaaaaaaa-3333-4333-8333-333333333333",
        reason: "idempotency_key_retracted",
      },
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: true,
      eventId: "aaaaaaaa-3333-4333-8333-333333333333",
      reused: false,
    });
  });
  it("keeps an RPC transport error uncertain even if its data contains a refusal", async () => {
    const { client } = makeClient({
      data: { ok: false, reason: "idempotency_key_retracted" },
      error: new Error("network"),
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
      ok: false,
      reason: "rpc:error",
    });
  });
});

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
    data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: false },
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
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
    });
    const reusedEventReader = vi.fn().mockResolvedValue({
      data: {
        id: "77777777-7777-4777-8777-000000000001",
        event_type: "feeding",
        source: "manual",
        is_deleted: false,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
      },
      error: null,
    });
    const reusedChildReader = vi.fn().mockResolvedValue({
      data: {
        event_id: "77777777-7777-4777-8777-000000000001",
        volume_ml: 750,
        line_id: "veg-week-3",
      },
      error: null,
    });
    expect(
      await writeFeedingTypedEvent(baseInput(), { client, reusedEventReader, reusedChildReader }),
    ).toEqual({
      ok: true,
      eventId: "77777777-7777-4777-8777-000000000001",
      reused: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(reusedEventReader).toHaveBeenCalledWith("77777777-7777-4777-8777-000000000001");
    expect(reusedChildReader).toHaveBeenCalledWith(
      "feeding",
      "77777777-7777-4777-8777-000000000001",
    );
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

describe("receipt identity", () => {
  it("does not confirm a reused Feeding that was retracted after its first save", async () => {
    const { client } = makeClient({
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
    });
    const reusedEventReader = vi.fn().mockResolvedValue({
      data: {
        id: "77777777-7777-4777-8777-000000000001",
        event_type: "feeding",
        source: "manual",
        is_deleted: true,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
      },
      error: null,
    });
    expect(await writeFeedingTypedEvent(baseInput(), { client, reusedEventReader })).toEqual({
      ok: false,
      reason: "rpc:receipt_unverified",
    });
  });

  describe("unverifiable reused Feeding receipts stay retryable", () => {
    const activeEvent = {
      data: {
        id: "77777777-7777-4777-8777-000000000001",
        event_type: "feeding",
        source: "manual",
        is_deleted: false,
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
      },
      error: null,
    };
    const reusedReply = {
      data: { ok: true, grow_event_id: "77777777-7777-4777-8777-000000000001", reused: true },
    };

    it.each([
      ["a missing typed child", { data: null, error: null }],
      ["a child read error", { data: null, error: { message: "read failed" } }],
    ])("returns rpc:receipt_unverified for %s", async (_label, childRead) => {
      const { client } = makeClient(reusedReply);
      const reusedEventReader = vi.fn().mockResolvedValue(activeEvent);
      const reusedChildReader = vi.fn().mockResolvedValue(childRead);
      expect(
        await writeFeedingTypedEvent(baseInput(), { client, reusedEventReader, reusedChildReader }),
      ).toEqual({ ok: false, reason: "rpc:receipt_unverified" });
      expect(reusedChildReader).toHaveBeenCalledWith(
        "feeding",
        "77777777-7777-4777-8777-000000000001",
      );
    });

    it.each([
      ["an event read error", vi.fn().mockResolvedValue({ data: null, error: { message: "x" } })],
      ["a thrown event read", vi.fn().mockRejectedValue(new Error("network"))],
    ])("returns rpc:receipt_unverified for %s without reading the child", async (_l, reader) => {
      const { client } = makeClient(reusedReply);
      const reusedChildReader = vi.fn().mockResolvedValue({
        data: {
          event_id: "77777777-7777-4777-8777-000000000001",
          volume_ml: 750,
          line_id: "veg-week-3",
        },
        error: null,
      });
      expect(
        await writeFeedingTypedEvent(baseInput(), {
          client,
          reusedEventReader: reader,
          reusedChildReader,
        }),
      ).toEqual({ ok: false, reason: "rpc:receipt_unverified" });
      expect(reusedChildReader).not.toHaveBeenCalled();
    });
  });

  it.each(["not-an-event", "", " ", null, undefined, 42, {}])(
    "rejects malformed event ID %j",
    async (id) => {
      const { client } = makeClient({ data: { ok: true, grow_event_id: id } });
      expect(await writeFeedingTypedEvent(baseInput(), { client })).toEqual({
        ok: false,
        reason: "rpc:no_event_id",
      });
    },
  );
});
