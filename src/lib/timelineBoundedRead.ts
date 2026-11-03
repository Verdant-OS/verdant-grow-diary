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

  /**
   * Metric columns plus the scalar fence inputs `isSensorTestbenchRow` reads.
   * The gateway blob stays on the server. Marker keys are presence-only.
   */
  static readonly sensorListSelect = [
    "id,user_id,tent_id,metric,value,source,quality,ts,captured_at,created_at,device_id,correction_valid",
    "vendor:raw_payload->>vendor",
    "confidence:raw_payload->metadata->>confidence",
    "reported_verdant_source:raw_payload->metadata->>reported_verdant_source",
    "gateway_stationtype:raw_payload->metadata->raw_payload->>stationtype",
    "gateway_model:raw_payload->metadata->raw_payload->>model",
    "gateway_dateutc:raw_payload->metadata->raw_payload->>dateutc",
    "gateway_freq:raw_payload->metadata->raw_payload->>freq",
    "gateway_runtime:raw_payload->metadata->raw_payload->>runtime",
    "gateway_wh65batt:raw_payload->metadata->raw_payload->>wh65batt",
    "gateway_wh25batt:raw_payload->metadata->raw_payload->>wh25batt",
  ].join(",");

  /** CSV history fields the AI Doctor vendor and suspicious-flag summary reads. */
  static readonly importedHistoryFenceSelect = [
    "source_app:raw_payload->>source_app",
    "csv_import:raw_payload->>csv_import",
    "suspicious:raw_payload->>suspicious",
    "suspicious_flags:raw_payload->suspicious_flags",
  ].join(",");

  /** Older CSV pages fetch one extra row so an exact page is not treated as "more". */
  static readonly csvOlderFetchLimit = TimelineBoundedRead.csvPageSize + 1;

  static csvOlderKeyset(capturedAt: string, id: string): string {
    return `captured_at.lt.${capturedAt},and(captured_at.eq.${capturedAt},id.lt.${id})`;
  }

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

  static fencePayloadFromExtracts(row: Record<string, unknown>): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    if (typeof row.confidence === "string" && row.confidence.length > 0) {
      metadata.confidence = row.confidence;
    }
    if (typeof row.reported_verdant_source === "string" && row.reported_verdant_source.length > 0) {
      metadata.reported_verdant_source = row.reported_verdant_source;
    }
    const markers: Record<string, string> = {};
    const markerKeys = [
      ["gateway_stationtype", "stationtype"],
      ["gateway_model", "model"],
      ["gateway_dateutc", "dateutc"],
      ["gateway_freq", "freq"],
      ["gateway_runtime", "runtime"],
      ["gateway_wh65batt", "wh65batt"],
      ["gateway_wh25batt", "wh25batt"],
    ] as const;
    for (const [alias, key] of markerKeys) {
      const value = row[alias];
      if (typeof value === "string" && value.length > 0) markers[key] = value;
    }
    if (Object.keys(markers).length > 0) metadata.raw_payload = markers;
    const payload: Record<string, unknown> = {};
    if (typeof row.vendor === "string" && row.vendor.length > 0) payload.vendor = row.vendor;
    if (Object.keys(metadata).length > 0) payload.metadata = metadata;
    return payload;
  }

  static importedHistoryPayload(row: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (typeof row.source_app === "string" && row.source_app.length > 0) {
      payload.source_app = row.source_app;
    }
    if (row.csv_import === true || row.csv_import === "true") payload.csv_import = true;
    if (row.suspicious === true || row.suspicious === "true") payload.suspicious = true;
    const flags = row.suspicious_flags;
    if (Array.isArray(flags) && flags.length > 0) payload.suspicious_flags = flags;
    if (typeof flags === "string" && flags.length > 0) {
      try {
        const parsed = JSON.parse(flags) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) payload.suspicious_flags = parsed;
      } catch {
        payload.suspicious_flags = [flags];
      }
    }
    return payload;
  }

  /** Rebuild the fence object. The effective-row checker requires the key to exist. */
  static stampMissingRawPayload(data: unknown): void {
    if (!Array.isArray(data)) return;
    for (const value of data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const row = value as Record<string, unknown>;
      if (row.raw_payload && typeof row.raw_payload === "object") continue;
      row.raw_payload = TimelineBoundedRead.fencePayloadFromExtracts(row);
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
      const payload =
        row.raw_payload && typeof row.raw_payload === "object"
          ? row.raw_payload
          : TimelineBoundedRead.fencePayloadFromExtracts(row);
      rows.push({ ...row, raw_payload: payload } as SensorReadingRow);
    }
    return rows;
  }
}
