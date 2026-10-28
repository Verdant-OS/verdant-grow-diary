import { withoutDiagnosticSensorRows } from "@/lib/sensorProvenanceFenceRules";
import { isStale } from "@/lib/sensorSnapshot";
import { classifyManualMetric, isHumidityStuckExtreme } from "@/lib/sensorTruthRules";
import {
  captureRefsKnown,
  rowCaptureRef,
  captureRefIn,
  captureRefsMatch,
  sensorCaptureRef,
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
  /**
   * Tonight's own provenance label when the normalized source would misname
   * it: a generic diary snapshot is "Diary note", not a manual reading
   * (Codex P2 on #2303 at 4a304fe3).
   */
  sourceLabel?: string;
  /**
   * True when a VPD existed but was withheld as invalid, so the page labels it
   * rather than dropping it (CodeRabbit on #2451 at 6d0fa53c).
   */
  rejected?: true;
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
  device_id?: string | null;
  /** Classification only: lets the diagnostic fence run before capture refs are built. */
  raw_payload?: unknown;
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
        metric_device_ids?: Partial<Record<string, string>>;
        rejected_quality_rows?: readonly {
          metric: string;
          value: number | string | null;
          captured_at: string;
          source: string;
          device_id?: string | null;
        }[];
      }
    | null
    | undefined,
): TentDetailCaptureClimate[] {
  const out: TentDetailCaptureClimate[] = [];
  // Diagnostic (testbench) rows are not plant evidence: Tonight's selector and
  // the header drop them, so they must not reject a physical capture here
  // (Copilot P1 on #2412 at 8d8c4900).
  for (const row of withoutDiagnosticSensorRows(rows)) {
    if (typeof row.value !== "number") continue;
    const at = row.captured_at ?? row.ts ?? null;
    // An explicit stale or invalid source is a downgrade whatever the quality
    // flag says, as on the VPD row itself (Copilot P1 on #2422 at bcdf2ea6).
    const untrusted = !trustedIntakeQuality(row.quality) || downgradedSource(row.source);
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
    // Siblings the snapshot read dropped for intake quality reject their own
    // capture here too, as they do on the raw-row path (Codex P1 on #2303 at
    // 4a304fe3). Their number is never used as a value.
    for (const row of snapshot.rejected_quality_rows ?? []) {
      if (row.metric !== "temperature_c" && row.metric !== "humidity_pct") continue;
      out.push({
        at: row.captured_at,
        temp: null,
        rh: null,
        untrusted: true,
        ref: sensorCaptureRef(row.captured_at, row.source, row.device_id),
      });
    }
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
  /**
   * The source of the VPD the header selected. With it, a flagged VPD row at
   * the same instant counts only when it is the same capture: a rejected
   * manual or CSV row cannot blank a valid live one (Codex P2 on #2422 at
   * bcdf2ea6). Unknown identity on either side falls back to the instant.
   */
  selectedSource?: string | null,
  /**
   * The selected VPD row's device, so another device's flagged VPD at the same
   * instant is not taken for it (Codex on #2451 at 6d0fa53c).
   */
  selectedDevice?: string | null,
): boolean {
  const atMs = instantMs(at);
  if (atMs === null) return false;
  const selectedRef = sensorCaptureRef(at, selectedSource, selectedDevice);
  // Diagnostic rows are fenced out here as in the capture climate, so a
  // testbench VPD cannot withhold a physical one (Copilot P1 on #2417).
  return withoutDiagnosticSensorRows(rows).some(
    (row) =>
      row.metric === "vpd_kpa" &&
      typeof row.value === "number" &&
      instantMs(row.captured_at ?? row.ts) === atMs &&
      (selectedRef === null ||
        rowCaptureRef(row) === null ||
        captureRefsMatch(rowCaptureRef(row), selectedRef)) &&
      // An explicit stale/invalid source is a downgrade whatever the quality,
      // as selectRejectedQualityRows treats it (Codex P1 on #2412 at 8d8c4900).
      (!trustedIntakeQuality(row.quality) || downgradedSource(row.source)),
  );
}

const DOWNGRADED_SOURCES = new Set(["stale", "invalid"]);

function downgradedSource(source: string | null | undefined): boolean {
  return DOWNGRADED_SOURCES.has(source?.trim().toLowerCase() ?? "");
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
    return captureRefIn(climate.ref, selectedRefs);
  }
  return instantMs(climate.at) === selectedMs;
}

