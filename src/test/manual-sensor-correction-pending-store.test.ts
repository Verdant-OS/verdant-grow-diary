import { describe, expect, it, vi } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
function operation() {
  const r = buildManualCorrectionOperation({
    operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    correction: {
      tentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      originalCapturedAt: "2026-09-15T08:00:00.123456+00:00",
      originalReadingIds: { temperature_c: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      originalValues: { temperature_c: 25 },
    },
    metrics: [{ metric: "temperature_c", value: 24 }],
  });
  if (!r.ok) throw new Error("invalid fixture");
  return r.operation;
}
function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
  return { data, storage, journal: createManualCorrectionJournal(() => storage) };
}
describe("owner-scoped pending correction journal", () => {
  it("persists before claim and restores exact intent through a new journal instance", () => {
    const f = fixture();
    const op = operation();
    expect(f.journal.read(owner)).toEqual({ status: "empty" });
    expect(f.journal.claim(owner, op)).toEqual({ status: "claimed", operation: op });
    expect(createManualCorrectionJournal(() => f.storage).read(owner)).toEqual({
      status: "pending",
      operation: op,
    });
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
  });
  it("does not expose or clear another owner's pending operation", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    expect(f.journal.read(other)).toEqual({ status: "empty" });
    expect(f.journal.clear(other, operation())).toBe(false);
    expect(f.journal.read(owner)).toEqual({ status: "pending", operation: operation() });
  });
  it("returns the existing operation instead of replacing it with later edits", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    const edited = operation();
    Object.assign(edited.changes[0], { value: 23 });
    expect(f.journal.claim(owner, edited)).toEqual({ status: "pending", operation: operation() });
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
    expect(f.journal.clear(owner, edited)).toBe(false);
  });
  it("reclaims an identical retry without another storage write", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    expect(f.journal.claim(owner, operation())).toEqual({
      status: "claimed",
      operation: operation(),
    });
    expect(f.storage.setItem).toHaveBeenCalledTimes(1);
  });
  it("clears only the exact pending operation and verifies removal", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    expect(f.journal.clear(owner, operation())).toBe(true);
    expect(f.journal.read(owner)).toEqual({ status: "empty" });
    expect(f.journal.clear(owner, operation())).toBe(false);
  });
  it("keeps cleanup unconfirmed when removal does not persist", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    f.storage.removeItem.mockImplementation(() => {});
    expect(f.journal.clear(owner, operation())).toBe(false);
    expect(f.journal.read(owner).status).toBe("pending");
  });
  it.each(["getItem", "setItem"] as const)("blocks when %s throws", (method) => {
    const f = fixture();
    f.storage[method].mockImplementation(() => {
      throw new Error("private detail");
    });
    expect(f.journal.claim(owner, operation())).toEqual({ status: "blocked" });
  });
  it("blocks when storage access itself throws", () => {
    const journal = createManualCorrectionJournal(() => {
      throw new Error("denied");
    });
    expect(journal.read(owner)).toEqual({ status: "blocked" });
    expect(journal.claim(owner, operation())).toEqual({ status: "blocked" });
    expect(journal.clear(owner, operation())).toBe(false);
  });
  it("blocks a write that is silently discarded", () => {
    const f = fixture();
    f.storage.setItem.mockImplementation(() => {});
    expect(f.journal.claim(owner, operation())).toEqual({ status: "blocked" });
  });
  it.each(["{", "null", JSON.stringify({ version: 1, ownerId: other, operation: operation() })])(
    "does not overwrite malformed or cross-owner storage %s",
    (raw) => {
      const f = fixture();
      f.journal.claim(owner, operation());
      const key = [...f.data.keys()][0];
      f.data.set(key, raw);
      f.storage.setItem.mockClear();
      expect(f.journal.read(owner)).toEqual({ status: "blocked" });
      expect(f.journal.claim(owner, operation())).toEqual({ status: "blocked" });
      expect(f.journal.clear(owner, operation())).toBe(false);
      expect(f.data.get(key)).toBe(raw);
      expect(f.storage.setItem).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid owners and invalid intent without storage access", () => {
    const f = fixture();
    expect(f.journal.claim("", operation())).toEqual({ status: "blocked" });
    expect(f.journal.claim(owner, { ...operation(), source: "live" })).toEqual({
      status: "blocked",
    });
    expect(f.storage.getItem).not.toHaveBeenCalled();
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });
  it("returns copies independent of later caller edits", () => {
    const f = fixture();
    const op = operation();
    f.journal.claim(owner, op);
    Object.assign(op.changes[0], { value: 23 });
    expect(f.journal.read(owner)).toEqual({ status: "pending", operation: operation() });
  });

  it("blocks oversized persisted payloads instead of parsing partial intent", () => {
    const f = fixture();
    f.journal.claim(owner, operation());
    const key = [...f.data.keys()][0];
    f.data.set(key, "x".repeat(16385));
    expect(f.journal.read(owner)).toEqual({ status: "blocked" });
    expect(f.journal.claim(owner, operation())).toEqual({ status: "blocked" });
  });
});
