import { describe, expect, it } from "vitest";
import { buildManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import {
  getPendingCorrectionRecovery,
  restoreManualCorrectionDraft,
} from "@/lib/manualSensorCorrectionRecoveryRules";

import { decodeManualCorrectionHash } from "@/lib/manualSensorCorrectionContext";

const tentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const readingId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const observedAt = "2026-09-16T08:00:00.123456+00:00";
function operation() {
  const result = buildManualCorrectionOperation({
    operationId,
    correction: {
      tentId,
      originalCapturedAt: observedAt,
      originalReadingIds: { temperature_c: readingId },
      originalValues: { temperature_c: 25 },
    },
    metrics: [
      { metric: "temperature_c", value: 24 },
      { metric: "humidity_pct", value: 60 },
    ],
  });
  if (!result.ok) throw new Error("Invalid test fixture");
  return result.operation;
}

describe("manual correction draft recovery", () => {
  it("restores original identity and edited values without inventing an ID for an addition", () => {
    const restored = restoreManualCorrectionDraft(operation(), [tentId]);
    expect(restored).toEqual({
      operationId,
      correction: {
        tentId,
        originalCapturedAt: observedAt,
        originalReadingIds: { temperature_c: readingId },
        originalValues: { temperature_c: 25 },
      },
      metrics: [
        { metric: "humidity_pct", value: 60 },
        { metric: "temperature_c", value: 24 },
      ],
    });
    expect(buildManualCorrectionOperation(restored)).toEqual({ ok: true, operation: operation() });
  });

  it("keeps unchanged original metrics available for form prefill", () => {
    const value = operation();
    const pending = {
      ...value,
      changes: value.changes.filter((row) => row.metric !== "temperature_c"),
    };
    expect(restoreManualCorrectionDraft(pending, [tentId])?.metrics).toContainEqual({
      metric: "temperature_c",
      value: 25,
    });
  });

  it.each([null, undefined, [], {}, { ...operation(), source: "csv" }])(
    "rejects malformed pending data: %j",
    (value) => {
      expect(restoreManualCorrectionDraft(value, [tentId])).toBeNull();
    },
  );

  it.each([null, undefined, [], ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]])(
    "does not restore a target absent from the current owned tent list: %j",
    (owned) => {
      expect(restoreManualCorrectionDraft(operation(), owned)).toBeNull();
    },
  );

  it("is deterministic and isolates pending intent from later form edits", () => {
    const pending = operation();
    const before = JSON.stringify(pending);
    const first = restoreManualCorrectionDraft(pending, [tentId]);
    expect(first).toEqual(restoreManualCorrectionDraft(pending, [tentId]));
    if (!first) throw new Error("Recovery unexpectedly blocked");
    first.metrics[0].value = 99;
    first.correction.originalValues.temperature_c = 99;
    expect(JSON.stringify(pending)).toBe(before);
    expect(restoreManualCorrectionDraft(pending, [tentId])?.metrics[0].value).toBe(60);
  });
});

describe("pending correction navigation", () => {
  it("reconstructs the original tent and observation without exposing owner or operation identifiers", () => {
    const op = operation();
    const result = getPendingCorrectionRecovery(
      { status: "pending", operation: op },
      [tentId],
      null,
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected recovery link");
    const url = new URL(result.href, "https://example.invalid");
    expect(url.pathname).toBe("/sensors");
    expect(url.searchParams.get("tentId")).toBe(tentId);
    expect(decodeManualCorrectionHash(url.hash)).toEqual(
      restoreManualCorrectionDraft(op, [tentId])?.correction,
    );
    expect(result.href).not.toContain(operationId);
    expect(result).toEqual(
      getPendingCorrectionRecovery({ status: "pending", operation: op }, [tentId], null),
    );
  });
  it.each([null, undefined, []])(
    "does not link to a tent outside the available scope %j",
    (owned) => {
      expect(
        getPendingCorrectionRecovery({ status: "pending", operation: operation() }, owned, null),
      ).toEqual({ status: "unavailable" });
    },
  );
  it("does not offer redundant navigation when the pending observation is already open", () => {
    const op = operation();
    const current = restoreManualCorrectionDraft(op, [tentId])!.correction;
    expect(
      getPendingCorrectionRecovery({ status: "pending", operation: op }, [tentId], current),
    ).toEqual({ status: "none" });
  });
  it("offers the pending observation when a different correction is open", () => {
    const op = operation();
    const current = {
      ...restoreManualCorrectionDraft(op, [tentId])!.correction,
      originalCapturedAt: "2026-09-15T08:00:00.000Z",
    };
    expect(
      getPendingCorrectionRecovery({ status: "pending", operation: op }, [tentId], current).status,
    ).toBe("available");
  });
  it("distinguishes unreadable storage from no pending correction", () => {
    expect(getPendingCorrectionRecovery({ status: "blocked" }, [tentId], null)).toEqual({
      status: "blocked",
    });
    expect(getPendingCorrectionRecovery({ status: "empty" }, [tentId], null)).toEqual({
      status: "none",
    });
  });
});
