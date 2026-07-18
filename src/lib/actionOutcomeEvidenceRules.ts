/**
 * actionOutcomeEvidenceRules — sensor + diary evidence normalization
 * for the Post-Action Outcome Analysis Engine.
 *
 * Reuses (never duplicates) the repo's trusted rules:
 *   - source labels:   sensor/sensorSourceRules.normalizeSensorSource
 *   - temperature:     temperatureUnits.celsiusToFahrenheit
 *   - EC canonical:    ecUnits.toCanonicalMscm
 *
 * Doctrine enforced here:
 *   - demo / stale / invalid / unknown sources are NEVER usable
 *     evidence for outcome classification;
 *   - manual stays manual, csv stays csv (no relabeling);
 *   - readings with quality "stale"/"invalid" are excluded;
 *   - future-dated readings (relative to the injected analysis time)
 *     are rejected;
 *   - implausible values (humidity/soil stuck at 0 or 100, pH outside
 *     3.0–9.0, EC anomalies) are flagged and excluded;
 *   - duplicates deduplicate deterministically.
 *
 * Pure. No I/O, no clock reads, no React.
 */

import { normalizeSensorSource, type SensorSource } from "@/lib/sensor/sensorSourceRules";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";
import { celsiusToFahrenheit } from "@/lib/temperatureUnits";
import { toCanonicalMscm } from "@/lib/ecUnits";
import { parseTimestampMs } from "@/lib/actionOutcomeWindowRules";
import type {
  NormalizedDiaryEvidence,
  NormalizedOutcomeMetric,
  OutcomeMetricName,
} from "@/lib/actionOutcomeAnalysisTypes";

/** Sources allowed to influence outcome classification. */
export const USABLE_OUTCOME_SOURCES: readonly SensorSource[] = ["live", "manual", "csv"] as const;

/** sensor_readings.quality values that make a row unusable. */
const UNUSABLE_QUALITY = new Set(["stale", "invalid"]);

/**
 * Repo long-format metric → engine metric slot.
 * soil_temp_c has no V1 slot (documented limitation).
 * reservoir_ec has no repo metric (never fabricated).
 */
export const REPO_METRIC_TO_OUTCOME_METRIC: Readonly<Record<string, OutcomeMetricName>> = {
  temperature_c: "temperature_f",
  humidity_pct: "humidity_pct",
  vpd_kpa: "vpd_kpa",
  soil_moisture_pct: "soil_moisture_pct",
  ec: "soil_ec",
  co2_ppm: "co2_ppm",
  ppfd: "ppfd",
  ph: "reservoir_ph",
};

export type RawSensorReadingRow = {
  tent_id: string | null;
  metric: string | null;
  value: number | string | null;
  captured_at: string | null;
  source: string | null;
  quality: string | null;
  /** Opaque provenance envelope used only by the shared testbench fence. */
  raw_payload?: unknown;
};

export type SensorEvidenceRejection = {
  reason:
    | "unusable_source"
    | "unusable_quality"
    | "unknown_metric"
    | "invalid_timestamp"
    | "future_reading"
    | "non_numeric_value"
    | "implausible_value"
    | "wrong_tent"
    | "wrong_plant"
    | "missing_tent";
  metric: string | null;
};

export type NormalizeSensorEvidenceResult = {
  metrics: NormalizedOutcomeMetric[];
  rejections: SensorEvidenceRejection[];
  /** Human-readable anomaly flags (stuck humidity, implausible pH, …). */
  flags: string[];
};

/** EC values > 50 read as µS/cm per the repo's metric-safety heuristic. */
const EC_LOOKS_LIKE_MICRO_SIEMENS = 50;

