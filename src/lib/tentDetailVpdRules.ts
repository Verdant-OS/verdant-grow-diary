import { isStale } from "@/lib/sensorSnapshot";
import { classifyManualMetric } from "@/lib/sensorTruthRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import type { DisplayedVpdObservation } from "@/lib/vpdStabilityInputRules";

/** Only live and manual readings may read as current on the tent page. */
const CURRENT_SOURCES = new Set(["live", "manual"]);

export interface TentDetailVpdObservation extends DisplayedVpdObservation {
  /** True only for VPD derived from temperature and RH (no stored vpd_kpa). */
  calculated: boolean;
}

/** Temperature and RH observed at one capture instant. */
export interface TentDetailCaptureClimate {
  at: string | null;
  temp: number | null;
  rh: number | null;
}

interface TentDetailClimateRow {
  metric?: string | null;
  value?: number | null;
  ts?: string | null;
  captured_at?: string | null;
}

/**
 * Every temperature and RH the tent observed, by capture instant: the stored
 * rows Tonight reads and the diary-inclusive snapshot. Used to check the
 * capture behind Tonight's chosen VPD (Copilot P1 on #2303).
 */
export function tentDetailCaptureClimate(
  rows: readonly TentDetailClimateRow[] | null | undefined,
  snapshot: { ts: string | null; temp: number | null; rh: number | null } | null | undefined,
): TentDetailCaptureClimate[] {
  const out: TentDetailCaptureClimate[] = [];
  for (const row of rows ?? []) {
    if (typeof row.value !== "number") continue;
    const at = row.captured_at ?? row.ts ?? null;
    if (row.metric === "temperature_c") out.push({ at, temp: row.value, rh: null });
    if (row.metric === "humidity_pct") out.push({ at, temp: null, rh: row.value });
  }
  if (snapshot) out.push({ at: snapshot.ts, temp: snapshot.temp, rh: snapshot.rh });
  return out;
}

function instantMs(at: string | null | undefined): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

function climateUnrealistic(climate: { temp: number | null; rh: number | null }): boolean {
  return (
    !classifyManualMetric("temperature_c", climate.temp).valid ||
    !classifyManualMetric("humidity_pct", climate.rh).valid
  );
}

/**
 * Sensor truth for Tonight's chosen VPD: the value itself, the temperature and
 * RH it was calculated from, and any temperature or RH observed at the same
 * capture must all be realistic, as the tent's stability inputs require.
 */
function tonightVpdPassesTruth(
  tonight: TonightMetricView,
  contributors: { temp: number | null; rh: number | null } | null,
  captureClimate: readonly TentDetailCaptureClimate[],
): boolean {
  if (!classifyManualMetric("vpd_kpa", tonight.value).valid) return false;
  if (tonight.calculated && (!contributors || climateUnrealistic(contributors))) return false;
  const selectedMs = instantMs(tonight.capturedAt);
  if (selectedMs === null) return false;
  return !captureClimate.some(
    (climate) => instantMs(climate.at) === selectedMs && climateUnrealistic(climate),
  );
}

/**
 * The tent page's current VPD (VER-189, #2268): the same value the Dashboard
 * Tonight card shows for this tent, chosen by `buildTonightTentMetrics` over the
 * same stored rows and diary-inclusive snapshot. A temperature and RH pair from
 * one capture that is newer than every stored VPD therefore replaces an older
 * stored VPD here too, instead of the tent page keeping the stale stored value.
 *
 * - Tonight has a value: show it, with its source, capture time and
 *   calculated flag.
 * - Tonight's newest VPD evidence is invalid: show no value, never an older
 *   stored one beside it.
 * - Tonight has nothing yet (loading, missing, unavailable): keep the tent
 *   page's own observation, which also covers manual-history VPD that Tonight
 *   does not read.
 * - The tent page's own observation is newer than Tonight's capture (a Quick
 *   Log manual VPD, which Tonight does not read): keep it rather than replace
 *   newer evidence with older (Codex P2 on #2303).
 * - The tent's sensor-truth check rejected the stored temperature, RH or VPD
 *   at a capture no older than Tonight's, or Tonight's chosen VPD fails
 *   realism on its own value, its calculation inputs or its capture's
 *   temperature and RH: keep the tent page's own observation, which only
 *   admits realistic readings. Tonight does not run that realism check
 *   itself. A rejection at an older capture does not block a newer one
 *   (Codex P2 on #2303).
 */
export function resolveTentDetailVpd(input: {
  tonight: TonightMetricView | null | undefined;
  existing: DisplayedVpdObservation;
  /** Snapshot metrics the tent's sensor-truth check rejected (header.truth.invalidFields). */
  rejectedMetrics: readonly string[];
  /** Capture time of the snapshot those rejections belong to (header.capturedAt). */
  rejectedCapturedAt: string | null;
  /** Tonight's displayed temperature and RH: the inputs of a calculated VPD. */
  contributors: { temp: number | null; rh: number | null } | null;
  /** Temperature and RH by capture, from `tentDetailCaptureClimate`. */
  captureClimate: readonly TentDetailCaptureClimate[];
  nowMs: number;
}): TentDetailVpdObservation {
  const { tonight } = input;
  const tonightMs = tonight ? instantMs(tonight.capturedAt) : null;
  const existingMs = input.existing.value === null ? null : instantMs(input.existing.capturedAt);
  if (existingMs !== null && tonightMs !== null && existingMs > tonightMs) {
    return { ...input.existing, calculated: false };
  }
  const rejectedMs = instantMs(input.rejectedCapturedAt);
  const rejectionApplies = rejectedMs === null || tonightMs === null || tonightMs <= rejectedMs;
  if (
    rejectionApplies &&
    input.rejectedMetrics.some((key) => key === "temp" || key === "rh" || key === "vpd")
  ) {
    return { ...input.existing, calculated: false };
  }
  if (tonight?.state === "invalid") {
    return { value: null, capturedAt: null, source: null, stale: false, calculated: false };
  }
  if (
    tonight?.state === "value" &&
    typeof tonight.value === "number" &&
    Number.isFinite(tonight.value) &&
    tonightVpdPassesTruth(tonight, input.contributors, input.captureClimate)
  ) {
    const source = tonight.source;
    return {
      value: tonight.value,
      capturedAt: tonight.capturedAt,
      source,
      stale:
        tonight.capturedAt === null ||
        source === null ||
        !CURRENT_SOURCES.has(source) ||
        isStale(tonight.capturedAt, input.nowMs, undefined, source),
      calculated: tonight.calculated,
    };
  }
  return { ...input.existing, calculated: false };
}

/**
 * Whether the tent page's VPD needs its own provenance line: whenever its
 * value, source, capture time or staleness differs from the shared
 * Environment header's stored snapshot (Copilot P2 on #2303). An equal value
 * from a different observation still gets its own line.
 */
export function tentDetailVpdNeedsOwnProvenance(input: {
  observation: TentDetailVpdObservation;
  header: {
    vpd: number | null | undefined;
    source: string | null;
    capturedAt: string | null;
    stale: boolean;
  };
}): boolean {
  const { observation, header } = input;
  if (observation.value === null) return false;
  return (
    observation.calculated ||
    header.vpd === null ||
    header.vpd === undefined ||
    observation.value !== header.vpd ||
    observation.source !== header.source ||
    instantMs(observation.capturedAt) !== instantMs(header.capturedAt) ||
    observation.stale !== header.stale
  );
}
