import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimPendingQuickLogFeeding,
  clearPendingQuickLogFeeding,
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
  it("fails closed when sessionStorage cannot be read", () => {
    claimPendingQuickLogFeeding(record());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "blocked" });
  });
  it("fails closed on invalid JSON without deleting evidence", () => {
    const raw = "not-json";
    window.sessionStorage.setItem(key(), raw);
    expect(readPendingQuickLogFeeding("owner-a")).toEqual({ status: "blocked" });
    expect(window.sessionStorage.getItem(key())).toBe(raw);
  });
});
