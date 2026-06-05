/**
 * EcoWitt cloud normalization canary — pure verdict helper.
 *
 * Read-only. No I/O, no React, no DB, no edge-function changes.
 * Summarizes the output of `normalizeEcowittCloudReadings` for one or more
 * static fixture payloads. Never echoes MAC, PASSKEY, tent_id, or raw values
 * — only counts and categorical flags.
 *
 * Mirrors the redaction posture of `ecowittCanaryAuditRules` so this helper
 * can feed the Operator canary dashboard if a UI surface is later approved.
 */

import {
  normalizeEcowittCloudReadings,
  type EcowittCloudMappingConfig,
  type EcowittCloudNormalizationResult,
  type NormalizeEcowittCloudOptions,
} from "@/lib/ecowittPayloadRules";
import type { EcowittMissingMetricCode } from "@/constants/ecowittMissingMetricCodes";

export interface EcowittCloudCanaryFixture {
  /** Stable id for the fixture (e.g. "happy_multi_channel"). Never a secret. */
  id: string;
  payload: unknown;
}

export interface EcowittCloudCanarySummary {
  fixture_id: string;
  mapped_count: number;
  unmapped_count: number;
  invalid_count: number;
  stale_count: number;
  live_count: number;
  suspicious_flag_codes: string[];
  missing_metric: boolean;
  ec_metric_invented: boolean;
  /** True if at least one unmapped pressure channel was surfaced. */
  pressure_unmapped: boolean;
}

export interface EcowittCloudCanaryVerdict {
  summaries: EcowittCloudCanarySummary[];
  totals: {
    mapped: number;
    unmapped: number;
    invalid: number;
    stale: number;
    live: number;
  };
  /** Aggregate suspicious codes across all fixtures, deduped + sorted. */
  suspicious_flag_codes: string[];
  /** True if any fixture produced zero rows AND zero unmapped (truly empty). */
  any_missing_metric: boolean;
  /** Must be `false` for the verdict to pass. */
  any_ec_metric_invented: boolean;
}

const EC_LIKE_KEYS = new Set([
  "soil_ec",
  "reservoir_ec",
  "ec_mscm",
  "ec",
  "electrical_conductivity",
]);

function hasEcMetric(result: EcowittCloudNormalizationResult): boolean {
  for (const row of result.rows) {
    for (const k of Object.keys(row.reading as unknown as Record<string, unknown>)) {
      if (EC_LIKE_KEYS.has(k.toLowerCase())) return true;
    }
  }
  return false;
}

function summarizeOne(
  fixture: EcowittCloudCanaryFixture,
  mapping: EcowittCloudMappingConfig,
  options: NormalizeEcowittCloudOptions,
): EcowittCloudCanarySummary {
  const res = normalizeEcowittCloudReadings(fixture.payload, mapping, options);
  let invalid = 0;
  let stale = 0;
  let live = 0;
  const codes = new Set<string>();
  for (const row of res.rows) {
    if (row.reading.source === "invalid") invalid += 1;
    else if (row.reading.source === "stale") stale += 1;
    else if (row.reading.source === "live") live += 1;
    for (const c of row.suspicion_codes) codes.add(c);
  }
  return {
    fixture_id: fixture.id,
    mapped_count: res.rows.length,
    unmapped_count: res.unmapped.length,
    invalid_count: invalid,
    stale_count: stale,
    live_count: live,
    suspicious_flag_codes: [...codes].sort(),
    missing_metric: res.rows.length === 0 && res.unmapped.length === 0,
    ec_metric_invented: hasEcMetric(res),
    pressure_unmapped: res.unmapped.some((u) => u.metric === "pressure_hpa"),
  };
}

export function runEcowittCloudCanary(
  fixtures: ReadonlyArray<EcowittCloudCanaryFixture>,
  mapping: EcowittCloudMappingConfig,
  options: NormalizeEcowittCloudOptions = {},
): EcowittCloudCanaryVerdict {
  const summaries = fixtures.map((f) => summarizeOne(f, mapping, options));
  const totals = summaries.reduce(
    (acc, s) => {
      acc.mapped += s.mapped_count;
      acc.unmapped += s.unmapped_count;
      acc.invalid += s.invalid_count;
      acc.stale += s.stale_count;
      acc.live += s.live_count;
      return acc;
    },
    { mapped: 0, unmapped: 0, invalid: 0, stale: 0, live: 0 },
  );
  const allCodes = new Set<string>();
  for (const s of summaries)
    for (const c of s.suspicious_flag_codes) allCodes.add(c);
  return {
    summaries,
    totals,
    suspicious_flag_codes: [...allCodes].sort(),
    any_missing_metric: summaries.some((s) => s.missing_metric),
    any_ec_metric_invented: summaries.some((s) => s.ec_metric_invented),
  };
}