function plausibilityCheck(
  metric: OutcomeMetricName,
  value: number,
): { ok: boolean; normalizedValue: number; flag: string | null } {
  switch (metric) {
    case "humidity_pct": {
      if (value < 0 || value > 100) {
        return { ok: false, normalizedValue: value, flag: "humidity out of 0–100 range" };
      }
      if (value === 0 || value === 100) {
        return { ok: false, normalizedValue: value, flag: "humidity stuck at 0 or 100" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "soil_moisture_pct": {
      if (value < 0 || value > 100) {
        return { ok: false, normalizedValue: value, flag: "soil moisture out of 0–100 range" };
      }
      if (value === 0 || value === 100) {
        return { ok: false, normalizedValue: value, flag: "soil moisture stuck at 0 or 100" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "reservoir_ph": {
      // Matches sensorMetricSafetyRules realistic pH band.
      if (value < 3 || value > 9) {
        return { ok: false, normalizedValue: value, flag: "implausible pH (outside 3.0–9.0)" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "soil_ec": {
      if (value < 0) {
        return { ok: false, normalizedValue: value, flag: "negative EC" };
      }
      if (value > EC_LOOKS_LIKE_MICRO_SIEMENS) {
        // Normalize through the existing trusted EC unit helper.
        const canonical = toCanonicalMscm(value, "µS/cm");
        if (canonical === null) {
          return { ok: false, normalizedValue: value, flag: "EC unit anomaly (unnormalizable)" };
        }
        return {
          ok: true,
          normalizedValue: canonical,
          flag: "EC looked like µS/cm; normalized to mS/cm",
        };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "temperature_f": {
      // Input is temperature_c; validated pre-conversion by the caller
      // using the repo's -10..60 °C plausibility band.
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "vpd_kpa": {
      if (value < 0 || value > 10) {
        return { ok: false, normalizedValue: value, flag: "implausible VPD (outside 0–10 kPa)" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "co2_ppm": {
      if (value < 0 || value > 5000) {
        return { ok: false, normalizedValue: value, flag: "implausible CO2 (outside 0–5000 ppm)" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "ppfd": {
      if (value < 0) {
        return { ok: false, normalizedValue: value, flag: "negative PPFD" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
    case "reservoir_ec": {
      if (value < 0) {
        return { ok: false, normalizedValue: value, flag: "negative EC" };
      }
      return { ok: true, normalizedValue: value, flag: null };
    }
  }
}

/** Repo plausibility band for temperature_c before °F conversion. */
function isCelsiusPlausible(value: number): boolean {
  return value >= -10 && value <= 60;
}

/**
 * Normalize long-format sensor rows into engine metrics.
 *
 * Context rules (documented):
 *  - sensor_readings is TENT-scoped only (no plant_id/grow_id columns),
 *    so rows must match the action's tent when the action has one;
 *    actions without a tent cannot use tent telemetry (missing_tent).
 *  - Tent-level readings apply to every plant in the tent — plantId on
 *    the normalized metric is always null in V1.
 */
export function normalizeSensorEvidence(input: {
  rows: RawSensorReadingRow[];
  actionTentId: string | null;
  analysisAt: string;
}): NormalizeSensorEvidenceResult {
  const analysisMs = parseTimestampMs(input.analysisAt);
  const metrics: NormalizedOutcomeMetric[] = [];
  const rejections: SensorEvidenceRejection[] = [];
  const flags: string[] = [];

  for (const row of input.rows) {
    if (!input.actionTentId) {
      rejections.push({ reason: "missing_tent", metric: row.metric });
      continue;
    }
    if (row.tent_id !== input.actionTentId) {
      rejections.push({ reason: "wrong_tent", metric: row.metric });
      continue;
    }

    // A successful transport can still be a Windows testbench diagnostic.
    // Provenance wins over the canonical stored source so diagnostic rows
    // never influence an action outcome as physical sensor evidence.
    if (isDiagnosticSensorProvenanceRow(row)) {
      rejections.push({ reason: "unusable_source", metric: row.metric });
      continue;
    }

    const outcomeMetric = row.metric ? REPO_METRIC_TO_OUTCOME_METRIC[row.metric] : undefined;
    if (!outcomeMetric) {
      rejections.push({ reason: "unknown_metric", metric: row.metric });
      continue;
    }

    const source = normalizeSensorSource(row.source);
    if (!USABLE_OUTCOME_SOURCES.includes(source)) {
      rejections.push({ reason: "unusable_source", metric: row.metric });
      continue;
    }

    const quality = typeof row.quality === "string" ? row.quality : null;
    if (source === "live" && quality !== "ok") {
      rejections.push({ reason: "unusable_quality", metric: row.metric });
      continue;
    }
    if (quality && UNUSABLE_QUALITY.has(quality)) {
      rejections.push({ reason: "unusable_quality", metric: row.metric });
      continue;
    }

    const capturedMs = parseTimestampMs(row.captured_at);
    if (capturedMs === null) {
      rejections.push({ reason: "invalid_timestamp", metric: row.metric });
      continue;
    }
    if (analysisMs !== null && capturedMs > analysisMs) {
      rejections.push({ reason: "future_reading", metric: row.metric });
      continue;
    }

    const numeric =
      typeof row.value === "number"
        ? row.value
        : typeof row.value === "string"
          ? Number(row.value)
          : NaN;
    if (!Number.isFinite(numeric)) {
      rejections.push({ reason: "non_numeric_value", metric: row.metric });
      continue;
    }

    let value = numeric;
    if (outcomeMetric === "temperature_f") {
      if (!isCelsiusPlausible(numeric)) {
        rejections.push({ reason: "implausible_value", metric: row.metric });
        flags.push("implausible temperature_c (outside -10–60 °C)");
        continue;
      }
      value = celsiusToFahrenheit(numeric);
    }

    const check = plausibilityCheck(outcomeMetric, value);
    if (check.flag) flags.push(check.flag);
    if (!check.ok) {
      rejections.push({ reason: "implausible_value", metric: row.metric });
      continue;
    }

    metrics.push({
      metric: outcomeMetric,
      value: check.normalizedValue,
      capturedAt: new Date(capturedMs).toISOString(),
      source,
      confidence: quality,
      tentId: input.actionTentId,
      plantId: null,
    });
  }

  return {
    metrics: dedupeOutcomeMetrics(metrics),
    rejections,
    flags: [...flags].sort(),
  };
}

/**
 * Deterministic dedupe mirroring the DB partial unique index
 * (tent_id, source, metric, captured_at). After a stable sort by
 * (metric, capturedAt, source, value) the FIRST row per key wins.
 */
export function dedupeOutcomeMetrics(
  metrics: NormalizedOutcomeMetric[],
): NormalizedOutcomeMetric[] {
  const sorted = [...metrics].sort((a, b) => {
    if (a.metric !== b.metric) return a.metric < b.metric ? -1 : 1;
    if (a.capturedAt !== b.capturedAt) return a.capturedAt < b.capturedAt ? -1 : 1;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.value - b.value;
  });
  const seen = new Set<string>();
  const out: NormalizedOutcomeMetric[] = [];
  for (const m of sorted) {
    const key = `${m.tentId}|${m.source}|${m.metric}|${m.capturedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diary / operational evidence
// ---------------------------------------------------------------------------

/** Event types relevant to outcome context (from src/lib/diary.ts union). */
export const RELEVANT_DIARY_EVENT_TYPES: readonly string[] = [
  "watering",
  "feeding",
  "training",
  "environment",
  "observation",
  "diagnosis",
  "pest_disease",
  "photo",
  "action_followup",
] as const;

export type RawDiaryEvidenceRow = {
  event_type: string | null;
  occurred_at: string | null;
  note: string | null;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  is_deleted?: boolean | null;
  /** For diary_entries follow-up rows: details.action_queue_id. */
  action_queue_id?: string | null;
};

/**
 * Normalize diary/operational rows. Free-text notes are context, not
 * sensor facts — the engine only uses them for timing confirmation,
 * what-was-done, symptom direction, and missing-evidence detection.
 *
 * Scope: rows must match the action's grow; when the action names a
 * plant, plant-scoped rows must match it (tent/grow-level rows with no
 * plant pass through as shared context).
 */
export function normalizeDiaryEvidence(input: {
  rows: RawDiaryEvidenceRow[];
  actionGrowId: string;
  actionPlantId: string | null;
  analysisAt: string;
}): NormalizedDiaryEvidence[] {
  const analysisMs = parseTimestampMs(input.analysisAt);
  const out: NormalizedDiaryEvidence[] = [];
  for (const row of input.rows) {
    if (row.is_deleted) continue;
    const eventType = (row.event_type ?? "").trim();
    if (!RELEVANT_DIARY_EVENT_TYPES.includes(eventType)) continue;
    if (row.grow_id !== input.actionGrowId) continue;
    if (input.actionPlantId && row.plant_id && row.plant_id !== input.actionPlantId) {
      continue;
    }
    const occurredMs = parseTimestampMs(row.occurred_at);
    if (occurredMs === null) continue;
    if (analysisMs !== null && occurredMs > analysisMs) continue;
    out.push({
      eventType,
      occurredAt: new Date(occurredMs).toISOString(),
      // Notes are trimmed; raw payload details are never carried.
      note: (row.note ?? "").trim(),
      plantId: row.plant_id ?? null,
      tentId: row.tent_id ?? null,
      actionQueueId: row.action_queue_id ?? null,
    });
  }
  return out.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
    if (a.eventType !== b.eventType) return a.eventType < b.eventType ? -1 : 1;
    return a.note < b.note ? -1 : a.note > b.note ? 1 : 0;
  });
}
