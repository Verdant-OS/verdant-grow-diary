import { describe, expect, it, vi } from "vitest";
import type { ManualSnapshotDiaryRow } from "@/lib/manualSnapshotDiaryAdapter";
import {
  TENT_MANUAL_SNAPSHOT_BATCH_ID_CHUNK_SIZE,
  TENT_MANUAL_SNAPSHOT_BATCH_MAX_PAGE_REQUESTS,
  TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE,
  normalizeTentManualSnapshotIds,
  scanLatestTentManualSnapshots,
  type TentManualSnapshotBatchPageRequest,
} from "@/lib/tentManualSnapshotBatchRules";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function row(
  id: string,
  tentId: string,
  entryAt: string,
  snapshot: Record<string, unknown> = {
    source: "manual",
    temp_f: 72,
    humidity_percent: 55,
  },
): ManualSnapshotDiaryRow {
  return {
    id,
    plant_id: null,
    tent_id: tentId,
    entry_at: entryAt,
    note: null,
    details: { manual_sensor_snapshot: snapshot },
  };
}

function invalidRow(index: number, tentId: string): ManualSnapshotDiaryRow {
  return row(
    uuid(100_000 + index),
    tentId,
    new Date(Date.UTC(2026, 7, 20, 12, 0, 0) - index * 1_000).toISOString(),
    { source: "live", temp_f: 72 },
  );
}

