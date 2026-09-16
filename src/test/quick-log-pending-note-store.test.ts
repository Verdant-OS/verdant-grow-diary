import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingQuickLogNote } from "@/lib/quickLogPendingNoteStore";
import {
  claimPendingQuickLogNote,
  clearPendingQuickLogNote,
  readPendingQuickLogNote,
} from "@/lib/quickLogPendingNoteStore";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "55555555-5555-4555-8555-555555555555";
const growId = "66666666-6666-4666-8666-666666666666";
const pendingKey = (owner = ownerA) => `verdant:quick-log:pending-note:v1:${owner}`;

function validRecord(overrides: Partial<PendingQuickLogNote> = {}): PendingQuickLogNote {
  return {
    version: 1,
    ownerId: ownerA,
    createdAt: "2020-01-01T00:00:00.000Z",
    payload: {
      p_target_type: "plant",
      p_target_id: plantId,
      p_action: "note",
      p_volume_ml: null,
      p_note: "Original note",
      p_temperature_c: 25,
      p_humidity_pct: 60,
      p_vpd_kpa: 1.2,
      p_occurred_at: "2020-01-01T00:00:00.000Z",
      p_details: { source: "manual", observation: "unchanged" },
      p_stage: "flower",
      p_idempotency_key: "durable-original-note-key",
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
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("readPendingQuickLogNote", () => {
  it("blocks when owner id is missing", () => {
    expect(readPendingQuickLogNote(null)).toEqual({ status: "blocked" });
    expect(readPendingQuickLogNote("")).toEqual({ status: "blocked" });
  });

  it("returns empty when no durable record exists", () => {
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "empty" });
  });

  it("returns pending for a closed, versioned record", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record });
  });

  it.each([
    "not-json",
    JSON.stringify({ ...validRecord(), version: 9 }),
    JSON.stringify({ ...validRecord(), ownerId: ownerB }),
    JSON.stringify({ ...validRecord(), payload: { p_action: "note" } }),
    JSON.stringify({ ...validRecord(), payload: { ...validRecord().payload, p_action: "feed" } }),
    JSON.stringify({
      ...validRecord(),
      payload: { ...validRecord().payload, p_volume_ml: 500 },
    }),
    JSON.stringify({
      ...validRecord(),
      payload: { ...validRecord().payload, p_idempotency_key: "short" },
    }),
    JSON.stringify({
      ...validRecord(),
      resolved: {
        ...validRecord().resolved,
        targetType: "tent",
        targetId: tentId,
        tentId,
        plantId: null,
      },
    }),
    JSON.stringify({ ...validRecord(), extra: "field" }),
  ])("fences corrupt or unsupported storage instead of treating it as empty: %s", (raw) => {
    window.sessionStorage.setItem(pendingKey(), raw);
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });
});

describe("claimPendingQuickLogNote", () => {
  it("claims an empty slot and persists the canonical record", () => {
    const record = validRecord();
    const claim = claimPendingQuickLogNote(record);
    expect(claim).toEqual({ status: "claimed", record });
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!)).toEqual(record);
  });

  it("re-claims the same unchanged record without overwriting it", () => {
    const record = validRecord();
    claimPendingQuickLogNote(record);
    const second = claimPendingQuickLogNote(record);
    expect(second).toEqual({ status: "claimed", record });
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!)).toEqual(record);
  });

  it("does not overwrite a different pending record claimed earlier", () => {
    const existing = validRecord({
      payload: { ...validRecord().payload, p_note: "Earlier unresolved note" },
    });
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(existing));

    const incoming = validRecord({
      payload: { ...validRecord().payload, p_note: "A replacement must not win" },
    });
    expect(claimPendingQuickLogNote(incoming)).toEqual({
      status: "pending",
      record: existing,
    });
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!)).toEqual(existing);
  });

  it("blocks when storage cannot be read or written safely", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(claimPendingQuickLogNote(validRecord())).toEqual({ status: "blocked" });
  });

  it("blocks when the incoming record fails validation", () => {
    const invalid = validRecord({
      payload: { ...validRecord().payload, p_idempotency_key: "short" },
    });
    expect(claimPendingQuickLogNote(invalid)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
  });
});

describe("clearPendingQuickLogNote", () => {
  it("clears only the exact pending record it was given", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    expect(clearPendingQuickLogNote(record)).toBe(true);
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
  });

  it("refuses to clear when storage holds a different pending record", () => {
    const stored = validRecord({
      payload: { ...validRecord().payload, p_note: "Stored note" },
    });
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(stored));
    const stale = validRecord({
      payload: { ...validRecord().payload, p_note: "Late completion copy" },
    });
    expect(clearPendingQuickLogNote(stale)).toBe(false);
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey())!)).toEqual(stored);
  });

  it("returns false when nothing is pending", () => {
    expect(clearPendingQuickLogNote(validRecord())).toBe(false);
  });

  it("isolates owners so clearing one account never touches another", () => {
    const recordA = validRecord();
    const recordB = validRecord({ ownerId: ownerB });
    window.sessionStorage.setItem(pendingKey(ownerA), JSON.stringify(recordA));
    window.sessionStorage.setItem(pendingKey(ownerB), JSON.stringify(recordB));

    expect(clearPendingQuickLogNote(recordA)).toBe(true);
    expect(window.sessionStorage.getItem(pendingKey(ownerA))).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem(pendingKey(ownerB))!)).toEqual(recordB);
  });
});
