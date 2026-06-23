/**
 * ecowittLiveProofViewModel — read-only view model for the EcoWitt Live
 * Ingest Proof Gate panel.
 *
 * Pure, deterministic. No I/O, no React, no Supabase.
 *
 * Contract:
 *   - Sorts input rows internally (never trusts input order).
 *   - Picks the newest valid EcoWitt row as the "proof candidate".
 *   - Counts accepted vs rejected EcoWitt-vendor rows strictly within the
 *     proof window (last 24 hours).
 *   - Never claims "Live" for demo/manual/csv/stale/invalid rows.
 *   - Exposes ONLY allowlisted human-readable metric labels, never raw
 *     payload keys or values.
 */
import {
  ECOWITT_PROOF_WINDOW_MS,
  classifyEcowittProofRow,
  detectEcowittVendor,
  resolveSourceKind,
  sortRowsByCapturedAtDesc,
  type EcowittProofClassification,
  type EcowittProofRow,
  type EcowittProofRowStatus,
} from "@/lib/ecowittLiveProofRules";
import {
  SENSOR_FIELD_LABELS,
  type SensorFieldKey,
} from "@/constants/sensorFields";

export type EcowittLiveProofTone = "ok" | "warn" | "neutral";

export interface EcowittLiveProofViewModel {
  tone: EcowittLiveProofTone;
  /** Short headline copy. */
  headline: string;
  /** Optional one-line detail. */
  detail: string;
  /** Explicit proof-window label. */
  windowLabel: string;
  /** Counts strictly scoped to the proof window. */
  acceptedCount: number;
  rejectedCount: number;
  /** Total EcoWitt-vendor rows observed in the proof window. */
  totalEcowittInWindow: number;
  /** Classification of the chosen proof candidate (or null when none). */
  candidateStatus: EcowittProofRowStatus | null;
  /** True when the proof candidate is the legacy `source: "ecowitt"` path. */
  isLegacyBridgeSource: boolean;
  /** ISO-8601 captured_at of the chosen candidate, when available. */
  candidateCapturedAt: string | null;
  /** Allowlisted human-readable metric labels carried by the candidate row. */
  candidateMetricLabels: readonly string[];
}

export interface BuildEcowittLiveProofInput {
  tentId: string | null | undefined;
  /** Wall-clock; injectable for deterministic tests. */
  now?: Date;
}

const EMPTY_CALM: EcowittLiveProofViewModel = Object.freeze({
  tone: "neutral",
  headline: "No EcoWitt readings observed",
  detail: "No EcoWitt readings observed in the current proof window.",
  windowLabel: "last 24 hours",
  acceptedCount: 0,
  rejectedCount: 0,
  totalEcowittInWindow: 0,
  candidateStatus: null,
  isLegacyBridgeSource: false,
  candidateCapturedAt: null,
  candidateMetricLabels: Object.freeze([]) as readonly string[],
});

function normalizeMetricLabel(metric: string | null | undefined): string | null {
  if (!metric) return null;
  const key = metric.trim().toLowerCase();
  // Map common aliases onto canonical sensorFields keys.
  const aliasMap: Record<string, SensorFieldKey> = {
    rh: "humidity_pct",
    humidity: "humidity_pct",
    humidity_pct: "humidity_pct",
    temp: "air_temp_c",
    air_temp: "air_temp_c",
    air_temp_c: "air_temp_c",
    temperature: "air_temp_c",
    temperature_c: "air_temp_c",
    vpd: "vpd_kpa",
    vpd_kpa: "vpd_kpa",
    co2: "co2_ppm",
    co2_ppm: "co2_ppm",
    soil: "soil_moisture_pct",
    soil_moisture: "soil_moisture_pct",
    soil_moisture_pct: "soil_moisture_pct",
    soil_temp: "soil_temp_c",
    soil_temp_c: "soil_temp_c",
    soil_ec: "soil_ec_mscm",
    soil_ec_mscm: "soil_ec_mscm",
    ph: "reservoir_ph",
    reservoir_ph: "reservoir_ph",
    reservoir_ec: "reservoir_ec_mscm",
    reservoir_ec_mscm: "reservoir_ec_mscm",
    ppfd: "ppfd",
  };
  const canonical = aliasMap[key];
  if (!canonical) return null; // strict allowlist — unknown metrics omitted
  return SENSOR_FIELD_LABELS[canonical];
}