/**
 * True when one capture carries both a temperature and an RH. The readings
 * emit each metric as its own entry (`tentDetailCaptureClimate`), so the pair
 * is found across entries of that capture (Codex P2 on #2499 at 11e38f80).
 */
function capturePairsTempAndRh(
  captureClimate: readonly TentDetailCaptureClimate[],
  capturedMs: number,
  refs: readonly (string | null)[],
): boolean {
  const entries = captureClimate.filter((climate) => sameCaptureClimate(climate, capturedMs, refs));
  return (
    entries.some((climate) => climate.temp !== null) &&
    entries.some((climate) => climate.rh !== null)
  );
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
 * The header's record identities for `resolveTentDetailVpd`: the capture ref
 * of each rejected metric, and of the stored VPD when it is the snapshot's own
 * (a fallback series value has no known ref). Pure (Codex P2 on #2303 at
 * 0994ea2a).
 */
export function tentDetailHeaderCaptureRefs(
  snapshot: Parameters<typeof snapshotCaptureRef>[0] | null | undefined,
  invalidFields: readonly string[],
  opts: { existingIsSnapshotVpd: boolean },
): { rejectedRefs?: (string | null)[]; existingRef?: string | null } {
  if (!snapshot) return {};
  return {
    rejectedRefs: invalidFields.map((key) => snapshotCaptureRef(snapshot, key)),
    existingRef: opts.existingIsSnapshotVpd ? snapshotCaptureRef(snapshot, "vpd") : null,
  };
}

/**
 * The header's rejection inputs for `resolveTentDetailVpd`: the rejected
 * metrics, aligned with each one's capture record, and the snapshot VPD's own
 * record.
 */
export function tentDetailHeaderRejection(
  truth: { invalidFields: readonly string[]; reasonCodes: readonly string[] } | null | undefined,
  snapshot: Parameters<typeof snapshotCaptureRef>[0] | null | undefined,
  opts: { existingIsSnapshotVpd: boolean },
): { rejectedMetrics: string[]; rejectedRefs?: (string | null)[]; existingRef?: string | null } {
  // A VPD dropped only because its temperature or RH was invalid is not its
  // own rejection: the capture check below tests the actual contributors, so
  // an independent VPD at the same instant stays (Copilot P2 on #2407 at e66265eb).
  const dependencyOnly = truth?.reasonCodes.includes("vpd_dropped_temp_rh_invalid") ?? false;
  const rejectedMetrics = (truth?.invalidFields ?? []).filter(
    (key) => !(dependencyOnly && key === "vpd"),
  );
  return {
    rejectedMetrics,
    ...tentDetailHeaderCaptureRefs(snapshot, rejectedMetrics, opts),
  };
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
  /**
   * The capture ref of each `rejectedMetrics` entry, in the same order, from
   * the header snapshot's per-metric refs. With `existingRef`, lets a VPD from
   * another record at the same instant stand (Codex P2 on #2303 at 0994ea2a).
   */
  rejectedRefs?: readonly (string | null)[];
  /** The capture ref of `existing`'s VPD, when known. */
  existingRef?: string | null;
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
  // When every rejected climate metric and the existing VPD carry a known
  // record identity, the capture is matched by identity: a valid VPD from
  // another record at the same instant is not part of the rejected capture.
  // Otherwise the instant decides, conservatively (Codex P2 at 0994ea2a).
  const rejectedClimateRefs = input.rejectedMetrics
    .map((key, index) =>
      key === "temp" || key === "rh" || key === "vpd"
        ? (input.rejectedRefs?.[index] ?? null)
        : undefined,
    )
    .filter((ref): ref is string | null => ref !== undefined);
  const identityKnown =
    input.rejectedRefs !== undefined &&
    typeof input.existingRef === "string" &&
    captureRefsKnown(rejectedClimateRefs);
  // The existing observation is held to its own capture too: a temperature
  // or RH at that capture that is unrealistic or quality-flagged withholds
  // it, as it would Tonight's VPD. The header grades realism only, so after a
  // failed refresh a cached VPD could otherwise stand beside a flagged
  // sibling (Copilot P1 on #2417 at 066f72a2). Another capture is unaffected.
  const existingCaptureUntrusted =
    input.existing.value !== null &&
    existingMs !== null &&
    input.captureClimate.some(
      (climate) =>
        sameCaptureClimate(
          climate,
          existingMs,
          typeof input.existingRef === "string" ? [input.existingRef] : undefined,
        ) &&
        (climate.untrusted === true || climateUnrealistic(climate)),
    );
  const existingFromRejectedCapture =
    existingCaptureUntrusted ||
    (climateRejected &&
      input.existing.value !== null &&
      (identityKnown
        ? captureRefIn(input.existingRef as string, rejectedClimateRefs)
        : existingMs === null || rejectedMs === null || existingMs === rejectedMs));
  const existingOrNothing = (): TentDetailVpdObservation =>
    existingFromRejectedCapture
      ? {
          value: null,
          capturedAt: null,
          source: null,
          stale: false,
          calculated: false,
          rejected: true,
        }
      : { ...input.existing, calculated: false };
  if (
    !existingFromRejectedCapture &&
    existingMs !== null &&
    tonightMs !== null &&
    (existingMs > tonightMs ||
      // Equal time only outranks Tonight's own calculated value; an invalid
      // result stays terminal unless strictly older (Copilot P1 on #2410).
      (existingMs === tonightMs && tonight?.state === "value" && tonight.calculated === true))
  ) {
    return { ...input.existing, calculated: false };
  }
  const rejectionApplies = rejectedMs === null || tonightMs === null || tonightMs <= rejectedMs;
  // Tonight's candidate is held to the same identity test as `existing`: when
  // the rejected metrics and Tonight's own records are all known and disjoint,
  // Tonight is a different capture and keeps its own truth check below
  // (Codex P2 on #2303 at 4a304fe3).
  const tonightRefs = tonight?.captureRefs;
  const tonightIndependent =
    input.rejectedRefs !== undefined &&
    captureRefsKnown(rejectedClimateRefs) &&
    captureRefsKnown(tonightRefs) &&
    !tonightRefs.some((ref) => captureRefIn(ref, rejectedClimateRefs));
  // Tonight's newest VPD evidence being invalid is terminal before any
  // header-rejection fallback: an older observation never stands beside it.
  // A genuinely newer `existing` already returned above (Copilot on #2303 at
  // b49c32ae).
  if (tonight?.state === "invalid") {
    return {
      value: null,
      capturedAt: null,
      source: null,
      stale: false,
      calculated: false,
      rejected: true,
    };
  }
  // With no valid stand-in, a rejection is reported as such, so the page
  // labels it instead of dropping the VPD silently (Copilot on #2459 at
  // de8c1b27).
  const withheld = (observation: TentDetailVpdObservation): TentDetailVpdObservation =>
    observation.value === null ? { ...observation, rejected: true } : observation;
  // A temperature- or RH-only rejection withholds a VPD only when one was in
  // play: a rejected VPD row, an observed VPD, or a calculable temperature +
  // RH pair at the rejected capture. Otherwise there is no VPD to call
  // invalid (independent review on #2474 at 5e9cb604). Temperature and RH
  // both rejected also counts, without checking they share a capture: that
  // errs toward labelling the VPD invalid rather than showing it
  // (independent review on #2501 at 57ff9f45).
  const vpdInPlay =
    input.rejectedMetrics.includes("vpd") ||
    input.existing.value !== null ||
    tonight?.state === "value" ||
    (input.rejectedMetrics.includes("temp") && input.rejectedMetrics.includes("rh")) ||
    (rejectedMs !== null &&
      capturePairsTempAndRh(input.captureClimate, rejectedMs, rejectedClimateRefs));
  if (rejectionApplies && climateRejected && !tonightIndependent) {
    const observation = existingOrNothing();
    return vpdInPlay ? withheld(observation) : observation;
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
      ...(tonight.historical === true && tonight.sourceLabel
        ? { sourceLabel: tonight.sourceLabel }
        : {}),
    };
  }
  // Tonight's candidate failed sensor truth. The tent page's own observation
  // stands in only when it is a different capture: the Environment header
  // grades the same direct VPD without the row quality flag, so at the same
  // instant it is the rejected reading itself (Codex P1 on #2303 at 0c19a9e0).
  // When both identities are known, the records decide; the instant decides
  // only when either is unknown (Copilot on #2303 at b49c32ae).
  const existingIsTonightCapture =
    typeof input.existingRef === "string" && captureRefsKnown(tonightRefs)
      ? captureRefIn(input.existingRef, tonightRefs)
      : existingMs !== null && tonightMs !== null && existingMs === tonightMs;
  if (tonight?.state === "value" && existingIsTonightCapture) {
    return {
      value: null,
      capturedAt: null,
      source: null,
      stale: false,
      calculated: false,
      rejected: true,
    };
  }
  // Tonight's value failed sensor truth: with no other capture to stand in,
  // it is a rejection, not an absence.
  return tonight?.state === "value" ? withheld(existingOrNothing()) : existingOrNothing();
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
