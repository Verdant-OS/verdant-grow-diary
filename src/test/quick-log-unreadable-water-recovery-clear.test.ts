/**
 * CodeRabbit on #2110 (quickLogPendingStarterWaterStore.ts:108): a recovery
 * record written before the 50,000 ml ceiling now reads as `blocked`, and
 * nothing could clear it, so Water stayed unavailable for the tab session.
 * Matthew chose an explicit "Check Timeline, then clear" action: under the
 * owner recovery lock it removes only the owner-scoped unreadable key, never
 * replays the record, and leaves readable records and other owners alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));

import {
  clearUnreadablePendingStarterWater,
  readPendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";
import {
  clearUnreadablePendingQuickLogWatering,
  readPendingQuickLogWatering,
} from "@/lib/quickLogPendingWateringStore";
import {
  mayClearUnreadableWaterRecovery,
  unreadableWaterRecoveryOutcome,
} from "@/lib/quickLogUnreadableWaterRecoveryRules";
import {
  starterWaterRecoveryKey,
  typedWaterHistoryMarkerKey,
  typedWaterRecoveryKey,
} from "@/lib/quickLogWaterRecoveryKeys";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "44444444-4444-4444-8444-444444444444";
const growId = "55555555-5555-4555-8555-555555555555";
const at = "2026-09-17T03:00:00.000Z";

const starter = (ownerId: string, volume: number) =>
  JSON.stringify({
    version: 1,
    ownerId,
    createdAt: at,
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "water",
      p_volume_ml: volume,
      p_note: null,
      p_temperature_c: null,
      p_humidity_pct: null,
      p_vpd_kpa: null,
      p_occurred_at: at,
      p_idempotency_key: "starter-water-key",
    },
    target: { plantId, growId, tentId },
    plantName: "Plant A",
    tentName: null,
    growName: null,
    stageWasUserTouched: false,
    reviewedDraftId: null,
    reviewedDraftUpdatedAt: null,
  });

const typed = (ownerId: string, volume: number) =>
  JSON.stringify({
    version: 1,
    ownerId,
    createdAt: at,
    payload: {
      idempotency_key: "typed-water-key-1234",
      grow_id: growId,
      tent_id: tentId,
      plant_id: plantId,
      occurred_at: at,
      volume_ml: volume,
    },
    resolved: { ok: true, targetType: "plant", targetId: plantId, plantId, tentId, growId },
    attachments: { photo: false, video: false },
  });

const get = (key: string) => window.sessionStorage.getItem(key);
const set = (key: string, value: string) => window.sessionStorage.setItem(key, value);

const originalLocks = Object.getOwnPropertyDescriptor(window.navigator, "locks");
beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
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
  window.sessionStorage.clear();
  if (originalLocks) Object.defineProperty(window.navigator, "locks", originalLocks);
  else Reflect.deleteProperty(window.navigator, "locks");
});

describe("starter Water: clear an unreadable recovery record", () => {
  it("removes only this owner's over-ceiling starter key and never sends it", async () => {
    set(starterWaterRecoveryKey(ownerA), starter(ownerA, 1_000_000));
    set(starterWaterRecoveryKey(ownerB), starter(ownerB, 1_000_000));
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 600));
    expect(readPendingStarterWater(ownerA).status).toBe("blocked");

    await expect(clearUnreadablePendingStarterWater(ownerA)).resolves.toEqual({
      status: "cleared",
    });

    expect(get(starterWaterRecoveryKey(ownerA))).toBeNull();
    expect(readPendingStarterWater(ownerA).status).toBe("empty");
    expect(get(starterWaterRecoveryKey(ownerB))).toBe(starter(ownerB, 1_000_000));
    expect(get(typedWaterRecoveryKey(ownerA))).toBe(typed(ownerA, 600));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never removes a readable record; it stays for Retry", async () => {
    set(starterWaterRecoveryKey(ownerA), starter(ownerA, 250));
    await expect(clearUnreadablePendingStarterWater(ownerA)).resolves.toEqual({
      status: "readable",
    });
    expect(get(starterWaterRecoveryKey(ownerA))).toBe(starter(ownerA, 250));
  });

  it("reports an already-empty key and fails closed without a lock or owner", async () => {
    await expect(clearUnreadablePendingStarterWater(ownerA)).resolves.toEqual({
      status: "already_cleared",
    });
    await expect(clearUnreadablePendingStarterWater(" ")).resolves.toEqual({ status: "failed" });
    set(starterWaterRecoveryKey(ownerA), "{not json");
    Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
    await expect(clearUnreadablePendingStarterWater(ownerA)).resolves.toEqual({
      status: "failed",
    });
    expect(get(starterWaterRecoveryKey(ownerA))).toBe("{not json");
  });
});

describe("typed Water: clear an unreadable recovery journal", () => {
  it("removes only this owner's over-ceiling journal and never sends it", async () => {
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 1_000_000));
    set(typedWaterRecoveryKey(ownerB), typed(ownerB, 1_000_000));
    set(starterWaterRecoveryKey(ownerA), starter(ownerA, 250));
    expect(readPendingQuickLogWatering(ownerA).status).toBe("blocked");

    await expect(clearUnreadablePendingQuickLogWatering(ownerA)).resolves.toEqual({
      status: "cleared",
    });

    expect(get(typedWaterRecoveryKey(ownerA))).toBeNull();
    expect(get(typedWaterRecoveryKey(ownerB))).toBe(typed(ownerB, 1_000_000));
    expect(get(starterWaterRecoveryKey(ownerA))).toBe(starter(ownerA, 250));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("with a readable journal, removes only the unreadable history marker", async () => {
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 600));
    set(typedWaterHistoryMarkerKey(ownerA), "{broken");
    expect(readPendingQuickLogWatering(ownerA).status).toBe("blocked");

    await expect(clearUnreadablePendingQuickLogWatering(ownerA)).resolves.toEqual({
      status: "readable",
    });
    expect(get(typedWaterHistoryMarkerKey(ownerA))).toBeNull();
    expect(get(typedWaterRecoveryKey(ownerA))).toBe(typed(ownerA, 600));
    expect(readPendingQuickLogWatering(ownerA).status).toBe("pending");
  });

  it("drops an unreadable marker with an unreadable journal, keeping a readable one", async () => {
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 1_000_000));
    set(typedWaterHistoryMarkerKey(ownerA), "{broken");
    await expect(clearUnreadablePendingQuickLogWatering(ownerA)).resolves.toEqual({
      status: "cleared",
    });
    expect(get(typedWaterHistoryMarkerKey(ownerA))).toBeNull();

    const readableMarker = JSON.stringify({
      version: 1,
      idempotencyKey: "older-key-12345678",
      historyCheckReason: "idempotency_key_conflict",
    });
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 1_000_000));
    set(typedWaterHistoryMarkerKey(ownerA), readableMarker);
    await expect(clearUnreadablePendingQuickLogWatering(ownerA)).resolves.toEqual({
      status: "cleared",
    });
    expect(get(typedWaterRecoveryKey(ownerA))).toBeNull();
    expect(get(typedWaterHistoryMarkerKey(ownerA))).toBe(readableMarker);
  });

  it("never removes a readable journal", async () => {
    set(typedWaterRecoveryKey(ownerA), typed(ownerA, 600));
    await expect(clearUnreadablePendingQuickLogWatering(ownerA)).resolves.toEqual({
      status: "readable",
    });
    expect(get(typedWaterRecoveryKey(ownerA))).toBe(typed(ownerA, 600));
  });
});

describe("unreadable Water recovery rules", () => {
  it("maps every clear result to one presenter outcome", () => {
    expect(unreadableWaterRecoveryOutcome({ status: "cleared" })).toBe("unblocked");
    expect(unreadableWaterRecoveryOutcome({ status: "already_cleared" })).toBe("unblocked");
    expect(unreadableWaterRecoveryOutcome({ status: "readable" })).toBe("reread");
    expect(unreadableWaterRecoveryOutcome({ status: "failed" })).toBe("still_blocked");
  });

  it("offers the escape only for a blocked read with no readable record", () => {
    const base = { blocked: true, hasReadableRecord: false, ownerId: ownerA, inFlight: false };
    expect(mayClearUnreadableWaterRecovery(base)).toBe(true);
    expect(mayClearUnreadableWaterRecovery({ ...base, blocked: false })).toBe(false);
    expect(mayClearUnreadableWaterRecovery({ ...base, hasReadableRecord: true })).toBe(false);
    expect(mayClearUnreadableWaterRecovery({ ...base, inFlight: true })).toBe(false);
    expect(mayClearUnreadableWaterRecovery({ ...base, ownerId: null })).toBe(false);
    expect(mayClearUnreadableWaterRecovery({ ...base, ownerId: " " })).toBe(false);
  });
});