function buildHeadline(
  candidate: EcowittProofClassification | null,
  isLegacy: boolean,
): { headline: string; detail: string; tone: EcowittLiveProofTone } {
  if (!candidate) {
    return {
      headline: "No EcoWitt readings observed",
      detail: "No EcoWitt readings observed in the current proof window.",
      tone: "neutral",
    };
  }
  switch (candidate.status) {
    case "live_confirmed":
      return {
        headline: isLegacy
          ? "EcoWitt live ingest confirmed (EcoWitt bridge source, legacy)"
          : "EcoWitt live ingest confirmed",
        detail: isLegacy
          ? "Latest reading came from the EcoWitt bridge source (legacy) and passed freshness and validity checks in the current proof window."
          : "Latest reading is fresh, valid, and came from an EcoWitt source in the current proof window.",
        tone: "ok",
      };
    case "stale":
      return {
        headline: "EcoWitt readings are stale",
        detail: "Latest EcoWitt reading is older than the freshness window.",
        tone: "warn",
      };
    case "invalid":
      return {
        headline: "EcoWitt reading looks invalid",
        detail: "Latest EcoWitt reading failed a sensor-truth check.",
        tone: "warn",
      };
    case "unknown":
      return {
        headline: "EcoWitt reading has no timestamp",
        detail: "Latest EcoWitt row is missing a usable captured_at timestamp.",
        tone: "warn",
      };
    case "limited":
      return {
        headline: "Not enough EcoWitt history yet",
        detail:
          "Need more recent EcoWitt readings before confirming live ingest.",
        tone: "neutral",
      };
    case "not_ecowitt":
    default:
      return {
        headline: "No EcoWitt readings observed",
        detail: "No EcoWitt readings observed in the current proof window.",
        tone: "neutral",
      };
  }
}

/**
 * Build the view model.
 *
 * Reads only minimal fields from input rows. Never echoes raw payload
 * values back through the view model.
 */
export function buildEcowittLiveProofViewModel(
  rows: readonly EcowittProofRow[] | null | undefined,
  input: BuildEcowittLiveProofInput,
): EcowittLiveProofViewModel {
  const tentId = input.tentId ?? null;
  if (!tentId) return EMPTY_CALM;

  const nowMs = (input.now ?? new Date()).getTime();
  const windowStart = nowMs - ECOWITT_PROOF_WINDOW_MS;

  // Tent scope first.
  const tentRows = (rows ?? []).filter(
    (r) => (r.tent_id ?? null) === tentId,
  );

  // Sort deterministically; never trust input order.
  const sorted = sortRowsByCapturedAtDesc(tentRows);

  // EcoWitt-vendor rows in the proof window.
  const ecowittRows = sorted.filter(
    (r) =>
      detectEcowittVendor(r) ||
      (resolveSourceKind(r) === "legacy_ecowitt"),
  );
  const inWindow = ecowittRows.filter((r) => {
    const t = r.captured_at ?? r.ts ?? null;
    if (!t) return false;
    const ms = Date.parse(String(t));
    if (!Number.isFinite(ms)) return false;
    // Window is [windowStart, nowMs + skew]; future-skewed rows still
    // count as "observed" so they show up in rejected counts.
    return ms >= windowStart;
  });

  // Classify each in-window row.
  const classifications = inWindow.map((r) =>
    classifyEcowittProofRow(r, sorted, nowMs),
  );

  let acceptedCount = 0;
  let rejectedCount = 0;
  for (const c of classifications) {
    if (c.status === "live_confirmed") acceptedCount += 1;
    else if (
      c.status === "stale" ||
      c.status === "invalid" ||
      c.status === "unknown" ||
      c.status === "limited"
    ) {
      rejectedCount += 1;
    }
  }

  // Choose newest-valid candidate; fall back to newest in-window row.
  const candidateRow =
    inWindow.find((r, idx) => classifications[idx].status === "live_confirmed") ??
    inWindow[0] ??
    null;
  const candidate =
    candidateRow !== null
      ? classifyEcowittProofRow(candidateRow, sorted, nowMs)
      : null;

  const isLegacyBridgeSource =
    candidate?.sourceKind === "legacy_ecowitt" ? true : false;

  const candidateCapturedAt =
    candidateRow?.captured_at ?? candidateRow?.ts ?? null;

  const metricLabel = normalizeMetricLabel(candidateRow?.metric ?? null);
  const candidateMetricLabels: readonly string[] = metricLabel
    ? Object.freeze([metricLabel])
    : Object.freeze([]);

  if (inWindow.length === 0) {
    return {
      ...EMPTY_CALM,
    };
  }

  const head = buildHeadline(candidate, isLegacyBridgeSource);

  return {
    tone: head.tone,
    headline: head.headline,
    detail: head.detail,
    windowLabel: "last 24 hours",
    acceptedCount,
    rejectedCount,
    totalEcowittInWindow: inWindow.length,
    candidateStatus: candidate?.status ?? null,
    isLegacyBridgeSource,
    candidateCapturedAt,
    candidateMetricLabels,
  };
}

export const ECOWITT_LIVE_PROOF_EMPTY = EMPTY_CALM;