describe("tent manual snapshot batch rules", () => {
  it("sorts, deduplicates, and rejects non-UUID tent ids before query planning", () => {
    expect(normalizeTentManualSnapshotIds([uuid(3), "t1", uuid(1), uuid(3), uuid(2)])).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
  });

  it("uses the reviewed finite chunk, page, and global request bounds", () => {
    expect(TENT_MANUAL_SNAPSHOT_BATCH_ID_CHUNK_SIZE).toBe(50);
    expect(TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE).toBe(200);
    expect(TENT_MANUAL_SNAPSHOT_BATCH_MAX_PAGE_REQUESTS).toBe(10);
  });

  it("does not let caller overrides exceed the reviewed hard bounds", async () => {
    const tentIds = Array.from({ length: 501 }, (_, index) => uuid(index + 1));
    const calls: TentManualSnapshotBatchPageRequest[] = [];

    await scanLatestTentManualSnapshots(
      tentIds,
      async (request) => {
        calls.push(request);
        return Array.from({ length: 200 }, (_, index) => invalidRow(index, request.tentIds[0]));
      },
      { chunkSize: 500, pageSize: 500, maxPageRequests: 20 },
    );

    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.tentIds.length <= 50)).toBe(true);
    expect(calls.every((call) => call.to - call.from + 1 === 200)).toBe(true);
  });

  it("falls back from an invalid pageSize=1 so overlap offsets always advance", async () => {
    const tentId = uuid(1);
    const calls: TentManualSnapshotBatchPageRequest[] = [];
    const fullPage = Array.from({ length: 200 }, (_, index) => invalidRow(index, tentId));

    await scanLatestTentManualSnapshots(
      [tentId],
      async (request) => {
        calls.push(request);
        return request.pageIndex === 0 ? fullPage : [fullPage[199]];
      },
      { pageSize: 1, maxPageRequests: 2 },
    );

    expect(calls.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: 0, to: 199 },
      { from: 199, to: 398 },
    ]);
  });

  it("keeps scanning server-filtered candidates past the old 50-row masking boundary", async () => {
    const tentId = uuid(1);
    const noise = Array.from({ length: 60 }, (_, index) => invalidRow(index, tentId));
    const valid = row(uuid(200_000), tentId, "2026-08-20T10:00:00.000Z");
    const loadPage = vi.fn(async () => [...noise, valid]);

    const result = await scanLatestTentManualSnapshots([tentId], loadPage);

    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(result.byTent[tentId]).toMatchObject({ kind: "found", card: { id: valid.id } });
  });

  it("resolves each tent from its first compatible air candidate and ignores duplicate row ids", async () => {
    const tentA = uuid(1);
    const tentB = uuid(2);
    const newestA = row(uuid(10), tentA, "2026-08-20T12:00:00.000Z");
    const olderA = row(uuid(11), tentA, "2026-08-20T11:00:00.000Z");
    const newestB = row(uuid(12), tentB, "2026-08-20T10:00:00.000Z");

    const result = await scanLatestTentManualSnapshots([tentB, tentA, tentA], async () => [
      newestA,
      newestA,
      olderA,
      newestB,
    ]);

    expect(result.byTent[tentA]).toMatchObject({ kind: "found", card: { id: newestA.id } });
    expect(result.byTent[tentB]).toMatchObject({ kind: "found", card: { id: newestB.id } });
    expect(result.pageRequests).toBe(1);
  });

  it("skips a newer non-air card and selects the newest compatible air card without mixing evidence", async () => {
    const tentId = uuid(1);
    const newestNonAir = row(uuid(20), tentId, "2026-08-20T12:00:00.000Z", {
      source: "manual",
      ph: 6.1,
      ec: 1.2,
    });
    const olderAir = row(uuid(21), tentId, "2026-08-20T11:00:00.000Z", {
      source: "manual",
      temp_f: 72,
      humidity_percent: 55,
    });

    const result = await scanLatestTentManualSnapshots([tentId], async () => [
      newestNonAir,
      olderAir,
    ]);

    expect(result.byTent[tentId]).toMatchObject({
      kind: "found",
      card: {
        id: olderAir.id,
        capturedAt: olderAir.entry_at,
        source: "manual",
        severity: "ok",
      },
    });
    const resolution = result.byTent[tentId];
    if (resolution.kind !== "found") throw new Error("Expected compatible air card");
    expect(resolution.card.readings.map((reading) => reading.field)).not.toContain("reservoir_ph");
    expect(resolution.card.readings.map((reading) => reading.field)).not.toContain(
      "reservoir_ec_mscm",
    );
  });

  it("preserves the newest non-air card as explicit unusable evidence only after exhaustion", async () => {
    const tentId = uuid(1);
    const newestNonAir = row(uuid(30), tentId, "2026-08-20T12:00:00.000Z", {
      source: "manual",
      ph: 6.1,
    });
    const olderNonAir = row(uuid(31), tentId, "2026-08-20T11:00:00.000Z", {
      source: "manual",
      ec: 1.2,
    });

    const result = await scanLatestTentManualSnapshots([tentId], async () => [
      newestNonAir,
      olderNonAir,
    ]);

    expect(result.byTent[tentId]).toMatchObject({
      kind: "found",
      card: { id: newestNonAir.id, capturedAt: newestNonAir.entry_at, source: "manual" },
    });
  });

  it("does not promote retained non-air evidence when the page cap prevents exhaustion", async () => {
    const tentId = uuid(1);
    const newestNonAir = row(uuid(40), tentId, "2026-08-20T12:00:00.000Z", {
      source: "manual",
      ph: 6.1,
    });
    const boundary = invalidRow(40, tentId);

    const result = await scanLatestTentManualSnapshots(
      [tentId],
      async () => [newestNonAir, boundary],
      { pageSize: 2, maxPageRequests: 1 },
    );

    expect(result.byTent[tentId]).toEqual({ kind: "unavailable", reason: "cap_exhausted" });
  });

  it("does not promote retained non-air evidence across an ambiguous page boundary", async () => {
    const tentId = uuid(1);
    const newestNonAir = row(uuid(50), tentId, "2026-08-20T12:00:00.000Z", {
      source: "manual",
      ph: 6.1,
    });
    const boundary = invalidRow(50, tentId);

    const result = await scanLatestTentManualSnapshots(
      [tentId],
      async (request) =>
        request.pageIndex === 0
          ? [newestNonAir, boundary]
          : [invalidRow(999, tentId), row(uuid(51), tentId, "2026-08-20T11:00:00.000Z")],
      { pageSize: 2, maxPageRequests: 2 },
    );

    expect(result.byTent[tentId]).toEqual({
      kind: "unavailable",
      reason: "concurrency_ambiguous",
    });
  });

  it("round-robins chunks so a noisy first chunk cannot starve a later tent at the global budget", async () => {
    const tentIds = Array.from({ length: 51 }, (_, index) => uuid(index + 1));
    const quietTent = tentIds[50];
    const calls: TentManualSnapshotBatchPageRequest[] = [];

    const result = await scanLatestTentManualSnapshots(
      tentIds,
      async (request) => {
        calls.push(request);
        if (request.chunkIndex === 1) {
          return [row(uuid(900_000), quietTent, "2026-08-20T12:00:00.000Z")];
        }
        return Array.from({ length: 200 }, (_, index) => invalidRow(index, request.tentIds[0]));
      },
      { maxPageRequests: 2 },
    );

    expect(calls.map((call) => call.chunkIndex)).toEqual([0, 1]);
    expect(result.byTent[quietTent]).toMatchObject({ kind: "found" });
    expect(result.byTent[tentIds[0]]).toEqual({
      kind: "unavailable",
      reason: "cap_exhausted",
    });
  });

  it("marks never-started and still-unresolved tents unavailable when the ten-request cap is hit", async () => {
    const tentIds = Array.from({ length: 501 }, (_, index) => uuid(index + 1));
    const loadPage = vi.fn(async (request: TentManualSnapshotBatchPageRequest) =>
      Array.from({ length: 200 }, (_, index) => invalidRow(index, request.tentIds[0])),
    );

    const result = await scanLatestTentManualSnapshots(tentIds, loadPage);

    expect(loadPage).toHaveBeenCalledTimes(10);
    expect(result.byTent[tentIds[500]]).toEqual({
      kind: "unavailable",
      reason: "cap_exhausted",
    });
    expect(Object.values(result.byTent).every((entry) => entry.kind !== "empty")).toBe(true);
  });

  it("uses a one-row overlap and rejects a shifted offset boundary as concurrency-ambiguous", async () => {
    const tentId = uuid(1);
    const firstPage = Array.from({ length: 200 }, (_, index) => invalidRow(index, tentId));
    const calls: TentManualSnapshotBatchPageRequest[] = [];

    const result = await scanLatestTentManualSnapshots([tentId], async (request) => {
      calls.push(request);
      return request.pageIndex === 0
        ? firstPage
        : [invalidRow(999, tentId), row(uuid(900_001), tentId, "2026-08-19T10:00:00.000Z")];
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      from: 199,
      to: 398,
      expectedBoundaryRowId: firstPage[199].id,
      upperBoundEntryAt: firstPage[0].entry_at,
    });
    expect(result.byTent[tentId]).toEqual({
      kind: "unavailable",
      reason: "concurrency_ambiguous",
    });
  });

  it("drops a matching overlap before processing and establishes empty only after a short page", async () => {
    const tentA = uuid(1);
    const tentB = uuid(2);
    const firstPage = Array.from({ length: 200 }, (_, index) => invalidRow(index, tentA));
    const boundary = firstPage[199];
    const validB = row(uuid(900_002), tentB, "2026-08-19T10:00:00.000Z");

    const result = await scanLatestTentManualSnapshots([tentA, tentB], async (request) =>
      request.pageIndex === 0 ? firstPage : [boundary, validB],
    );

    expect(result.byTent[tentA]).toEqual({ kind: "empty" });
    expect(result.byTent[tentB]).toMatchObject({ kind: "found", card: { id: validB.id } });
  });

  it("propagates provider errors so React Query can retain cached batch data", async () => {
    const providerError = new Error("provider unavailable");
    await expect(
      scanLatestTentManualSnapshots([uuid(1)], async () => {
        throw providerError;
      }),
    ).rejects.toBe(providerError);
  });

  it("stops scheduling pages when the owning React Query signal is aborted", async () => {
    const tentId = uuid(1);
    const controller = new AbortController();
    const fullPage = Array.from({ length: 200 }, (_, index) => invalidRow(index, tentId));
    const loadPage = vi.fn(
      async (_request: TentManualSnapshotBatchPageRequest, signal?: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        controller.abort();
        return fullPage;
      },
    );

    await expect(
      scanLatestTentManualSnapshots([tentId], loadPage, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(loadPage).toHaveBeenCalledTimes(1);
  });
});
