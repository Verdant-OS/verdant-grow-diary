import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogFeeding,
  clearPendingQuickLogFeeding,
  markPendingQuickLogFeedingHistoryCheck,
  readPendingQuickLogFeeding,
  type PendingQuickLogFeeding,
} from "@/lib/quickLogPendingFeedingStore";

function record(): PendingQuickLogFeeding {
  return {
    version: 1,
    ownerId: "owner-a",
    createdAt: "2026-09-17T16:00:00.000Z",
    payload: {
      idempotency_key: "feeding-save-12345678",
      grow_id: "grow-a",
      tent_id: "tent-a",
      plant_id: "plant-a",
      occurred_at: "2026-09-17T16:00:00.000Z",
      nutrient_line_id: "veg-week-3",
      volume_ml: 750,
      products: [{ name: "Base A", amount: 2, unit: "ml_per_l" }],
      note: "Checked the plant first",
      ec_in: 1.2,
      water_temp_c: 21,
    },
    resolved: {
      ok: true,
      targetType: "plant",
      targetId: "plant-a",
      plantId: "plant-a",
      tentId: "tent-a",
      growId: "grow-a",
    },
  };
}
const key = (owner = "owner-a") => `verdant:quick-log:pending-feeding:v1:${owner}`;
beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("durable Feed history-review refusal", () => {
  it.each([
    "idempotency_key_unverified",
    "idempotency_receipt_missing",
    "idempotency_key_retracted",
    "idempotency_key_conflict",
  ] as const)("marks only the original %s claim and retains its complete identity", (reason) => {
    const original = record();
    claimPendingQuickLogFeeding(original);
    const marked = { ...record(), historyCheckReason: reason };
    expect(markPendingQuickLogFeedingHistoryCheck(original, reason)).toEqual({
      status: "marked",
      record: marked,
    });
    expect(original).toEqual(record());
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: marked });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: marked });
    expect(markPendingQuickLogFeedingHistoryCheck(marked, reason)).toEqual({
      status: "marked",
      record: marked,
    });
    expect(clearPendingQuickLogFeeding(original)).toBe(false);
    expect(clearPendingQuickLogFeeding(marked)).toBe(true);
  });

  it.each([null, undefined, "", "rpc:error", "plant_tent_grow_mismatch", "unknown", 42, {}])(
    "rejects unknown refusal %s without replacing the original claim",
    (reason) => {
      const original = record();
      claimPendingQuickLogFeeding(original);
      const raw = window.sessionStorage.getItem(key());
      expect(markPendingQuickLogFeedingHistoryCheck(original, reason)).toEqual({
        status: "blocked",
      });
      expect(window.sessionStorage.getItem(key())).toBe(raw);
    },
  );

  it.each([null, undefined])("rejects absent record %s without throwing", (value) => {
    expect(markPendingQuickLogFeedingHistoryCheck(value, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    expect(window.sessionStorage.getItem(key())).toBeNull();
  });

  it("refuses to create an unclaimed record", () => {
    expect(markPendingQuickLogFeedingHistoryCheck(record(), "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    expect(window.sessionStorage.getItem(key())).toBeNull();
  });

  it.each(["key", "payload", "target", "owner"])("cannot mark a changed %s identity", (field) => {
    const original = record();
    claimPendingQuickLogFeeding(original);
    const changed = record();
    if (field === "key") changed.payload.idempotency_key = "another-feeding-save";
    if (field === "payload") changed.payload.volume_ml = 900;
    if (field === "owner") changed.ownerId = "owner-b";
    if (field === "target") {
      changed.payload.plant_id = "plant-b";
      changed.resolved.plantId = "plant-b";
      changed.resolved.targetId = "plant-b";
    }
    expect(markPendingQuickLogFeedingHistoryCheck(changed, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: original });
    expect(readPendingQuickLogFeeding("owner-b")).toEqual({ status: "empty" });
  });

  it.each([null, "rpc:error", 42])("fails closed on a corrupt stored marker %s", (reason) => {
    const raw = JSON.stringify({ ...record(), historyCheckReason: reason });
    window.sessionStorage.setItem(key(), raw);
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(key())).toBe(raw);
  });

  it.each(["getItem", "setItem"] as const)(
    "does not report a durable marker when %s throws",
    (method) => {
      const original = record();
      claimPendingQuickLogFeeding(original);
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(markPendingQuickLogFeedingHistoryCheck(original, "idempotency_key_retracted")).toEqual(
        {
          status: "blocked",
        },
      );
    },
  );

  it("detects a silently ignored marker write and preserves the old unmarked claim", () => {
    const original = record();
    claimPendingQuickLogFeeding(original);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(markPendingQuickLogFeedingHistoryCheck(original, "idempotency_key_retracted")).toEqual({
      status: "blocked",
    });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: original });
  });
});

