import {
  dedupeKeyOf,
  normalizeCapturedAtForDedupe,
  type DedupeKeyParts,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

export const CSV_PRESENCE_PAGE_SIZE = 500;
// Canonical ISO timestamps keep the IN filter below 4 KiB at this bound.
export const CSV_PRESENCE_TIMESTAMP_BATCH_SIZE = 100;
const CSV_PRESENCE_CONCURRENCY = 4;

export type CsvPresencePage =
  readonly DedupeKeyParts[] | { rows: readonly DedupeKeyParts[]; totalCount: number | null };

/** Bound lookup work to imported timestamps, not the history between them. */
export async function collectCandidateCsvSensorPresenceKeys(
  capturedAts: readonly (string | null | undefined)[],
  readPage: (capturedAts: readonly string[], from: number, to: number) => Promise<CsvPresencePage>,
  canContinue: () => boolean,
): Promise<Set<string>> {
  const timestamps = [
    ...new Set(
      capturedAts
        .map(normalizeCapturedAtForDedupe)
        .filter((timestamp): timestamp is string => timestamp !== null),
    ),
  ].sort();
  const batchCount = Math.ceil(timestamps.length / CSV_PRESENCE_TIMESTAMP_BATCH_SIZE);
  const completed: Set<string>[] = new Array(batchCount);
  let nextBatch = 0;
  let stopped = false;
  let failed = false;
  let failure: unknown;
  const isActive = () => !stopped && canContinue();

  async function collectBatches() {
    while (isActive()) {
      const index = nextBatch++;
      if (index >= batchCount) return;
      const start = index * CSV_PRESENCE_TIMESTAMP_BATCH_SIZE;
      const batch = timestamps.slice(start, start + CSV_PRESENCE_TIMESTAMP_BATCH_SIZE);
      try {
        const batchKeys = await collectCsvSensorPresenceKeys(
          (from, to) => readPage(batch, from, to),
          isActive,
        );
        if (!isActive()) {
          stopped = true;
          return;
        }
        completed[index] = batchKeys;
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
        stopped = true;
      }
    }
  }

  // Drain the bounded in-flight reads before returning or throwing; callers
  // must not begin insert fallback while a previous lookup still has readers.
  await Promise.all(
    Array.from({ length: Math.min(CSV_PRESENCE_CONCURRENCY, batchCount) }, collectBatches),
  );
  if (failed) throw failure;
  if (stopped || !canContinue()) return new Set();
  const keys = new Set<string>();
  // Merge by input batch order, not completion order, for deterministic output.
  for (const batchKeys of completed) {
    for (const key of batchKeys) keys.add(key);
  }
  return keys;
}

/** Use exact count when available; a short server-capped page alone is not EOF. */
export async function collectCsvSensorPresenceKeys(
  readPage: (from: number, to: number) => Promise<CsvPresencePage>,
  canContinue: () => boolean,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset = 0;
  while (canContinue()) {
    const page = await readPage(offset, offset + CSV_PRESENCE_PAGE_SIZE - 1);
    if (!canContinue()) return new Set();
    const rows = "rows" in page ? page.rows : page;
    const totalCount = "rows" in page ? page.totalCount : null;
    if (totalCount !== null && (!Number.isSafeInteger(totalCount) || totalCount < 0)) {
      throw new Error("Invalid CSV presence count");
    }
    if (
      totalCount !== null &&
      (offset + rows.length > totalCount || (rows.length === 0 && offset < totalCount))
    ) {
      throw new Error("CSV presence count did not match page");
    }
    if (rows.length === 0) return keys;
    const previousSize = keys.size;
    for (const row of rows) {
      const key = dedupeKeyOf(row);
      if (!key) throw new Error("Invalid CSV presence row");
      keys.add(key);
    }
    // A broken/ignored range must not keep the import in an infinite read loop.
    if (keys.size === previousSize) throw new Error("CSV presence lookup did not advance");
    offset += rows.length;
    if (totalCount !== null && offset === totalCount) return keys;
  }
  return new Set();
}
