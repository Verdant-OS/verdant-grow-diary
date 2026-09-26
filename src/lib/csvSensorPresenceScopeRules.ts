import {
  normalizeCapturedAtForDedupe,
  type ExistingKeysQueryScope,
} from "@/lib/csv-import/sensorReadingsBatchInsert";

/** Apply the requested range before batching timestamp lookups, including race recovery. */
export function filterCsvPresenceTimestampsForScope(
  capturedAts: readonly (string | null | undefined)[] | null | undefined,
  scope: Pick<ExistingKeysQueryScope, "minCapturedAt" | "maxCapturedAt"> | null | undefined,
): string[] {
  const min = normalizeCapturedAtForDedupe(scope?.minCapturedAt);
  const max = normalizeCapturedAtForDedupe(scope?.maxCapturedAt);
  if (!min || !max || min > max) return [];
  return (capturedAts ?? []).flatMap((value) => {
    const timestamp = normalizeCapturedAtForDedupe(value);
    return timestamp && timestamp >= min && timestamp <= max ? [timestamp] : [];
  });
}
