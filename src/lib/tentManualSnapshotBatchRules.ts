import { isUuid } from "@/lib/isUuid";
import {
  diaryRowToManualSnapshotRecord,
  type ManualSnapshotDiaryRow,
} from "@/lib/manualSnapshotDiaryAdapter";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";

export const TENT_MANUAL_SNAPSHOT_BATCH_ID_CHUNK_SIZE = 50;
export const TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE = 200;
export const TENT_MANUAL_SNAPSHOT_BATCH_MAX_PAGE_REQUESTS = 10;

export type TentManualSnapshotUnavailableReason = "cap_exhausted" | "concurrency_ambiguous";

export type TentManualSnapshotResolution =
  | { kind: "found"; card: ManualSnapshotTimelineCard }
  | { kind: "empty" }
  | { kind: "unavailable"; reason: TentManualSnapshotUnavailableReason };

export interface TentManualSnapshotBatchData {
  byTent: Record<string, TentManualSnapshotResolution>;
  pageRequests: number;
}

export interface TentManualSnapshotBatchPageRequest {
  chunkIndex: number;
  pageIndex: number;
  tentIds: readonly string[];
  from: number;
  to: number;
  /** First page's newest timestamp. Later pages stay inside that fixed window. */
  upperBoundEntryAt: string | null;
  /** Later pages must repeat this row at index zero before it is discarded. */
  expectedBoundaryRowId: string | null;
}

export type LoadTentManualSnapshotBatchPage = (
  request: TentManualSnapshotBatchPageRequest,
  signal?: AbortSignal,
) => Promise<readonly ManualSnapshotDiaryRow[]>;

export interface ScanLatestTentManualSnapshotsOptions {
  chunkSize?: number;
  pageSize?: number;
  maxPageRequests?: number;
  signal?: AbortSignal;
}

interface ChunkScanState {
  chunkIndex: number;
  tentIds: string[];
  pageIndex: number;
  upperBoundEntryAt: string | null;
  expectedBoundaryRowId: string | null;
  seenRowIds: Set<string>;
  done: boolean;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.floor(value);
}

export function normalizeTentManualSnapshotIds(tentIds: readonly string[]): string[] {
  return [...new Set(tentIds.filter(isUuid))].sort((a, b) => a.localeCompare(b));
}

function chunkTentIds(tentIds: readonly string[], chunkSize: number): ChunkScanState[] {
  const chunks: ChunkScanState[] = [];
  for (let start = 0; start < tentIds.length; start += chunkSize) {
    chunks.push({
      chunkIndex: chunks.length,
      tentIds: tentIds.slice(start, start + chunkSize),
      pageIndex: 0,
      upperBoundEntryAt: null,
      expectedBoundaryRowId: null,
      seenRowIds: new Set<string>(),
      done: false,
    });
  }
  return chunks;
}

function unresolvedTentIds(
  chunk: ChunkScanState,
  byTent: Readonly<Record<string, TentManualSnapshotResolution>>,
): string[] {
  return chunk.tentIds.filter((tentId) => byTent[tentId]?.kind !== "found");
}

function markUnresolved(
  chunk: ChunkScanState,
  byTent: Record<string, TentManualSnapshotResolution>,
  resolution: Exclude<TentManualSnapshotResolution, { kind: "found" }>,
): void {
  for (const tentId of unresolvedTentIds(chunk, byTent)) byTent[tentId] = resolution;
  chunk.done = true;
}

