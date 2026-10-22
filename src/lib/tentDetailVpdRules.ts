import { isStale } from "@/lib/sensorSnapshot";
import { classifyManualMetric, isHumidityStuckExtreme } from "@/lib/sensorTruthRules";
import {
  captureRefsKnown,
  rowCaptureRef,
  snapshotCaptureRef,
  type SensorCaptureRef,
} from "@/lib/sensorCaptureRefRules";
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
  /**
   * True when the row's intake `quality` flag is anything but ok: a plausible
   * number is still untrusted (Codex P1 on #2303 at 69de43db).
   */
  untrusted?: boolean;
  /**
   * Identity of the record this value came from (`sensorCaptureRefRules`).
   * Only climate from the VPD's own record(s) belongs to its capture; null
   * (unknown) is matched conservatively by instant (Codex P1 on #2303 at
   * fa8edcff).
   */
  ref?: SensorCaptureRef | null;
}

interface TentDetailClimateRow {
  metric?: string | null;
  value?: number | null;
  ts?: string | null;
  captured_at?: string | null;
  quality?: string | null;
  source?: string | null;
  capture_ref?: string | null;
}

/** Same gate as the Dashboard's evidence rows: null, "" and "ok" are trusted. */
function trustedIntakeQuality(quality: string | null | undefined): boolean {
  if (quality == null) return true;
  const normalized = quality.trim().toLowerCase();
  return normalized === "" || normalized === "ok";
}

/**
 * Every temperature and RH the tent observed, by capture instant: the stored
 * rows Tonight reads and the diary-inclusive snapshot. Used to check the
 * capture behind Tonight's chosen VPD (Copilot P1 on #2303).
 */
export function tentDetailCaptureClimate(
  rows: readonly TentDetailClimateRow[] | null | undefined,
  snapshot:
    | {
        ts: string | null;
        temp: number | null;
        rh: number | null;
        diary_evidence_ref?: { id: string } | null;
        diary_capture_id?: string | null;
        metric_refs?: Partial<Record<string, { captured_at: string; source: string }>>;
      }
    | null
    | undefined,
): TentDetailCaptureClimate[] {
  const out: TentDetailCaptureClimate[] = [];
  for (const row of rows ?? []) {
    if (typeof row.value !== "number") continue;
    const at = row.captured_at ?? row.ts ?? null;
    const untrusted = !trustedIntakeQuality(row.quality);
    const ref = rowCaptureRef(row);
    if (row.metric === "temperature_c") {
      out.push({ at, temp: row.value, rh: null, untrusted, ref });
    }
    if (row.metric === "humidity_pct") {
      out.push({ at, temp: null, rh: row.value, untrusted, ref });
    }
  }
  if (snapshot) {
    // Each metric keeps its own record: a readings snapshot can take
    // temperature and RH from different rows.
    out.push({
      at: snapshot.ts,
      temp: snapshot.temp,
      rh: null,
      ref: snapshotCaptureRef(snapshot, "temp"),
    });
    out.push({
      at: snapshot.ts,
      temp: null,
      rh: snapshot.rh,
      ref: snapshotCaptureRef(snapshot, "rh"),
    });
  }
  return out;
}

/**
 * True when a stored `vpd_kpa` row captured at `at` carries an intake quality
 * flag other than ok. The Environment header grades the snapshot VPD without
 * that flag, while the Dashboard selector drops the row, so the tent page must
 * withhold it before it becomes the fallback observation, whatever Tonight's
 * state (Codex P1 on #2303 at 307b10f4).
 */
export function tentDetailVpdRowUntrusted(
  rows: readonly TentDetailClimateRow[] | null | undefined,
  at: string | null | undefined,
): boolean {
  const atMs = instantMs(at);
  if (atMs === null) return false;
  return (rows ?? []).some(
    (row) =>
      row.metric === "vpd_kpa" &&
      typeof row.value === "number" &&
      instantMs(row.captured_at ?? row.ts) === atMs &&
      !trustedIntakeQuality(row.quality),
  );
}

