/**
 * latestSensorSnapshotBatchRules (Codex P2 on #2303 at d6ef3a20): a cross-tent
 * window stands in for a tent's own newest-N read only when it provably holds
 * that read; every other tent falls back to its own read.
 */
import { describe, expect, it } from "vitest";
import {
  diaryWindowLimit,
  partitionWindowByTent,
  POSTGREST_MAX_ROWS,
  resolveDiaryWindow,
  sensorWindowLimit,
} from "@/lib/latestSensorSnapshotBatchRules";

const A = "tent-a";
const B = "tent-b";
const rows = (tentId: string, n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ tent_id: tentId, n: from + i }));

describe("partitionWindowByTent", () => {
  it("reproduces every tent exactly when the window was not full", () => {
    const window = [...rows(A, 3), ...rows(B, 1)];
    const out = partitionWindowByTent(window, [A, B], 50, false);
    expect(out.fallback).toEqual([]);
    expect(out.exact.get(A)).toHaveLength(3);
    expect(out.exact.get(B)).toHaveLength(1);
  });

  it("caps an exact tent at the per-tent limit, keeping window order", () => {
    const out = partitionWindowByTent(rows(A, 7), [A], 5, false);
    expect(out.exact.get(A)?.map((r) => r.n)).toEqual([0, 1, 2, 3, 4]);
  });

  it("falls back for a tent with fewer than the per-tent limit inside a full window", () => {
    // A full window may have cut B's prefix short; A already holds its newest 2.
    const window = [...rows(A, 2), ...rows(B, 1)];
    const out = partitionWindowByTent(window, [A, B], 2, true);
    expect(out.exact.get(A)).toHaveLength(2);
    expect(out.exact.has(B)).toBe(false);
    expect(out.fallback).toEqual([B]);
  });

  it("falls back for a tent absent from a full window, and is exact for one absent from a partial window", () => {
    expect(partitionWindowByTent(rows(A, 2), [A, B], 2, true).fallback).toEqual([B]);
    const partial = partitionWindowByTent(rows(A, 1), [A, B], 2, false);
    expect(partial.fallback).toEqual([]);
    expect(partial.exact.get(B)).toEqual([]);
  });

  it("ignores rows without a tent id", () => {
    const out = partitionWindowByTent([{ tent_id: null }, { tent_id: A }], [A], 5, false);
    expect(out.exact.get(A)).toHaveLength(1);
  });
});

describe("resolveDiaryWindow", () => {
  const first = (row: { ok: boolean; n: number }) => (row.ok ? { hit: row.n } : null);

  it("returns the first usable candidate in order, full window or not", () => {
    const own = [
      { ok: false, n: 0 },
      { ok: true, n: 1 },
      { ok: true, n: 2 },
    ];
    expect(resolveDiaryWindow(own, true, 200, first)).toEqual({
      kind: "found",
      snapshot: { hit: 1 },
    });
  });

  it("is final with nothing usable only when the window held the whole bounded set", () => {
    const none = [{ ok: false, n: 0 }];
    expect(resolveDiaryWindow(none, false, 200, first)).toEqual({ kind: "none" });
    expect(resolveDiaryWindow(none, true, 200, first)).toEqual({ kind: "fallback" });
    expect(resolveDiaryWindow([], false, 200, first)).toEqual({ kind: "none" });
  });

  it("falls back when the complete set exceeds the per-tent candidate bound", () => {
    const many = Array.from({ length: 3 }, (_, n) => ({ ok: false, n }));
    expect(resolveDiaryWindow(many, false, 2, first)).toEqual({ kind: "fallback" });
  });
});

describe("window limits stay under the PostgREST row ceiling (Codex P1 at 3d1e5800)", () => {
  it("asks for per-tent × tents up to the ceiling, never past it", () => {
    expect(sensorWindowLimit(3, 50)).toBe(150);
    expect(sensorWindowLimit(20, 50)).toBe(1000);
    expect(sensorWindowLimit(21, 50)).toBe(POSTGREST_MAX_ROWS);
  });

  it("leaves room for the diary read's one-row lookahead", () => {
    expect(diaryWindowLimit(3, 20)).toBe(60);
    expect(diaryWindowLimit(60, 20)).toBe(POSTGREST_MAX_ROWS - 1);
  });
});