function nextActiveChunk(chunks: readonly ChunkScanState[], startIndex: number): number | null {
  for (let offset = 0; offset < chunks.length; offset += 1) {
    const index = (startIndex + offset) % chunks.length;
    if (!chunks[index].done) return index;
  }
  return null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Deterministically scans server-filtered manual-snapshot candidates.
 *
 * The injected loader is the only I/O seam. Chunks are visited round-robin,
 * pages overlap by one row, and a shifted boundary fails closed instead of
 * turning an ambiguous scan into an established empty result.
 */
export async function scanLatestTentManualSnapshots(
  tentIds: readonly string[],
  loadPage: LoadTentManualSnapshotBatchPage,
  options: ScanLatestTentManualSnapshotsOptions = {},
): Promise<TentManualSnapshotBatchData> {
  const normalizedTentIds = normalizeTentManualSnapshotIds(tentIds);
  const chunkSize = Math.min(
    positiveInteger(options.chunkSize, TENT_MANUAL_SNAPSHOT_BATCH_ID_CHUNK_SIZE),
    TENT_MANUAL_SNAPSHOT_BATCH_ID_CHUNK_SIZE,
  );
  const requestedPageSize = positiveInteger(options.pageSize, TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE);
  const pageSize =
    requestedPageSize >= 2
      ? Math.min(requestedPageSize, TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE)
      : TENT_MANUAL_SNAPSHOT_BATCH_PAGE_SIZE;
  const maxPageRequests = Math.min(
    positiveInteger(options.maxPageRequests, TENT_MANUAL_SNAPSHOT_BATCH_MAX_PAGE_REQUESTS),
    TENT_MANUAL_SNAPSHOT_BATCH_MAX_PAGE_REQUESTS,
  );
  const chunks = chunkTentIds(normalizedTentIds, chunkSize);
  const byTent: Record<string, TentManualSnapshotResolution> = {};
  let pageRequests = 0;
  let roundRobinIndex = 0;

  while (pageRequests < maxPageRequests) {
    throwIfAborted(options.signal);
    const chunkIndex = nextActiveChunk(chunks, roundRobinIndex);
    if (chunkIndex === null) break;
    const chunk = chunks[chunkIndex];
    const from = chunk.pageIndex * (pageSize - 1);
    const request: TentManualSnapshotBatchPageRequest = {
      chunkIndex: chunk.chunkIndex,
      pageIndex: chunk.pageIndex,
      tentIds: chunk.tentIds,
      from,
      to: from + pageSize - 1,
      upperBoundEntryAt: chunk.upperBoundEntryAt,
      expectedBoundaryRowId: chunk.expectedBoundaryRowId,
    };

    const rows = [...(await loadPage(request, options.signal))];
    throwIfAborted(options.signal);
    pageRequests += 1;
    roundRobinIndex = (chunkIndex + 1) % chunks.length;

    let candidates = rows;
    if (chunk.pageIndex > 0) {
      if (rows.length === 0 || rows[0]?.id !== chunk.expectedBoundaryRowId) {
        markUnresolved(chunk, byTent, {
          kind: "unavailable",
          reason: "concurrency_ambiguous",
        });
        continue;
      }
      candidates = rows.slice(1);
    }

    for (const candidate of candidates) {
      if (!candidate.id || chunk.seenRowIds.has(candidate.id)) continue;
      chunk.seenRowIds.add(candidate.id);
      if (!candidate.tent_id || !chunk.tentIds.includes(candidate.tent_id)) continue;
      if (byTent[candidate.tent_id]?.kind === "found") continue;
      const record = diaryRowToManualSnapshotRecord(candidate);
      if (!record || record.tentId !== candidate.tent_id) continue;
      byTent[candidate.tent_id] = {
        kind: "found",
        card: buildManualSnapshotTimelineCard(record),
      };
    }

    if (unresolvedTentIds(chunk, byTent).length === 0) {
      chunk.done = true;
      continue;
    }

    if (rows.length < pageSize) {
      markUnresolved(chunk, byTent, { kind: "empty" });
      continue;
    }

    const firstEntryAt = rows[0]?.entry_at;
    const lastRowId = rows.at(-1)?.id;
    if (
      (chunk.pageIndex === 0 && (typeof firstEntryAt !== "string" || firstEntryAt.length === 0)) ||
      typeof lastRowId !== "string" ||
      lastRowId.length === 0
    ) {
      markUnresolved(chunk, byTent, {
        kind: "unavailable",
        reason: "concurrency_ambiguous",
      });
      continue;
    }

    if (chunk.pageIndex === 0) chunk.upperBoundEntryAt = firstEntryAt;
    chunk.expectedBoundaryRowId = lastRowId;
    chunk.pageIndex += 1;
  }

  for (const chunk of chunks) {
    if (!chunk.done) {
      markUnresolved(chunk, byTent, { kind: "unavailable", reason: "cap_exhausted" });
    }
  }

  return { byTent, pageRequests };
}
