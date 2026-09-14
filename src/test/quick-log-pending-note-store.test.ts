import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogNote,
  clearPendingQuickLogNote,
  readPendingQuickLogNote,
  type PendingQuickLogNote,
} from "@/lib/quickLogPendingNoteStore";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "55555555-5555-4555-8555-555555555555";
const growId = "66666666-6666-4666-8666-666666666666";

function pendingKey(ownerId = ownerA): string {
  return `verdant:quick-log:pending-note:v1:${ownerId}`;
}

function validRecord(overrides: Partial<PendingQuickLogNote> = {}): PendingQuickLogNote {
  return {
    version: 1,
    ownerId: ownerA,
    createdAt: "2026-09-01T12:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "note",
      p_volume_ml: null,
      p_note: "Unresolved note draft",
      p_temperature_c: 25,
      p_humidity_pct: 60,
      p_vpd_kpa: 1.2,
      p_occurred_at: "2026-09-01T12:00:00.000Z",
      p_details: { source: "manual" },
      p_stage: "flower",
      p_idempotency_key: "durable-note-key-12345678",
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: plantId,
      plantId,
      tentId,
      growId,
    },
    attachments: { photo: false, video: false },
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("readPendingQuickLogNote", () => {
  it("returns empty when no record is stored", () => {
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "empty" });
  });

  it("returns blocked when ownerId is missing", () => {
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(validRecord()));
    expect(readPendingQuickLogNote(null)).toEqual({ status: "blocked" });
    expect(readPendingQuickLogNote("")).toEqual({ status: "blocked" });
  });

  it("returns blocked for corrupt JSON instead of treating it as empty", () => {
    window.sessionStorage.setItem(pendingKey(), "not-json");
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });

  it("returns blocked when the stored ownerId does not match the reader", () => {
    window.sessionStorage.setItem(
      pendingKey(ownerB),
      JSON.stringify(validRecord({ ownerId: ownerB })),
    );
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "empty" });
    expect(readPendingQuickLogNote(ownerB).status).toBe("pending");
  });

  it.each([
    ["wrong action", { payload: { p_action: "water" } }],
    ["missing idempotency key", { payload: { p_idempotency_key: "short" } }],
    ["mismatched resolved target", { resolved: { targetId: "other-plant" } }],
    ["non-note volume", { payload: { p_volume_ml: 500 } }],
    ["invalid createdAt", { createdAt: "not-a-date" }],
    ["unknown top-level key", { extra: true }],
  ])("returns blocked for tampered record: %s", (_label, patch) => {
    const broken = {
      ...validRecord(),
      ...(patch as Partial<PendingQuickLogNote>),
      payload: {
        ...validRecord().payload,
        ...("payload" in patch ? (patch.payload as object) : {}),
      },
      resolved: {
        ...validRecord().resolved,
        ...("resolved" in patch ? (patch.resolved as object) : {}),
      },
    };
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(broken));
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });

  it("returns pending for a valid closed-schema record", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record });
  });
});

describe("claimPendingQuickLogNote", () => {
  it("claims a new pending record when storage is empty", () => {
    const record = validRecord();
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "claimed", record });
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!)).toEqual(record);
  });

  it("re-claims the same record without overwriting a concurrent different payload", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "claimed", record });

    const other = validRecord({
      payload: {
        ...validRecord().payload,
        p_note: "Different note",
        p_idempotency_key: "other-key-87654321",
      },
    });
    expect(claimPendingQuickLogNote(other)).toEqual({ status: "pending", record });
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!).payload.p_note).toBe(
      "Unresolved note draft",
    );
  });

  it("blocks when sessionStorage.setItem cannot persist the claim", () => {
    const record = validRecord();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
    vi.restoreAllMocks();
  });

  it("blocks when a post-write read-back does not match the serialized record", () => {
    const record = validRecord();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    getItem.mockImplementation((key: string) => {
      if (key === pendingKey()) return "[]";
      return null;
    });
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "blocked" });
    vi.restoreAllMocks();
  });
});

describe("clearPendingQuickLogNote", () => {
  it("removes only a matching pending record for the same owner and payload", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    expect(clearPendingQuickLogNote(record)).toBe(true);
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
  });

  it("refuses to clear when the stored record changed underneath", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    const stale = validRecord({
      payload: { ...record.payload, p_note: "Edited after save" },
    });
    expect(clearPendingQuickLogNote(stale)).toBe(false);
    expect(window.sessionStorage.getItem(pendingKey())).not.toBeNull();
  });

  it("returns false when storage throws", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(clearPendingQuickLogNote(record)).toBe(false);
    vi.restoreAllMocks();
  });
});
