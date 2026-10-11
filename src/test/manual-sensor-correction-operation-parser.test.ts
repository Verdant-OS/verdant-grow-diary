import { describe, expect, it } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { parseManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationParser";

function operation() {
  const result = buildManualCorrectionOperation({
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    correction: {
      tentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      originalCapturedAt: "2026-09-15T08:00:00.123456+00:00",
      originalReadingIds: { temperature_c: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      originalValues: { temperature_c: 25 },
    },
    metrics: [
      { metric: "temperature_c", value: 24 },
      { metric: "humidity_pct", value: 55 },
    ],
  });
  if (!result.ok) throw new Error("invalid fixture");
  return result.operation;
}
describe("persisted manual correction operation parser", () => {
  it("round-trips the exact canonical identity and microsecond observation time", () => {
    const op = operation();
    expect(parseManualCorrectionOperation(JSON.parse(JSON.stringify(op)))).toEqual(op);
  });
  it("accepts object-key order without changing canonical array order", () => {
    const op = operation();
    expect(
      parseManualCorrectionOperation(Object.fromEntries(Object.entries(op).reverse())),
    ).toEqual(op);
  });
  it("returns independent copies and is deterministic", () => {
    const op = operation();
    const first = parseManualCorrectionOperation(op);
    expect(first).toEqual(parseManualCorrectionOperation(op));
    expect(first).not.toBe(op);
    Object.assign(op.changes[0], { value: 88 });
    expect(first).toEqual(operation());
  });
  it.each([null, undefined, false, [], "{}", {}, 42])(
    "rejects missing or invalid records %j",
    (value) => {
      expect(parseManualCorrectionOperation(value)).toBeNull();
    },
  );
  it.each([
    ["version", 2],
    ["source", "live"],
    ["operationId", "bad"],
    ["tentId", null],
    ["observedAt", "2026-02-30T00:00:00Z"],
    ["user_id", "forged"],
    ["originals", []],
    ["changes", []],
    ["changes", "bad"],
  ])("rejects invalid or extra %s", (key, value) => {
    expect(parseManualCorrectionOperation({ ...operation(), [key]: value })).toBeNull();
  });
  it.each([
    ["originalReadingId", null],
    ["expectedValue", 26],
    ["metric", "unknown"],
    ["value", Infinity],
    ["value", "24"],
    ["derived", true],
  ])("rejects altered change %s", (key, value) => {
    const op = operation();
    expect(
      parseManualCorrectionOperation({
        ...op,
        changes: [op.changes[0], { ...op.changes[1], [key]: value }],
      }),
    ).toBeNull();
  });
  it("rejects duplicate metrics and noncanonical ordering", () => {
    const op = operation();
    expect(
      parseManualCorrectionOperation({ ...op, changes: [op.changes[0], op.changes[0]] }),
    ).toBeNull();
    expect(
      parseManualCorrectionOperation({ ...op, originals: [op.originals[0], op.originals[0]] }),
    ).toBeNull();
    expect(
      parseManualCorrectionOperation({ ...op, changes: [...op.changes].reverse() }),
    ).toBeNull();
  });
  it("rejects noop changes, unknown original fields and noncanonical IDs", () => {
    const op = operation();
    expect(
      parseManualCorrectionOperation({ ...op, changes: [{ ...op.changes[1], value: 25 }] }),
    ).toBeNull();
    expect(
      parseManualCorrectionOperation({
        ...op,
        originals: [{ ...op.originals[0], raw_payload: {} }],
      }),
    ).toBeNull();
    expect(
      parseManualCorrectionOperation({ ...op, operationId: op.operationId.toUpperCase() }),
    ).toBeNull();
  });
});
