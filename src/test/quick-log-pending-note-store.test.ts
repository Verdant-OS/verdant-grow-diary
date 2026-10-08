import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogNote,
  clearPendingQuickLogNote,
  markPendingQuickLogNoteHistoryCheck,
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

  it("returns blocked when sessionStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
    vi.restoreAllMocks();
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

  it("blocks when the record fails closed-schema validation", () => {
    const invalid = validRecord({
      payload: { ...validRecord().payload, p_action: "water" },
    });
    expect(claimPendingQuickLogNote(invalid)).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
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

  it("blocks when sessionStorage.getItem throws during an existing pending read", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "blocked" });
    vi.restoreAllMocks();
  });

  it("blocks when sessionStorage.getItem throws during post-write read-back", () => {
    const record = validRecord();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    let readBack = false;
    getItem.mockImplementation((key: string) => {
      if (key !== pendingKey()) return null;
      if (!readBack) {
        readBack = true;
        return null;
      }
      throw new Error("Storage unavailable");
    });
    expect(claimPendingQuickLogNote(record)).toEqual({ status: "blocked" });
    vi.restoreAllMocks();
  });
});

describe("clearPendingQuickLogNote", () => {
  it("returns false when no pending record exists", () => {
    expect(clearPendingQuickLogNote(validRecord())).toBe(false);
  });

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

  it("returns false when storage throws on removeItem", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(clearPendingQuickLogNote(record)).toBe(false);
    vi.restoreAllMocks();
  });

  it("returns false when sessionStorage.getItem throws during read verification", () => {
    const record = validRecord();
    window.sessionStorage.setItem(pendingKey(), JSON.stringify(record));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(clearPendingQuickLogNote(record)).toBe(false);
    vi.restoreAllMocks();
    expect(window.sessionStorage.getItem(pendingKey())).not.toBeNull();
  });

  it("returns false when removeItem does not clear the stored pending record", () => {
    const record = validRecord();
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(pendingKey(), raw);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => {
      if (key === pendingKey()) return raw;
      return null;
    });
    expect(clearPendingQuickLogNote(record)).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("markPendingQuickLogNoteHistoryCheck", () => {
  it("persists a replay refusal on only the matching owner and save, then clears by the new record", () => {
    const record = validRecord();
    expect(claimPendingQuickLogNote(record).status).toBe("claimed");
    const marked = markPendingQuickLogNoteHistoryCheck(record, "idempotency_key_unverified");
    expect(marked).toEqual({
      status: "marked",
      record: { ...record, historyCheckReason: "idempotency_key_unverified" },
    });
    if (marked.status !== "marked") throw new Error("Expected the matching refusal to persist");
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: marked.record });
    expect(readPendingQuickLogNote(ownerB)).toEqual({ status: "empty" });
    expect(
      markPendingQuickLogNoteHistoryCheck(marked.record, "idempotency_key_unverified"),
    ).toEqual(marked);
    expect(clearPendingQuickLogNote(record)).toBe(false);
    expect(clearPendingQuickLogNote(marked.record)).toBe(true);
  });

  it("persists the verified moved scope only for a target-moved refusal", () => {
    const record = validRecord();
    claimPendingQuickLogNote(record);
    const target = {
      growId: "66666666-6666-4666-8666-666666666666",
      tentId: "55555555-5555-4555-8555-555555555555",
      plantId: "44444444-4444-4444-8444-444444444444",
    };
    expect(
      markPendingQuickLogNoteHistoryCheck(record, "idempotency_key_unverified", target),
    ).toEqual({ status: "blocked" });
    expect(
      markPendingQuickLogNoteHistoryCheck(record, "receipt_target_moved", {
        ...target,
        plantId: 7,
      } as unknown as typeof target),
    ).toEqual({ status: "blocked" });
    const marked = markPendingQuickLogNoteHistoryCheck(record, "receipt_target_moved", target);
    expect(marked).toEqual({
      status: "marked",
      record: {
        ...record,
        historyCheckReason: "receipt_target_moved",
        historyReviewTarget: target,
      },
    });
    if (marked.status !== "marked") throw new Error("Expected the moved refusal to persist");
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: marked.record });
    expect(clearPendingQuickLogNote(marked.record)).toBe(true);
  });

  it("treats a stored review target without the moved reason as unreadable", () => {
    const record = validRecord();
    claimPendingQuickLogNote(record);
    window.sessionStorage.setItem(
      `verdant:quick-log:pending-note:v1:${ownerA}`,
      JSON.stringify({
        ...record,
        historyCheckReason: "idempotency_key_conflict",
        historyReviewTarget: { growId: null, tentId: null, plantId: null },
      }),
    );
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });

  it("refuses unknown reasons and changed or missing pending records", () => {
    const record = validRecord();
    expect(markPendingQuickLogNoteHistoryCheck(record, "network_error")).toEqual({
      status: "blocked",
    });
    expect(claimPendingQuickLogNote(record).status).toBe("claimed");
    const changed = validRecord({
      payload: { ...record.payload, p_idempotency_key: "different-save-key-12345678" },
    });
    expect(markPendingQuickLogNoteHistoryCheck(changed, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record });
  });

  it("fails closed if the refusal marker cannot be written or read back", () => {
    const record = validRecord();
    claimPendingQuickLogNote(record);
    try {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
      expect(markPendingQuickLogNoteHistoryCheck(record, "idempotency_receipt_missing")).toEqual({
        status: "blocked",
      });
    } finally {
      vi.restoreAllMocks();
    }
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record });
  });

  it("fails closed when storage silently ignores the refusal marker", () => {
    const record = validRecord();
    claimPendingQuickLogNote(record);
    try {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
      expect(markPendingQuickLogNoteHistoryCheck(record, "idempotency_key_conflict")).toEqual({
        status: "blocked",
      });
    } finally {
      vi.restoreAllMocks();
    }
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record });
  });

  it("blocks a tampered refusal marker instead of discarding the pending save", () => {
    window.sessionStorage.setItem(
      pendingKey(),
      JSON.stringify({ ...validRecord(), historyCheckReason: "network_error" }),
    );
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });
});

