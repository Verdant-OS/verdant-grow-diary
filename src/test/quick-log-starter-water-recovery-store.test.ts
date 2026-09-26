import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingStarterWater,
  clearPendingStarterWater,
  readPendingStarterWater,
  type PendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const record = (overrides: Partial<PendingStarterWater> = {}): PendingStarterWater => ({
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-26T04:00:00.000Z",
  payload: {
    p_target_type: "plant",
    p_target_id: "plant-a",
    p_action: "water",
    p_volume_ml: 250,
    p_note: "Starter Water",
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: "2026-09-26T04:00:00.000Z",
    p_idempotency_key: "original-water-key",
  },
  target: { plantId: "plant-a", growId: "grow-a", tentId: "tent-a" },
  plantName: "Plant A",
  tentName: "Tent A",
  growName: "Grow A",
  stageWasUserTouched: false,
  reviewedDraftId: null,
  reviewedDraftUpdatedAt: null,
  ...overrides,
});

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  clearLocalStorageForTest();
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (_name: string, _options: unknown, callback: () => unknown) => {
        const turn = tail.then(callback);
        tail = turn.then(
          () => undefined,
          () => undefined,
        );
        return turn;
      },
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("legacy starter Water recovery claim", () => {
  it("keeps the first exact payload and key across repeated claims and reads", async () => {
    const first = record();
    expect(await claimPendingStarterWater(first)).toEqual({ status: "claimed", record: first });
    expect(await claimPendingStarterWater(first)).toEqual({ status: "claimed", record: first });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
    expect(readPendingStarterWater("owner-a")).toEqual(readPendingStarterWater("owner-a"));
    window.sessionStorage.clear();
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
  });

  it("refuses an edited payload or new key until the original is cleared", async () => {
    const first = record();
    await claimPendingStarterWater(first);
    const edited = record({
      payload: { ...first.payload, p_volume_ml: 500, p_idempotency_key: "different-water-key" },
    });
    expect(await claimPendingStarterWater(edited)).toEqual({ status: "pending", record: first });
    expect(await clearPendingStarterWater(edited)).toBe(false);
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
    expect(await clearPendingStarterWater(first)).toBe(true);
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "empty" });
    expect(await claimPendingStarterWater(edited)).toEqual({ status: "claimed", record: edited });
  });

  it("keeps owners separate and fails closed on malformed or mismatched records", async () => {
    const first = record();
    await claimPendingStarterWater(first);
    expect(readPendingStarterWater("owner-b")).toEqual({ status: "empty" });
    expect(readPendingStarterWater(null)).toEqual({ status: "blocked" });
    expect(
      await claimPendingStarterWater(
        record({
          payload: { ...first.payload, p_target_id: "plant-b" },
        }),
      ),
    ).toEqual({ status: "blocked" });
    setLocalStorageItemForTest(
      "verdant:quick-log:pending-starter-water:v1:owner-b",
      JSON.stringify({ ...record({ ownerId: "owner-b" }), version: 2 }),
    );
    expect(readPendingStarterWater("owner-b")).toEqual({ status: "blocked" });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
  });

  it("does not dispatch when storage is unavailable or a write is not retained", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(await claimPendingStarterWater(record())).toEqual({ status: "blocked" });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "blocked" });
  });

  it("serializes competing tabs on one owner before either can dispatch", async () => {
    const first = record();
    const second = record({
      payload: { ...first.payload, p_idempotency_key: "second-water-key" },
    });
    const [a, b] = await Promise.all([
      claimPendingStarterWater(first),
      claimPendingStarterWater(second),
    ]);
    expect(a).toEqual({ status: "claimed", record: first });
    expect(b).toEqual({ status: "pending", record: first });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
  });

  it("lets only one tab clear and count a recovered logical Watering", async () => {
    const first = record();
    await claimPendingStarterWater(first);
    const [a, b] = await Promise.all([
      clearPendingStarterWater(first),
      clearPendingStarterWater(first),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "empty" });
  });

  it("blocks a new Water claim when the cross-tab lock API is unavailable", async () => {
    Reflect.deleteProperty(window.navigator, "locks");
    expect(await claimPendingStarterWater(record())).toEqual({ status: "blocked" });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "empty" });
    expect(await clearPendingStarterWater(record())).toBe(false);
  });
});
