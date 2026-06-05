/**
 * EcoWitt cloud → routed-row adapter (pure).
 *
 * Bridges the cloud normalization output (`EcowittCloudReadingRow` produced
 * by `normalizeEcowittCloudReadings`) to a row shape that mirrors the existing
 * `EcoWittRoutedRow` contract (see `supabase/functions/_shared/
 * ecowittRoutedRowBuilder.ts`).
 *
 * Hard constraints:
 *  - Pure: no fetch, no DB client, no auth, no React, no timers.
 *  - No schema changes. No edge function changes.
 *  - Never persists. Caller decides what to do with the rows.
 *  - Never invents EC.
 *  - Never includes raw PASSKEY/MAC. MAC is replaced by a short fingerprint
 *    suffix (last 4 hex chars) to keep lineage without leaking the full
 *    device id. PASSKEY fingerprint must be supplied by the caller — this
 *    helper never derives it from a secret.
 *  - Preserves invalid/stale/live truth status in `raw_payload.status` so the
 *    downstream Verdant freshness/suspicion layer is not lied to.
 */

import type {
  EcowittCloudReadingRow,
} from "@/lib/ecowittPayloadRules";

export type EcowittCloudAdapterMetric =
  | "temperature_c"
  | "humidity_pct"
  | "soil_moisture_pct";

export interface EcowittCloudAdapterRawPayload {
  provider: "ecowitt";
  channel: number;
  mapping_type: "air" | "soil";
  raw_key: string;
  /** Last 4 chars of the MAC, uppercased. "" when MAC absent. Never the full MAC. */
  device_mac_suffix: string;
  /** Safe one-way fingerprint of the gateway PASSKEY, supplied by caller. */
  passkey_fingerprint: string;
  /** Preserved truth status from the cloud normalizer. */
  status: "live" | "stale" | "invalid";
  /** Confidence in [0,1] — preserved for downstream auditors. */
  confidence: number;
  /** Suspicion flag codes that fired. */
  suspicion_codes: string[];
}

export interface EcowittCloudAdapterRow {
  user_id: string;
  tent_id: string;
  source: "ecowitt";
  metric: EcowittCloudAdapterMetric;
  value: number;
  captured_at: string;
  quality: "ok" | "suspect" | "invalid";
  raw_payload: EcowittCloudAdapterRawPayload;
}

export interface EcowittCloudAdapterInput {
  userId: string;
  passkeyFingerprint: string;
  rows: readonly EcowittCloudReadingRow[];
}

export interface EcowittCloudAdapterResult {
  rows: EcowittCloudAdapterRow[];
  /**
   * Cloud rows that could not be adapted (e.g. row has no numeric metric value
   * after normalization). These are surfaced, never silently dropped.
   */
  skipped: Array<{ tent_id: string; channel: number; reason: string }>;
}

function macSuffix(mac: string): string {
  if (!mac) return "";
  const clean = mac.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return clean.length >= 4 ? clean.slice(-4) : clean;
}

function pickMetric(
  reading: EcowittCloudReadingRow["reading"],
): { metric: EcowittCloudAdapterMetric; value: number; mappingType: "air" | "soil"; rawKey: (ch: number) => string } | null {
  if (reading.temperature_c !== null && reading.temperature_c !== undefined) {
    return {
      metric: "temperature_c",
      value: reading.temperature_c,
      mappingType: "air",
      rawKey: (ch) => `temp${ch}f`,
    };
  }
  if (reading.humidity_pct !== null && reading.humidity_pct !== undefined) {
    return {
      metric: "humidity_pct",
      value: reading.humidity_pct,
      mappingType: "air",
      rawKey: (ch) => `humidity${ch}`,
    };
  }
  if (reading.soil_moisture_pct !== null && reading.soil_moisture_pct !== undefined) {
    return {
      metric: "soil_moisture_pct",
      value: reading.soil_moisture_pct,
      mappingType: "soil",
      rawKey: (ch) => `soilmoisture${ch}`,
    };
  }
  return null;
}

export function adaptEcowittCloudRowsToRoutedShape(
  input: EcowittCloudAdapterInput,
): EcowittCloudAdapterResult {
  const out: EcowittCloudAdapterRow[] = [];
  const skipped: EcowittCloudAdapterResult["skipped"] = [];

  for (const row of input.rows) {
    const picked = pickMetric(row.reading);
    if (!picked) {
      skipped.push({
        tent_id: row.tent_id,
        channel: row.channel,
        reason: "no_metric_value_after_normalization",
      });
      continue;
    }
    const status = row.reading.source;
    if (status !== "live" && status !== "stale" && status !== "invalid") {
      skipped.push({
        tent_id: row.tent_id,
        channel: row.channel,
        reason: `unsupported_source_for_routed_row:${status}`,
      });
      continue;
    }
    const quality: EcowittCloudAdapterRow["quality"] =
      status === "invalid"
        ? "invalid"
        : row.suspicion_codes.length > 0
          ? "suspect"
          : "ok";

    out.push({
      user_id: input.userId,
      tent_id: row.tent_id,
      source: "ecowitt",
      metric: picked.metric,
      value: picked.value,
      captured_at: row.reading.captured_at,
      quality,
      raw_payload: {
        provider: "ecowitt",
        channel: row.channel,
        mapping_type: picked.mappingType,
        raw_key: picked.rawKey(row.channel),
        device_mac_suffix: macSuffix(row.device_mac),
        passkey_fingerprint: input.passkeyFingerprint,
        status,
        confidence: row.confidence,
        suspicion_codes: [...row.suspicion_codes],
      },
    });
  }

  return { rows: out, skipped };
}
