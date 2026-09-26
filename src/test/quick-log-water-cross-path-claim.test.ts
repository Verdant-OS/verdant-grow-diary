import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingStarterWater,
  type PendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";
import {
  claimPendingQuickLogWatering,
  clearPendingQuickLogWatering,
  readPendingQuickLogWatering,
  type PendingQuickLogWatering,
} from "@/lib/quickLogPendingWateringStore";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const ownerId = "11111111-1111-4111-8111-111111111111";
const plantId = "22222222-2222-4222-8222-222222222222";
const tentId = "33333333-3333-4333-8333-333333333333";
const growId = "44444444-4444-4444-8444-444444444444";
const occurredAt = "2026-09-26T08:00:00.000Z";

function starter(): PendingStarterWater {
  return {
    version: 1,
    ownerId,
    createdAt: occurredAt,
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "water",
      p_volume_ml: 250,
      p_note: "Starter Water",
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: occurredAt,
      p_idempotency_key: "starter-water-key",
    },
    target: { plantId, tentId, growId },
    plantName: "Plant A",
    tentName: "Tent A",
    growName: "Grow A",
    stageWasUserTouched: false,
    reviewedDraftId: null,
    reviewedDraftUpdatedAt: null,
  };
}

function typed(): PendingQuickLogWatering {
  return {
    version: 1,
    ownerId,
    createdAt: occurredAt,
    payload: {
      idempotency_key: "typed-water-key",
      grow_id: growId,
      tent_id: tentId,
      plant_id: plantId,
      occurred_at: occurredAt,
      volume_ml: 250,
    },
    resolved: { ok: true, targetType: "plant", targetId: plantId, plantId, tentId, growId },
    attachments: { photo: false, video: false },
  };
}

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
let lockNames: string[] = [];
beforeEach(() => {
  clearLocalStorageForTest();
  window.sessionStorage.clear();
  lockNames = [];
  let tail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(window.navigator, "locks", {
    configurable: true,
    value: {
      request: (name: string, _options: unknown, callback: () => unknown) => {
        lockNames.push(name);
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

describe("cross-path Water claims", () => {
  it("refuses a starter dispatch while a typed Water is unresolved", async () => {
    expect((await claimPendingQuickLogWatering(typed())).status).toBe("claimed");
    expect((await claimPendingStarterWater(starter())).status).not.toBe("claimed");
  });

  it("refuses a typed dispatch while a starter Water is unresolved", async () => {
    expect((await claimPendingStarterWater(starter())).status).toBe("claimed");
    expect((await claimPendingQuickLogWatering(typed())).status).not.toBe("claimed");
  });

  it("serializes simultaneous claims so only one path can dispatch", async () => {
    const results = await Promise.all([
      claimPendingStarterWater(starter()),
      claimPendingQuickLogWatering(typed()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["claimed", "other_pending"]);
    expect(new Set(lockNames).size).toBe(1);
  });

  it("keeps a second typed tab on the first exact key", async () => {
    const second = typed();
    second.payload.idempotency_key = "second-typed-key";
    const [first, later] = await Promise.all([
      claimPendingQuickLogWatering(typed()),
      claimPendingQuickLogWatering(second),
    ]);
    expect(first.status).toBe("claimed");
    expect(later.status).toBe("pending");
    expect(readPendingQuickLogWatering(ownerId)).toEqual({ status: "pending", record: typed() });
  });

  it("keeps a typed claim after tab-local storage is cleared and releases both paths only after exact clear", async () => {
    const original = typed();
    expect((await claimPendingQuickLogWatering(original)).status).toBe("claimed");
    window.sessionStorage.clear();
    expect(readPendingQuickLogWatering(ownerId)).toEqual({ status: "pending", record: original });
    expect((await claimPendingQuickLogWatering(original)).status).toBe("claimed");
    expect((await claimPendingStarterWater(starter())).status).toBe("other_pending");
    expect(
      await clearPendingQuickLogWatering({
        ...original,
        payload: { ...original.payload, idempotency_key: "different-water-key" },
      }),
    ).toBe(false);
    expect((await claimPendingStarterWater(starter())).status).toBe("other_pending");
    expect(await clearPendingQuickLogWatering(original)).toBe(true);
    expect((await claimPendingStarterWater(starter())).status).toBe("claimed");
  });

  it("fails closed when a typed recovery value is malformed", async () => {
    setLocalStorageItemForTest(`verdant:quick-log:pending-watering:v1:${ownerId}`, "not-json");
    expect(readPendingQuickLogWatering(ownerId)).toEqual({ status: "blocked" });
    expect((await claimPendingStarterWater(starter())).status).toBe("other_pending");
    expect((await claimPendingQuickLogWatering(typed())).status).toBe("blocked");
  });
});
