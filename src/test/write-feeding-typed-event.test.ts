import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  writeFeedingTypedEvent,
  mapFeedingInputToRpcArgs,
  type FeedingRpcClient,
  type FeedingTypedEventInput,
  type CreateFeedingEventRpcArgs,
} from "@/lib/writeFeedingTypedEvent";
import { getTypedEventWriteReadiness } from "@/lib/quickLogTypedEventPayloadRules";

const REPO_ROOT = resolve(__dirname, "..", "..");

function baseInput(
  overrides: Partial<FeedingTypedEventInput> = {},
): FeedingTypedEventInput {
  return {
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    nutrient_line_id: "veg-week-3",
    products: [{ name: "Base A", ml_per_l: 2 }],
    occurred_at: "2026-06-12T10:00:00.000Z",
    note: "ok",
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
  result: { data?: unknown; error?: unknown } = { data: "evt-uuid-123" },
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
  it("flips feeding to rpc_available", () => {
    expect(getTypedEventWriteReadiness("feeding")).toBe("rpc_available");
  });
});

describe("mapFeedingInputToRpcArgs", () => {
  it("maps a full app payload to RPC args using correct underscore names", () => {
    const r = mapFeedingInputToRpcArgs(baseInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected: CreateFeedingEventRpcArgs = {
      _grow_id: "grow-1",
      _line_id: "veg-week-3",
      _products: [{ name: "Base A", ml_per_l: 2 }],
      _tent_id: "tent-1",
      _plant_id: "plant-1",
      _occurred_at: "2026-06-12T10:00:00.000Z",
      _note: "ok",
      _ph: 6.1,
      _ec_in: 1.6,
      _ec_out: 1.9,
      _runoff_ml: 250,
      _runoff_ph: 6.4,
      _runoff_ec: 2.1,
      _water_temp_c: 21,
    };
    expect(r.args).toEqual(expected);
  });

  it("accepts `line_id` as an alias for `nutrient_line_id`", () => {
    const r = mapFeedingInputToRpcArgs(
      baseInput({ nutrient_line_id: undefined, line_id: "flower-1" }),
    );
    expect(r.ok && r.args._line_id).toBe("flower-1");
  });

  it("omits optional fields when null/undefined", () => {
    const r = mapFeedingInputToRpcArgs({
      grow_id: "g",
      nutrient_line_id: "l",
      products: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.args).toEqual({
      _grow_id: "g",
      _line_id: "l",
      _products: [],
    });
  });
});

describe("writeFeedingTypedEvent — validation", () => {
  it("rejects missing grow_id", async () => {
    const { client, rpc } = makeClient();
    const r = await writeFeedingTypedEvent(
      baseInput({ grow_id: "   " }),
      { client },
    );
    expect(r).toEqual({ ok: false, reason: "grow_id:missing" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects missing nutrient line id", async () => {
    const { client, rpc } = makeClient();
    const r = await writeFeedingTypedEvent(
      baseInput({ nutrient_line_id: null, line_id: null }),
      { client },
    );
    expect(r).toEqual({ ok: false, reason: "line_id:missing" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-array products", async () => {
    const { client, rpc } = makeClient();
    const r = await writeFeedingTypedEvent(
      baseInput({ products: { name: "x" } as unknown as unknown[] }),
      { client },
    );
    expect(r).toEqual({ ok: false, reason: "products:not_array" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-finite numeric fields", async () => {
    const { client, rpc } = makeClient();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = await writeFeedingTypedEvent(
        baseInput({ ec_in: bad }),
        { client },
      );
      expect(r).toEqual({ ok: false, reason: "numeric:not_finite" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects product payloads containing token-like strings", async () => {
    const { client, rpc } = makeClient();
    const tokenSamples: unknown[][] = [
      [{ name: "Base", api_key: "abc123" }],
      [{ name: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" }],
      [{ secret: "hunter2" }],
      [{ name: "x", auth: "Bearer foo" }],
      [{ token: "sk_live_xyz" }],
    ];
    for (const products of tokenSamples) {
      const r = await writeFeedingTypedEvent(
        baseInput({ products }),
        { client },
      );
      expect(r).toEqual({ ok: false, reason: "products:contains_secret" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("writeFeedingTypedEvent — RPC behavior", () => {
  it("returns the new event uuid on success", async () => {
    const { client, rpc } = makeClient({ data: "evt-uuid-123" });
    const r = await writeFeedingTypedEvent(baseInput(), { client });
    expect(r).toEqual({ ok: true, eventId: "evt-uuid-123" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("create_feeding_event");
  });

  it("surfaces RPC errors safely without echoing raw messages", async () => {
    const { client } = makeClient({
      data: null,
      error: { message: "permission denied for table feeding_events" },
    });
    const r = await writeFeedingTypedEvent(baseInput(), { client });
    expect(r).toEqual({ ok: false, reason: "rpc:error" });
  });

  it("returns rpc:error when the client throws", async () => {
    const client: FeedingRpcClient = {
      rpc: vi.fn().mockRejectedValue(new Error("boom")) as unknown as FeedingRpcClient["rpc"],
    };
    const r = await writeFeedingTypedEvent(baseInput(), { client });
    expect(r).toEqual({ ok: false, reason: "rpc:error" });
  });

  it("returns rpc:no_event_id when RPC returns no string", async () => {
    const { client } = makeClient({ data: null });
    const r = await writeFeedingTypedEvent(baseInput(), { client });
    expect(r).toEqual({ ok: false, reason: "rpc:no_event_id" });
  });
});

describe("writeFeedingTypedEvent — static safety guards", () => {
  it("never writes directly to feeding_events or grow_events", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/lib/writeFeedingTypedEvent.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\.from\(\s*["']feeding_events["']\s*\)/);
    expect(src).not.toMatch(/\.from\(\s*["']grow_events["']\s*\)/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/service_role/i);
  });

  it("only references the create_feeding_event RPC, no other create_* RPCs", () => {
    const src = readFileSync(
      resolve(REPO_ROOT, "src/lib/writeFeedingTypedEvent.ts"),
      "utf8",
    );
    expect(src).toMatch(/create_feeding_event/);
    for (const other of [
      "create_watering_event",
      "create_photo_event",
      "create_observation_event",
      "create_training_event",
      "create_environment_event",
    ]) {
      expect(src.includes(other)).toBe(false);
    }
  });
});
