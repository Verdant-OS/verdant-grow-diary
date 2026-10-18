/**
 * Codex P1 on #2110: the public-starter recovery journal is replayed by
 * QuickLog.retryStarterWater straight to quicklog_save_manual, bypassing the
 * payload builder. Its validRecord gate (used by every read, claim and write)
 * must enforce the 50,000 ml single-watering ceiling, including for a record
 * written before the ceiling shipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingStarterWater,
  readPendingStarterWater,
  type PendingStarterWater,
} from "@/lib/quickLogPendingStarterWaterStore";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const record = (overrides: Partial<PendingStarterWater> = {}): PendingStarterWater => ({
  version: 1,
  ownerId: "owner-a",
  createdAt: "2026-09-26T04:00:00.000Z",
  payload: {
    p_target_type: "plant",
    p_target_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    p_action: "water",
    p_volume_ml: 250,
    p_note: "Starter Water",
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: "2026-09-26T04:00:00.000Z",
    p_idempotency_key: "original-water-key",
  },
  target: {
    plantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    growId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
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
  window.sessionStorage.clear();
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

const STORAGE_KEY = "verdant:quick-log:pending-starter-water:v1:owner-a";

function withVolume(volume: number): PendingStarterWater {
  const base = record();
  return { ...base, payload: { ...base.payload, p_volume_ml: volume } };
}

describe("starter Water recovery volume ceiling", () => {
  it("claims and reads back a record at exactly 50,000 ml", async () => {
    const r = withVolume(50_000);
    expect(await claimPendingStarterWater(r)).toEqual({ status: "claimed", record: r });
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "pending", record: r });
  });

  it("refuses to claim a record above the ceiling", async () => {
    for (const volume of [50_001, 1_000_000]) {
      window.sessionStorage.clear();
      const result = await claimPendingStarterWater(withVolume(volume));
      expect(result.status, String(volume)).not.toBe("claimed");
      expect(readPendingStarterWater("owner-a").status, String(volume)).not.toBe("pending");
    }
  });

  it("blocks a stored pre-ceiling record instead of offering it for replay", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(withVolume(1_000_000)));
    expect(readPendingStarterWater("owner-a")).toEqual({ status: "blocked" });
  });
});
