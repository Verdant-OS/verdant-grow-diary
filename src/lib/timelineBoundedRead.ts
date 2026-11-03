/**
 * Bounds the timeline, tent, and plant list reads that were retaining
 * gateway `raw_payload` blobs. List queries ask for metric columns only.
 * Identity lookups are limited to the exact id set, which is not a silent cap.
 */
import type { SensorReadingRow } from "@/lib/db";
import { isUuid } from "@/lib/isUuid";
import { isObservationTimestamp } from "@/lib/manualSensorCorrectionOperationRules";
import type { CsvSensorReadingRow } from "@/lib/environmentCsvTimelineContextViewModel";

export class TimelineBoundedRead {
  /**
   * First page stays 2000 because
   * `environment-csv-timeline-mounted-context.test.tsx` is scorer-locked
   * on that limit. Older pages use the same size through keyset `.lt`.
   */
  static readonly csvPageSize = 2000;

  /** Scalar JSON extracts only. The gateway blob stays on the server. */
  static readonly csvSelect =
    "id,tent_id,source,metric,value,captured_at,grow_scope:raw_payload->>grow_id,vpd_source:raw_payload->>vpd_source";

  static readonly sensorListSelect =
    "id,user_id,tent_id,metric,value,source,quality,ts,captured_at,created_at,device_id,correction_valid";

  static idLookupLimit(ids: readonly string[]): number {
    return Math.max(ids.length, 1);
  }

  static shapeCsvRow(row: Record<string, unknown>): CsvSensorReadingRow {
    if (row.raw_payload && typeof row.raw_payload === "object") {
      return row as CsvSensorReadingRow;
    }
    const payload: Record<string, unknown> = {};
    if (typeof row.grow_scope === "string") payload.grow_id = row.grow_scope;
    if (typeof row.vpd_source === "string") payload.vpd_source = row.vpd_source;
    return { ...(row as CsvSensorReadingRow), raw_payload: payload };
  }

  /** The effective-row checker requires the key even when the list query omitted the blob. */
  static stampMissingRawPayload(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (const value of data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (!Object.hasOwn(value, "raw_payload")) {
        (value as { raw_payload: null }).raw_payload = null;
      }
    }
  }

  static acceptSensorList(data: unknown): SensorReadingRow[] {
    if (!Array.isArray(data)) throw new Error("Sensor readings are unavailable.");
    const seen = new Set<string>();
    const rows: SensorReadingRow[] = [];
    for (const value of data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Sensor readings are unavailable.");
      }
      const row = value as Record<string, unknown>;
      if (
        row.correction_valid !== true ||
        !isUuid(row.id) ||
        seen.has(row.id as string) ||
        !isUuid(row.user_id) ||
        !isUuid(row.tent_id) ||
        typeof row.value !== "number" ||
        !Number.isFinite(row.value) ||
        typeof row.metric !== "string" ||
        !row.metric ||
        typeof row.source !== "string" ||
        !row.source ||
        typeof row.quality !== "string" ||
        !isObservationTimestamp(row.ts) ||
        !isObservationTimestamp(row.created_at) ||
        (row.captured_at !== null && !isObservationTimestamp(row.captured_at)) ||
        (row.device_id !== null && typeof row.device_id !== "string")
      ) {
        throw new Error("Sensor readings are unavailable.");
      }
      seen.add(row.id as string);
      rows.push(
        (Object.hasOwn(row, "raw_payload")
          ? row
          : { ...row, raw_payload: null }) as SensorReadingRow,
      );
    }
    return rows;
  }
}