function instantMs(at: string | null | undefined): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether a climate entry belongs to the capture behind Tonight's VPD. When
 * both identities are known it is the same stored record (`captureRefs`), not
 * a shared timestamp or source: a manual diary entry and a live sensor row are
 * different captures whatever their times (Codex P1 on #2303 at fa8edcff).
 * With either identity unknown it falls back to the same instant, so an
 * ambiguous capture is withheld rather than shown.
 */
function sameCaptureClimate(
  climate: TentDetailCaptureClimate,
  selectedMs: number,
  selectedRefs: TonightMetricView["captureRefs"],
): boolean {
  if (climate.ref != null && captureRefsKnown(selectedRefs)) {
    return selectedRefs.includes(climate.ref);
  }
  return instantMs(climate.at) === selectedMs;
}

function climateUnrealistic(climate: { temp: number | null; rh: number | null }): boolean {
  return (
    !classifyManualMetric("temperature_c", climate.temp).valid ||
    !classifyManualMetric("humidity_pct", climate.rh).valid ||
    // RH 0 and 100: shared isHumidityStuckExtreme (RH_STUCK_VALUES).
    // RH 1: snapshot-quality sensor-fault set in evaluateSensorQuality,
    // which Codex named with 0 and 100. Left out of RH_STUCK_VALUES so
    // other sensor-truth surfaces stay unchanged (Codex P1 on #2303 at 4bd3fae7).
    isHumidityStuckExtreme(climate.rh) ||
    climate.rh === 1
  );
}

/**
 * Sensor truth for Tonight's chosen VPD: the value itself, the temperature and
 * RH it was calculated from, and any temperature or RH observed at the same
 * capture must all be realistic, as the tent's stability inputs require. A
 * same-capture row whose intake quality flag is not ok fails too, however
 * plausible its number (Codex P1 on #2303 at 69de43db).
 */
export function tonightVpdPassesTruth(
  tonight: TonightMetricView,
  contributors: { temp: number | null; rh: number | null } | null,
  captureClimate: readonly TentDetailCaptureClimate[],
): boolean {
  if (!classifyManualMetric("vpd_kpa", tonight.value).valid) return false;
  return !tonightCaptureRejected(tonight, contributors, captureClimate);
}

/**
 * Whether the capture behind Tonight's VPD is rejected on grounds other than
 * the VPD's own value: a calculated VPD without realistic contributors, an
 * unknown capture instant, or any same-instant temperature or RH that is
 * unrealistic or carries an intake quality flag. The tents list uses this
 * alone, because it grades an out-of-range VPD value as Invalid itself
 * (Codex P1 on #2303 at 3d1e5800).
 */
export function tonightCaptureRejected(
  tonight: TonightMetricView,
  contributors: { temp: number | null; rh: number | null } | null,
  captureClimate: readonly TentDetailCaptureClimate[],
): boolean {
  if (tonight.calculated && (!contributors || climateUnrealistic(contributors))) return true;
  const selectedMs = instantMs(tonight.capturedAt);
  if (selectedMs === null) return true;
  return captureClimate.some(
    (climate) =>
      sameCaptureClimate(climate, selectedMs, tonight.captureRefs) &&
      (climate.untrusted === true || climateUnrealistic(climate)),
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
 *   newer evidence with older (Codex P2 on #2303). At the same instant a
 *   direct observation also beats a VPD Tonight calculated, as the shared
 *   merge gives manual evidence precedence (Codex P2 on #2303 at 85ec1e78).
 * - The tent's sensor-truth check rejected the stored temperature, RH or VPD
 *   at a capture no older than Tonight's, or Tonight's chosen VPD fails
 *   realism on its own value, its calculation inputs or its capture's
 *   temperature and RH: keep the tent page's own observation, which only
 *   admits realistic readings. Tonight does not run that realism check
 *   itself. A rejection at an older capture does not block a newer one
 *   (Codex P2 on #2303). When the tent page's own observation is the same
 *   capture Tonight just failed, it is withheld too, never shown as the
 *   fallback (Codex P1 on #2303 at 0c19a9e0).
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
  const rejectedMs = instantMs(input.rejectedCapturedAt);
  const climateRejected = input.rejectedMetrics.some(
    (key) => key === "temp" || key === "rh" || key === "vpd",
  );
  // The header rejects a capture's temperature or RH but keeps that capture's
  // plausible direct VPD in `existing` (`snapshotVpdRejected` covers the VPD
  // row alone). Telemetry from a rejected capture is never restored: only an
  // observation proven to come from another capture may stand in (Codex P1 on
  // #2303 at d6ef3a20). An unknown capture time cannot prove independence.
  const existingFromRejectedCapture =
    climateRejected &&
    input.existing.value !== null &&
    (existingMs === null || rejectedMs === null || existingMs === rejectedMs);
  const existingOrNothing = (): TentDetailVpdObservation =>
    existingFromRejectedCapture
      ? { value: null, capturedAt: null, source: null, stale: false, calculated: false }
      : { ...input.existing, calculated: false };
  if (
    !existingFromRejectedCapture &&
    existingMs !== null &&
    tonightMs !== null &&
    (existingMs > tonightMs || (existingMs === tonightMs && tonight?.calculated === true))
  ) {
    return { ...input.existing, calculated: false };
  }
  const rejectionApplies = rejectedMs === null || tonightMs === null || tonightMs <= rejectedMs;
  if (rejectionApplies && climateRejected) {
    return existingOrNothing();
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
        // A generic diary snapshot is historical, never current (Codex P1 at 4bd3fae7).
        tonight.historical === true ||
        isStale(tonight.capturedAt, input.nowMs, undefined, source),
      calculated: tonight.calculated,
    };
  }
  // Tonight's candidate failed sensor truth. The tent page's own observation
  // stands in only when it is a different capture: the Environment header
  // grades the same direct VPD without the row quality flag, so at the same
  // instant it is the rejected reading itself (Codex P1 on #2303 at 0c19a9e0).
  if (
    tonight?.state === "value" &&
    existingMs !== null &&
    tonightMs !== null &&
    existingMs === tonightMs
  ) {
    return { value: null, capturedAt: null, source: null, stale: false, calculated: false };
  }
  return existingOrNothing();
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
