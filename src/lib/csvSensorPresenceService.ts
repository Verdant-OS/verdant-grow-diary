import { dedupeKeyOf, type DedupeKeyParts } from "@/lib/csv-import/sensorReadingsBatchInsert";

export const CSV_PRESENCE_PAGE_SIZE = 500;

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
