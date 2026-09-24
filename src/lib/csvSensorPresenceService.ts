import {
  dedupeKeyOf,
  normalizeCapturedAtForDedupe,
  type DedupeKeyParts,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

export const CSV_PRESENCE_PAGE_SIZE = 500;
export const CSV_PRESENCE_TIMESTAMP_BATCH_SIZE = 25;

/** Bound lookup work to imported timestamps, not the history between them. */
export async function collectCandidateCsvSensorPresenceKeys(
  capturedAts: readonly (string | null | undefined)[],
  readPage: (
    capturedAts: readonly string[],
    from: number,
    to: number,
  ) => Promise<readonly DedupeKeyParts[]>,
  canContinue: () => boolean,
): Promise<Set<string>> {
  const timestamps = [
    ...new Set(
      capturedAts
        .map(normalizeCapturedAtForDedupe)
        .filter((timestamp): timestamp is string => timestamp !== null),
    ),
  ].sort();
  const keys = new Set<string>();
  for (let start = 0; start < timestamps.length; start += CSV_PRESENCE_TIMESTAMP_BATCH_SIZE) {
    if (!canContinue()) return new Set();
    const batch = timestamps.slice(start, start + CSV_PRESENCE_TIMESTAMP_BATCH_SIZE);
    const batchKeys = await collectCsvSensorPresenceKeys(
      (from, to) => readPage(batch, from, to),
      canContinue,
    );
    if (!canContinue()) return new Set();
    for (const key of batchKeys) keys.add(key);
  }
  return keys;
}

/** Read every visible presence page; a short server-capped page is not EOF. */
export async function collectCsvSensorPresenceKeys(
  readPage: (from: number, to: number) => Promise<readonly DedupeKeyParts[]>,
  canContinue: () => boolean,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset = 0;
  while (canContinue()) {
    const rows = await readPage(offset, offset + CSV_PRESENCE_PAGE_SIZE - 1);
    if (!canContinue()) return new Set();
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
  }
  return new Set();
}
