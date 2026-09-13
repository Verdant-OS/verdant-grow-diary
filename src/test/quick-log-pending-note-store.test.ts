import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogNote,
  clearPendingQuickLogNote,
  readPendingQuickLogNote,
  type PendingQuickLogNote,
} from "@/lib/quickLogPendingNoteStore";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const storageKey = `verdant:quick-log:pending-note:v1:${ownerId}`;

function validPlantRecord(overrides: Record<string, unknown> = {}): PendingQuickLogNote {
  return {
    version: 1,
    ownerId,
    createdAt: "2020-01-01T00:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: "33333333-3333-4333-8333-333333333333",
      p_action: "note",
      p_volume_ml: null,
      p_note: "Unresolved note text",
      p_temperature_c: 25,
      p_humidity_pct: 60,
      p_vpd_kpa: 1.2,
      p_occurred_at: "2020-01-01T00:00:00.000Z",
      p_details: { source: "manual" },
      p_stage: "flower",
      p_idempotency_key: "durable-original-note-key",
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: "33333333-3333-4333-8333-333333333333",
      plantId: "33333333-3333-4333-8333-333333333333",
      tentId: "55555555-5555-4555-8555-555555555555",
      growId: "66666666-6666-4666-8666-666666666666",
    },
    attachments: { photo: false, video: false },
    ...overrides,
  } as PendingQuickLogNote;
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("readPendingQuickLogNote", () => {
  it.each([null, ""])("blocks when ownerId is %j", (owner) => {
    expect(readPendingQuickLogNote(owner)).toEqual({ status: "blocked" });
  });

  it("returns empty for whitespace-only ownerId because no keyed record can exist", () => {
    expect(readPendingQuickLogNote("   ")).toEqual({ status: "empty" });
  });

  it("returns empty when no record is stored", () => {
    expect(readPendingQuickLogNote(ownerId)).toEqual({ status: "empty" });
  });

  it("returns pending for a closed-schema plant record", () => {
    const record = validPlantRecord();
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
    expect(readPendingQuickLogNote(ownerId)).toEqual({ status: "pending", record });
  });

  it("returns pending for a tent-scoped record with null plantId", () => {
    const record = validPlantRecord({
      payload: {
        p_target_type: "tent",
        p_target_id: "55555555-5555-4555-8555-555555555555",
        p_action: "note",
        p_volume_ml: null,
        p_note: "Tent note",
        p_temperature_c: null,
        p_humidity_pct: null,
        p_vpd_kpa: null,
        p_occurred_at: null,
        p_idempotency_key: "tent-note-key-1",
      },
      resolved: {
        ok: true,
        targetType: "tent",
        targetId: "55555555-5555-4555-8555-555555555555",
        plantId: null,
        tentId: "55555555-5555-4555-8555-555555555555",
        growId: "66666666-6666-4666-8666-666666666666",
      },
    });
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
    expect(readPendingQuickLogNote(ownerId)).toEqual({ status: "pending", record });
  });

  it.each([
    ["invalid JSON", "not-json"],
    ["wrong version", JSON.stringify({ ...validPlantRecord(), version: 9 })],
    ["owner mismatch", JSON.stringify({ ...validPlantRecord(), ownerId: otherOwner })],
    [
      "non-note action",
      JSON.stringify(
        validPlantRecord({ payload: { ...validPlantRecord().payload, p_action: "water" } }),
      ),
    ],
    [
      "short idempotency key",
      JSON.stringify(
        validPlantRecord({
          payload: { ...validPlantRecord().payload, p_idempotency_key: "short" },
        }),
      ),
    ],
    [
      "plant resolved mismatch",
      JSON.stringify(
        validPlantRecord({
          resolved: {
            ...validPlantRecord().resolved,
            plantId: "44444444-4444-4444-8444-444444444444",
          },
        }),
      ),
    ],
    [
      "tent with plantId set",
      JSON.stringify(
        validPlantRecord({
          payload: {
            ...validPlantRecord().payload,
            p_target_type: "tent",
            p_target_id: "55555555-5555-4555-8555-555555555555",
          },
          resolved: {
            ok: true,
            targetType: "tent",
            targetId: "55555555-5555-4555-8555-555555555555",
            plantId: "33333333-3333-4333-8333-333333333333",
            tentId: "55555555-5555-4555-8555-555555555555",
            growId: "66666666-6666-4666-8666-666666666666",
          },
        }),
      ),
    ],
    ["extra root key", JSON.stringify({ ...validPlantRecord(), injected: true })],
  ])("blocks corrupt or unsupported storage: %s", (_label, raw) => {
    window.sessionStorage.setItem(storageKey, raw);
    expect(readPendingQuickLogNote(ownerId)).toEqual({ status: "blocked" });
  });

  it("blocks when sessionStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readPendingQuickLogNote(ownerId)).toEqual({ status: "blocked" });
  });
});

describe("claimPendingQuickLogNote", () => {
  it("persists and claims when storage is empty", () => {
    const record = validPlantRecord();
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "claimed", record });
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!)).toEqual(record);
  });

  it("claims without overwriting when the same record is already pending", () => {
    const record = validPlantRecord();
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "claimed", record });
    expect(window.sessionStorage.getItem(storageKey)).toBe(JSON.stringify(record));
  });

  it("returns the existing pending record when a different operation is already stored", () => {
    const existing = validPlantRecord();
    const incoming = validPlantRecord({
      payload: {
        ...existing.payload,
        p_note: "Different note",
        p_idempotency_key: "different-note-key",
      },
    });
    window.sessionStorage.setItem(storageKey, JSON.stringify(existing));
    expect(claimPendingQuickLogNote(incoming)).toEqual({ status: "pending", record: existing });
    expect(JSON.parse(window.sessionStorage.getItem(storageKey)!)).toEqual(existing);
  });

  it("blocks when setItem is a no-op", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(claimPendingQuickLogNote(validPlantRecord())).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("blocks invalid records before touching storage", () => {
    const invalid = validPlantRecord({
      payload: { ...validPlantRecord().payload, p_idempotency_key: "short" },
    });
    expect(claimPendingQuickLogNote(invalid)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });
});

describe("clearPendingQuickLogNote", () => {
  it("removes only a matching unchanged pending record", () => {
    const record = validPlantRecord();
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
    expect(clearPendingQuickLogNote(record)).toBe(true);
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("returns false when storage is empty", () => {
    expect(clearPendingQuickLogNote(validPlantRecord())).toBe(false);
  });

  it("returns false when a different pending record is stored", () => {
    const stored = validPlantRecord();
    const attempted = validPlantRecord({
      payload: {
        ...stored.payload,
        p_note: "Edited after save",
        p_idempotency_key: "other-note-key",
      },
    });
    window.sessionStorage.setItem(storageKey, JSON.stringify(stored));
    expect(clearPendingQuickLogNote(attempted)).toBe(false);
    expect(window.sessionStorage.getItem(storageKey)).toBe(JSON.stringify(stored));
  });

  it("returns false when removeItem throws", () => {
    const record = validPlantRecord();
    window.sessionStorage.setItem(storageKey, JSON.stringify(record));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(clearPendingQuickLogNote(record)).toBe(false);
    expect(window.sessionStorage.getItem(storageKey)).not.toBeNull();
  });
});
