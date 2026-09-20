import { describe, expect, it } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { confirmManualCorrectionReceipt } from "@/lib/manualSensorCorrectionReceiptRules";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tent = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const original = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const added = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
function operation() {
  const result = buildManualCorrectionOperation({
    operationId: id,
    correction: {
      tentId: tent,
      originalCapturedAt: "2026-09-15T08:00:00.123456+00:00",
      originalReadingIds: { temperature_c: original },
      originalValues: { temperature_c: 25 },
    },
    metrics: [
      { metric: "temperature_c", value: 24 },
      { metric: "humidity_pct", value: 55 },
    ],
  });
  if (!result.ok) throw new Error("fixture must be valid");
  return result.operation;
}
function receipt() {
  const request = operation();
  return {
    operationId: id,
    observedAt: request.observedAt,
    changedAt: "2026-09-17T08:00:00.123456+00:00",
    revision: 1,
    reused: false,
    request,
    changes: [
      { metric: "humidity_pct", readingId: added, previousValue: null, value: 55, added: true },
      { metric: "temperature_c", readingId: original, previousValue: 25, value: 24, added: false },
    ],
  };
}
describe("manual correction receipt confirmation", () => {
  it("does not confirm without a pending operation", () => {
    expect(confirmManualCorrectionReceipt(receipt(), null)).toBe(false);
    expect(confirmManualCorrectionReceipt(receipt(), undefined)).toBe(false);
  });
  it("confirms the exact operation including added and corrected fields", () => {
    expect(confirmManualCorrectionReceipt(receipt(), operation())).toBe(true);
  });
  it("confirms an exact replay without requiring a new revision", () => {
    expect(confirmManualCorrectionReceipt({ ...receipt(), reused: true }, operation())).toBe(true);
  });
  it("accepts PostgreSQL JSONB object-key ordering", () => {
    const r = receipt();
    r.request = Object.fromEntries(Object.entries(r.request).reverse()) as typeof r.request;
    expect(confirmManualCorrectionReceipt(r, operation())).toBe(true);
  });
  it.each([null, undefined, {}, [], { count: 2 }])(
    "rejects absent or count-only replies %j",
    (value) => {
      expect(confirmManualCorrectionReceipt(value, operation())).toBe(false);
    },
  );
  it.each([
    ["operationId", added],
    ["observedAt", "2026-09-17T08:00:00Z"],
    ["changedAt", "2026-02-30T00:00:00Z"],
    ["changedAt", "tomorrow"],
    ["revision", 0],
    ["revision", 1.5],
    ["revision", Number.MAX_SAFE_INTEGER + 1],
    ["reused", "false"],
    ["request", undefined],
    ["changes", []],
  ])("rejects an invalid %s", (key, value) => {
    expect(confirmManualCorrectionReceipt({ ...receipt(), [key]: value }, operation())).toBe(false);
  });
  it.each(["tentId", "source", "originals", "changes"])("binds request %s", (key) => {
    const r = receipt();
    const request = {
      ...r.request,
      [key]: key === "tentId" ? added : key === "source" ? "live" : [],
    };
    expect(confirmManualCorrectionReceipt({ ...r, request }, operation())).toBe(false);
  });
  it.each([
    [0, "readingId", original],
    [0, "readingId", "not-an-id"],
    [0, "added", false],
    [0, "previousValue", 0],
    [1, "readingId", added],
    [1, "previousValue", 26],
    [1, "value", 26],
    [1, "metric", "vpd_kpa"],
    [1, "added", true],
  ])("rejects mismatched resolved change %s %s", (index, key, value) => {
    const r = receipt();
    r.changes[Number(index)] = { ...r.changes[Number(index)], [key]: value };
    expect(confirmManualCorrectionReceipt(r, operation())).toBe(false);
  });
  it("rejects extra receipt fields and duplicate resolved changes", () => {
    expect(confirmManualCorrectionReceipt({ ...receipt(), user_id: id }, operation())).toBe(false);
    const r = receipt();
    r.changes[1] = r.changes[0];
    expect(confirmManualCorrectionReceipt(r, operation())).toBe(false);
  });
  it("is deterministic and leaves caller values untouched", () => {
    const r = receipt();
    const o = operation();
    const before = JSON.stringify([r, o]);
    expect(confirmManualCorrectionReceipt(r, o)).toBe(true);
    expect(confirmManualCorrectionReceipt(r, o)).toBe(true);
    expect(JSON.stringify([r, o])).toBe(before);
  });
});