const noteHistoryKey = (owner = ownerA) => `verdant:quick-log:pending-note-history:v1:${owner}`;

/** Models real capacity: any write that grows total stored characters past `limit` throws. */
function capStorage(limit: number) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name: string,
    value: string,
  ) {
    let used = 0;
    for (let i = 0; i < this.length; i += 1) {
      const k = this.key(i)!;
      if (k !== name) used += k.length + (this.getItem(k) ?? "").length;
    }
    if (used + name.length + value.length > limit) throw new Error("QuotaExceededError");
    original.call(this, name, value);
  });
}

/** The larger marked-record write alone fails (it throws or is dropped); small writes still land. */
function refuseMarkedNoteRewrite(mode: "throw" | "ignore") {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    name: string,
    value: string,
  ) {
    if (name === pendingKey() && value.includes("historyCheckReason")) {
      if (mode === "throw") throw new Error("SecurityError");
      return;
    }
    original.call(this, name, value);
  });
}

describe("Note history-review marker fallback when the full record cannot be rewritten", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["throw", "ignore"] as const)(
    "persists a key-scoped marker when the marked record write %ss, so a reload restores review",
    (mode) => {
      const original = validRecord();
      claimPendingQuickLogNote(original);
      const unmarkedRaw = window.sessionStorage.getItem(pendingKey());
      const spy = refuseMarkedNoteRewrite(mode);
      const marked = { ...validRecord(), historyCheckReason: "idempotency_key_retracted" as const };
      expect(markPendingQuickLogNoteHistoryCheck(original, "idempotency_key_retracted")).toEqual({
        status: "marked",
        record: marked,
      });
      spy.mockRestore();
      expect(window.sessionStorage.getItem(pendingKey())).toBe(unmarkedRaw);
      expect(JSON.parse(window.sessionStorage.getItem(noteHistoryKey())!)).toEqual({
        version: 1,
        idempotencyKey: "durable-note-key-12345678",
        historyCheckReason: "idempotency_key_retracted",
      });
      expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: marked });
      expect(clearPendingQuickLogNote(marked)).toBe(true);
      expect(window.sessionStorage.getItem(pendingKey())).toBeNull();
      expect(window.sessionStorage.getItem(noteHistoryKey())).toBeNull();
    },
  );

  it("keeps the moved-receipt review target in the fallback marker", () => {
    const original = validRecord();
    claimPendingQuickLogNote(original);
    const spy = refuseMarkedNoteRewrite("throw");
    const target = { growId, tentId: "77777777-7777-4777-8777-777777777777", plantId };
    const marked = {
      ...validRecord(),
      historyCheckReason: "receipt_target_moved" as const,
      historyReviewTarget: target,
    };
    expect(markPendingQuickLogNoteHistoryCheck(original, "receipt_target_moved", target)).toEqual({
      status: "marked",
      record: marked,
    });
    spy.mockRestore();
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: marked });
  });

  it("reports blocked at real storage capacity instead of claiming a durable marker", () => {
    const original = validRecord();
    claimPendingQuickLogNote(original);
    const unmarkedRaw = window.sessionStorage.getItem(pendingKey())!;
    // Room for the journal plus 10 characters: less than either the marked record or the marker.
    const spy = capStorage(pendingKey().length + unmarkedRaw.length + 10);
    expect(markPendingQuickLogNoteHistoryCheck(original, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    spy.mockRestore();
    expect(window.sessionStorage.getItem(pendingKey())).toBe(unmarkedRaw);
    expect(window.sessionStorage.getItem(noteHistoryKey())).toBeNull();
  });

  it("ignores a fallback marker that names a different idempotency key", () => {
    const original = validRecord();
    claimPendingQuickLogNote(original);
    window.sessionStorage.setItem(
      noteHistoryKey(),
      JSON.stringify({
        version: 1,
        idempotencyKey: "another-note-key-1234",
        historyCheckReason: "idempotency_key_retracted",
      }),
    );
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: original });
  });

  it.each([
    "not json",
    JSON.stringify({ version: 1, idempotencyKey: "durable-note-key-12345678" }),
    JSON.stringify({
      version: 1,
      idempotencyKey: "durable-note-key-12345678",
      historyCheckReason: "rpc:error",
    }),
    JSON.stringify({
      version: 1,
      idempotencyKey: "durable-note-key-12345678",
      historyCheckReason: "idempotency_key_retracted",
      historyReviewTarget: { growId, tentId, plantId },
    }),
    JSON.stringify({
      version: 1,
      idempotencyKey: "durable-note-key-12345678",
      historyCheckReason: "receipt_target_moved",
      historyReviewTarget: { growId: 42, tentId, plantId },
    }),
    JSON.stringify({
      version: 2,
      idempotencyKey: "durable-note-key-12345678",
      historyCheckReason: "idempotency_key_retracted",
    }),
  ])("fails closed on a corrupt fallback marker beside a pending Note: %s", (raw) => {
    claimPendingQuickLogNote(validRecord());
    window.sessionStorage.setItem(noteHistoryKey(), raw);
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "blocked" });
  });

  it("ignores a fallback marker when no Note is pending", () => {
    window.sessionStorage.setItem(noteHistoryKey(), "not json");
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "empty" });
  });

  it("still reports blocked when neither the record nor the marker can be written", () => {
    const original = validRecord();
    claimPendingQuickLogNote(original);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(markPendingQuickLogNoteHistoryCheck(original, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    spy.mockRestore();
    expect(window.sessionStorage.getItem(noteHistoryKey())).toBeNull();
    expect(readPendingQuickLogNote(ownerA)).toEqual({ status: "pending", record: original });
  });
});
