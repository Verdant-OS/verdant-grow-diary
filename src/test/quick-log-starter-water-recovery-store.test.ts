import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingStarterWater,
  clearPendingStarterWater,
  readPendingStarterWater,
  type PendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";

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

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("legacy starter Water recovery claim", () => {
  it("keeps the first exact payload and key across repeated claims and reads", () => {
    const first = record();
    expect(claimPendingStarterWater(first)).toEqual({ status: "claimed", record: first });
    expect(claimPendingStarterWater(first)).toEqual({ status: "claimed", record: first });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
    expect(readPendingStarterWater("owner-a")).toEqual(readPendingStarterWater("owner-a"));
  });

  it("refuses an edited payload or new key until the original is cleared", () => {
    const first = record();
    claimPendingStarterWater(first);
    const edited = record({
      payload: { ...first.payload, p_volume_ml: 500, p_idempotency_key: "different-water-key" },
    });
    expect(claimPendingStarterWater(edited)).toEqual({ status: "pending", record: first });
    expect(clearPendingStarterWater(edited)).toBe(false);
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
    expect(clearPendingStarterWater(first)).toBe(true);
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "empty" });
    expect(claimPendingStarterWater(edited)).toEqual({ status: "claimed", record: edited });
  });

  it("keeps owners separate and fails closed on malformed or mismatched records", () => {
    const first = record();
    claimPendingStarterWater(first);
    expect(readPendingStarterWater("owner-b")).toEqual({ status: "empty" });
    expect(readPendingStarterWater(null)).toEqual({ status: "blocked" });
    expect(
      claimPendingStarterWater(
        record({
          payload: { ...first.payload, p_target_id: "plant-b" },
        }),
      ),
    ).toEqual({ status: "blocked" });
    window.sessionStorage.setItem(
      "verdant:quick-log:pending-starter-water:v1:owner-b",
      JSON.stringify({ ...record({ ownerId: "owner-b" }), version: 2 }),
    );
    expect(readPendingStarterWater("owner-b")).toEqual({ status: "blocked" });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: first });
  });

  it("does not dispatch when storage is unavailable or a write is not retained", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(claimPendingStarterWater(record())).toEqual({ status: "blocked" });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "blocked" });
  });
});