describe("owner-scoped exact pending Feed", () => {
  it("returns empty only for a readable empty owner slot", () => {
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "empty" });
    for (const owner of [null, undefined, "", " owner-a "])
      expect(readPendingQuickLogFeeding(owner)).toEqual({ status: "blocked" });
  });
  it("synchronously stores a detached exact payload and permits deterministic repeat reads", () => {
    const input = record();
    const original = record();
    expect(claimPendingQuickLogFeeding(input)).toEqual({ status: "claimed", record: original });
    input.payload.volume_ml = 999;
    (input.payload.products as Array<{ name: string }>)[0].name = "Changed";
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: original });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: original });
    expect(JSON.parse(window.sessionStorage.getItem(key())!)).toEqual(original);
  });
  it("accepts identical retry, refuses a competing operation and exact-clears only the original", () => {
    const original = record();
    claimPendingQuickLogFeeding(original);
    expect(claimPendingQuickLogFeeding(record()).status).toBe("claimed");
    const different = record();
    different.payload.idempotency_key += "-new";
    expect(claimPendingQuickLogFeeding(different)).toEqual({ status: "pending", record: original });
    expect(clearPendingQuickLogFeeding(different)).toBe(false);
    const changed = record();
    changed.payload.volume_ml = 900;
    expect(clearPendingQuickLogFeeding(changed)).toBe(false);
    expect(clearPendingQuickLogFeeding(original)).toBe(true);
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "empty" });
  });
  it("isolates account slots and preserves the other owner through clear", () => {
    const a = record();
    const b = { ...record(), ownerId: "owner-b" };
    claimPendingQuickLogFeeding(a);
    claimPendingQuickLogFeeding(b);
    expect(readPendingQuickLogFeeding("owner-b")).toEqual({ status: "pending", record: b });
    expect(clearPendingQuickLogFeeding(a)).toBe(true);
    expect(readPendingQuickLogFeeding("owner-b")).toEqual({ status: "pending", record: b });
  });
  it("retains old unresolved records without expiry and supports tent scope", () => {
    const pending = record();
    pending.createdAt = "2020-01-01T00:00:00.000Z";
    pending.payload.plant_id = null;
    pending.resolved = {
      ok: true,
      targetType: "tent",
      targetId: "tent-a",
      tentId: "tent-a",
      growId: "grow-a",
      plantId: null,
    };
    expect(claimPendingQuickLogFeeding(pending).status).toBe("claimed");
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "pending", record: pending });
  });
  type InvalidRecord = Record<string, unknown> & {
    payload: Record<string, unknown> & { products: Array<Record<string, unknown>> };
    resolved: Record<string, unknown>;
  };
  const invalidCases: Array<[string, (r: InvalidRecord) => void]> = [
    [
      "unknown version",
      (r) => {
        r.version = 2;
      },
    ],
    [
      "wrong owner",
      (r) => {
        r.ownerId = "owner-b";
      },
    ],
    [
      "unknown top-level field",
      (r) => {
        r.attachments = {};
      },
    ],
    [
      "missing timestamp",
      (r) => {
        delete r.payload.occurred_at;
      },
    ],
    [
      "invalid timestamp",
      (r) => {
        r.payload.occurred_at = "yesterday";
      },
    ],
    [
      "target grow mismatch",
      (r) => {
        r.resolved.growId = "other";
      },
    ],
    [
      "target plant mismatch",
      (r) => {
        r.resolved.plantId = "other";
      },
    ],
    [
      "target tent mismatch",
      (r) => {
        r.payload.tent_id = "other";
      },
    ],
    [
      "target ID mismatch",
      (r) => {
        r.resolved.targetId = "other";
      },
    ],
    [
      "invalid target type",
      (r) => {
        r.resolved.targetType = "grow";
      },
    ],
    [
      "client ownership payload",
      (r) => {
        r.payload.user_id = "owner-b";
      },
    ],
    [
      "unknown product field",
      (r) => {
        r.payload.products[0].source = "live";
      },
    ],
    [
      "missing products",
      (r) => {
        r.payload.products = [];
      },
    ],
    [
      "too many products",
      (r) => {
        r.payload.products = Array.from({ length: 13 }, () => ({ name: "A" }));
      },
    ],
    [
      "negative amount",
      (r) => {
        r.payload.products[0].amount = -1;
      },
    ],
    [
      "oversized amount",
      (r) => {
        r.payload.products[0].amount = 1_000_001;
      },
    ],
    [
      "string amount",
      (r) => {
        r.payload.products[0].amount = "2";
      },
    ],
    [
      "secret-like product",
      (r) => {
        r.payload.products[0].name = "api_key";
      },
    ],
    [
      "zero volume",
      (r) => {
        r.payload.volume_ml = 0;
      },
    ],
    [
      "oversized volume",
      (r) => {
        r.payload.volume_ml = 1_000_001;
      },
    ],
    [
      "string metric",
      (r) => {
        r.payload.ec_in = "1.2";
      },
    ],
    [
      "empty line",
      (r) => {
        r.payload.nutrient_line_id = "";
      },
    ],
    [
      "short key",
      (r) => {
        r.payload.idempotency_key = "abc";
      },
    ],
    [
      "overlong key",
      (r) => {
        r.payload.idempotency_key = "x".repeat(201);
      },
    ],
    [
      "normalized-away key whitespace",
      (r) => {
        r.payload.idempotency_key = " feeding-key-12345678 ";
      },
    ],
    [
      "plant target without matching plantId",
      (r) => {
        r.resolved.targetType = "plant";
        r.resolved.plantId = "other-plant";
        r.resolved.targetId = "other-plant";
      },
    ],
    [
      "tent target with a non-null plantId",
      (r) => {
        r.resolved.targetType = "tent";
        r.resolved.targetId = "tent-a";
        r.resolved.tentId = "tent-a";
        r.resolved.plantId = "plant-a";
        r.payload.plant_id = null;
      },
    ],
    [
      "nontext note",
      (r) => {
        r.payload.note = 123;
      },
    ],
  ];
  it.each(invalidCases)("fails closed on %s without deleting evidence", (_label, mutate) => {
    const value = record();
    mutate(value as unknown as InvalidRecord);
    const raw = JSON.stringify(value);
    window.sessionStorage.setItem(key(), raw);
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "blocked" });
    expect(clearPendingQuickLogFeeding(value)).toBe(false);
    expect(window.sessionStorage.getItem(key())).toBe(raw);
  });
  it.each([Infinity, -Infinity, NaN])(
    "rejects nonfinite input %s before JSON can turn it into null",
    (value) => {
      const pending = record();
      pending.payload.ec_in = value;
      expect(claimPendingQuickLogFeeding(pending)).toEqual({ status: "blocked" });
      expect(window.sessionStorage.getItem(key())).toBeNull();
    },
  );
  it("refuses cycles and does not throw", () => {
    const value = record();
    (value.payload.products as unknown[]).push(value);
    expect(claimPendingQuickLogFeeding(value)).toEqual({ status: "blocked" });
  });
  it.each(["getItem", "setItem", "removeItem"] as const)("fails closed if %s throws", (method) => {
    const value = record();
    if (method === "removeItem") claimPendingQuickLogFeeding(value);
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new Error("unavailable");
    });
    if (method === "removeItem") expect(clearPendingQuickLogFeeding(value)).toBe(false);
    else expect(claimPendingQuickLogFeeding(value)).toEqual({ status: "blocked" });
  });
  it("detects silent writes that did not persist", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(claimPendingQuickLogFeeding(record())).toEqual({ status: "blocked" });
  });
  it("detects a silently ignored removal", () => {
    const value = record();
    claimPendingQuickLogFeeding(value);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});
    expect(clearPendingQuickLogFeeding(value)).toBe(false);
  });
});
