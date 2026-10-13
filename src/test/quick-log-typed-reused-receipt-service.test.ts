import { beforeEach, describe, expect, it, vi } from "vitest";

const singletonFrom = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: singletonFrom } }));

import {
  readTypedQuickLogEvent,
  resolveTypedReceiptReaders,
} from "@/lib/quickLogTypedReusedReceiptService";
import { writeFeedingTypedEvent, type FeedingRpcClient } from "@/lib/writeFeedingTypedEvent";
import {
  writeQuickLogWateringTypedEvent,
  type WateringRpcClient,
} from "@/lib/writeQuickLogWateringTypedEvent";

const EVENT_ID = "77777777-7777-4777-8777-000000000001";

function rowsFrom(rows: Record<string, unknown>) {
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }),
      }),
    };
  });
  return { from, tables };
}

const reusedRpc = () =>
  vi.fn().mockResolvedValue({
    data: { ok: true, grow_event_id: EVENT_ID, reused: true },
    error: null,
  });

function activeEvent(eventType: "watering" | "feeding") {
  return {
    id: EVENT_ID,
    event_type: eventType,
    source: "manual",
    is_deleted: false,
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
  };
}

const feedInput = {
  idempotency_key: "feed-save-123",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  nutrient_line_id: "veg-week-3",
  products: [{ name: "CRONK Base A", amount: 2, unit: "ml_per_l" }],
  volume_ml: 750,
};

const waterInput = {
  idempotency_key: "water-save-123",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  volume_ml: 750,
};

beforeEach(() => singletonFrom.mockReset());

describe("typed reused-receipt readback honors the injected client", () => {
  it("reads a reused Feed receipt through the injected client, not the singleton", async () => {
    const { from, tables } = rowsFrom({
      grow_events: activeEvent("feeding"),
      feeding_events: { event_id: EVENT_ID, volume_ml: 750, line_id: "veg-week-3" },
    });
    const client = { rpc: reusedRpc(), from } as unknown as FeedingRpcClient;
    expect(await writeFeedingTypedEvent(feedInput, { client })).toEqual({
      ok: true,
      eventId: EVENT_ID,
      reused: true,
    });
    expect(tables).toEqual(["grow_events", "feeding_events"]);
    expect(singletonFrom).not.toHaveBeenCalled();
  });

  it("reads a reused Water receipt through the injected client, not the singleton", async () => {
    const { from, tables } = rowsFrom({
      grow_events: activeEvent("watering"),
      watering_events: { event_id: EVENT_ID, volume_ml: 750 },
    });
    const client = { rpc: reusedRpc(), from } as unknown as WateringRpcClient;
    expect(await writeQuickLogWateringTypedEvent(waterInput, { client })).toEqual({
      ok: true,
      eventId: EVENT_ID,
      reused: true,
    });
    expect(tables).toEqual(["grow_events", "watering_events"]);
    expect(singletonFrom).not.toHaveBeenCalled();
  });

  it("fails closed when an injected client cannot read, without touching the singleton", async () => {
    const feedClient = { rpc: reusedRpc() } as unknown as FeedingRpcClient;
    const waterClient = { rpc: reusedRpc() } as unknown as WateringRpcClient;
    expect(await writeFeedingTypedEvent(feedInput, { client: feedClient })).toEqual({
      ok: false,
      reason: "rpc:receipt_unverified",
    });
    expect(await writeQuickLogWateringTypedEvent(waterInput, { client: waterClient })).toEqual({
      ok: false,
      reason: "rpc:receipt_unverified",
    });
    expect(singletonFrom).not.toHaveBeenCalled();
  });

  it("keeps explicit readers ahead of the injected client", () => {
    const reusedEventReader = vi.fn();
    const reusedChildReader = vi.fn();
    const readers = resolveTypedReceiptReaders({
      client: { from: vi.fn() },
      reusedEventReader,
      reusedChildReader,
    });
    expect(readers.eventReader).toBe(reusedEventReader);
    expect(readers.childReader).toBe(reusedChildReader);
  });

  it("uses the singleton readers when no client is injected", async () => {
    const { from } = rowsFrom({ grow_events: activeEvent("watering") });
    singletonFrom.mockImplementation(from);
    const readers = resolveTypedReceiptReaders({});
    expect(readers.eventReader).toBe(readTypedQuickLogEvent);
    expect(await readers.eventReader(EVENT_ID)).toEqual({
      data: activeEvent("watering"),
      error: null,
    });
    expect(singletonFrom).toHaveBeenCalledWith("grow_events");
  });
});
