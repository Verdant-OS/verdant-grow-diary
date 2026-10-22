/**
 * One-Tent Home first fold (slice `tonight-tent-home-fold`).
 *
 * Pure view model for the signed-in Dashboard's first card: one scoped tent,
 * Temperature / RH / VPD each with its own source and age, the latest log,
 * and one Log control. No health score and no implied live state.
 *
 * Pure. No I/O. No React. `now` is injected.
 */
import {
  normalizeSensorSource,
  sensorSourceLabel,
  type SensorSource,
} from "@/lib/sensor/sensorSourceRules";
import {
  selectDashboardSensorEvidenceRows,
  selectRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { formatAgeLabel } from "@/lib/sensorSnapshotFreshnessRules";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type {
  SensorSnapshotCaptureEvidence,
  SensorSnapshotRejectedQualityRow,
} from "@/lib/sensorSnapshotCaptureEvidence";
import {
  rowCaptureRef,
  snapshotCaptureRef,
  sensorCaptureRef,
  type SensorCaptureRef,
} from "@/lib/sensorCaptureRefRules";

/** Source label for a generic diary snapshot (historical, not a manual envelope). */
export const DIARY_SOURCE_LABEL = "Diary note";

export const TONIGHT_TENT_HOME_COPY = {
  missing: "Missing",
  unavailable: "Unavailable",
  // Not "Loading…": that exact text is the app shell's global loading screen.
  loading: "Checking…",
  invalidValue: "—",
  lastLogPrefix: "Last log in this grow:",
  noLogToday: "No log today",
  lastLogUnavailable: "Last log: not available",
  lastLogLoading: "Checking last log…",
  log: "Log",
  demo: "Demo",
  /** Shown under a VPD value derived from temperature and RH, never under a stored reading. */
  calculatedVpd: "Calculated from temperature and RH",
  chooseHeading: "Choose a tent",
  chooseBody: "Several tents could be tonight's tent. Open the one you want to check.",
} as const;

// ---------------------------------------------------------------------------
// Tent selection
// ---------------------------------------------------------------------------

export interface TonightTentRow {
  id: string;
  name: string;
  growId?: string | null;
}

export interface TonightPlantRow {
  id: string;
  tentId?: string | null;
  growId?: string | null;
}

export type TonightTentSelection =
  | { kind: "none" }
  | { kind: "choose"; tents: Array<{ id: string; name: string }> }
  | {
      kind: "tent";
      basis: "only" | "connected";
      tent: { id: string; name: string; growId: string | null };
    };

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Only tent → that tent. Several tents → the connected tent, but only when it
 * is the single tent holding plants; otherwise the grower chooses. Never
 * picks an arbitrary winner and never invents a tent.
 */
export function resolveTonightTentSelection(input: {
  tents: readonly TonightTentRow[] | null | undefined;
  plants: readonly TonightPlantRow[] | null | undefined;
  connectedTentId: string | null | undefined;
}): TonightTentSelection {
  const tents = (input.tents ?? []).filter((t) => t && typeof t.id === "string" && t.id);
  if (tents.length === 0) return { kind: "none" };

  const toTent = (t: TonightTentRow) => ({ id: t.id, name: t.name, growId: t.growId ?? null });
  if (tents.length === 1) return { kind: "tent", basis: "only", tent: toTent(tents[0]) };

  const tentIds = new Set(tents.map((t) => t.id));
  const tentsWithPlants = new Set(
    (input.plants ?? [])
      .map((p) => p?.tentId ?? null)
      .filter((id): id is string => !!id && tentIds.has(id)),
  );
  const connected = input.connectedTentId ?? null;
  if (
    connected &&
    tentIds.has(connected) &&
    tentsWithPlants.size === 1 &&
    tentsWithPlants.has(connected)
  ) {
    const tent = tents.find((t) => t.id === connected)!;
    return { kind: "tent", basis: "connected", tent: toTent(tent) };
  }

  return {
    kind: "choose",
    tents: [...tents]
      .sort((a, b) => compareText(a.name ?? "", b.name ?? "") || compareText(a.id, b.id))
      .map((t) => ({ id: t.id, name: t.name })),
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type TonightMetricKey = "temp" | "rh" | "vpd";

const METRICS: ReadonlyArray<{ key: TonightMetricKey; label: string; readingMetric: string }> = [
  { key: "temp", label: "Temperature", readingMetric: "temperature_c" },
  { key: "rh", label: "RH", readingMetric: "humidity_pct" },
  { key: "vpd", label: "VPD", readingMetric: "vpd_kpa" },
];

export type TonightSensorRow = DashboardSensorEvidenceRow & {
  id?: string;
  /** Capture identity when the row stands in for another record (a diary entry). */
  capture_ref?: string | null;
};

export type TonightRowsReadStatus = "loading" | "error" | "refresh_error" | "success";

export interface TonightSnapshotInput {
  status: "idle" | "loading" | "ok" | "unavailable";
  snapshot: {
    source: string;
    ts: string | null;
    temp: number | null;
    rh: number | null;
    vpd: number | null;
    /** Per-metric raw source of the exact sensor row behind each value, when known. */
    metric_refs?: SensorSnapshot["metric_refs"];
    /** Present when the whole snapshot came from one diary row. */
    diary_evidence_ref?: SensorSnapshot["diary_evidence_ref"];
    /** The diary entry a generic blob came from: capture identity only. */
    diary_capture_id?: SensorSnapshotCaptureEvidence["diary_capture_id"];
    rejected_quality_rows?: SensorSnapshotCaptureEvidence["rejected_quality_rows"];
  } | null;
}

export type TonightMetricState = "value" | "invalid" | "missing" | "loading" | "unavailable";

export interface TonightMetricView {
  key: TonightMetricKey;
  label: string;
  state: TonightMetricState;
  /** Raw stored value (°C for temperature, % for RH, kPa for VPD). Null unless state is "value". */
  value: number | null;
  source: SensorSource | null;
  sourceLabel: string | null;
  capturedAt: string | null;
  ageText: string | null;
  /** True only for VPD derived from temperature and RH (no stored vpd_kpa). */
  calculated: boolean;
  /**
   * The stored records behind the value (`sensorCaptureRefRules`): the row or
   * diary entry it was read from, or both inputs of a calculated VPD. A null
   * entry is an unknown identity (Codex P1 on #2303 at fa8edcff).
   */
  captureRefs?: readonly (SensorCaptureRef | null)[];
  /**
   * True when the value comes from a generic diary snapshot (raw source
   * `diary`): historical context, never a healthy current cue on surfaces that
   * grade it (`isDashboardSnapshotEligibleForHealthyCues`; Codex P1 on #2303
   * at 4bd3fae7). Tonight labels it "Diary note" (`DIARY_SOURCE_LABEL`), never
   * Manual (Codex P1 on #2303 at 0994ea2a).
   */
  historical?: true;
  /**
   * The temperature (°C) and RH (%) a calculated VPD was derived from, which
   * can be an older same-capture pair than the temperature and RH the card
   * shows. Capture checks validate these, not the displayed values (Codex P2
   * on #2303 at 3e689090).
   */
  inputs?: { temp: number; rh: number };
}

/** Allowed clock skew before a capture time counts as "in the future". */
const FUTURE_SKEW_MS = 60_000;
/** Tonight's future-skew threshold, for surfaces that must agree with it (#2303). */
export const TONIGHT_FUTURE_SKEW_MS = FUTURE_SKEW_MS;

interface Candidate {
  value: number;
  source: SensorSource;
  at: string;
  epochMs: number;
  /** 0 = sensor row, 1 = diary-inclusive snapshot; deterministic tie-break. */
  origin: 0 | 1;
  /** Set only on a VPD candidate derived from temperature and RH. */
  calculated?: true;
  /**
   * True when `source` is proven to describe this metric's own record. A
   * readings snapshot labels every metric with one aggregate source (same-time
   * live + manual rows collapse to "manual"), so its metrics are proven only
   * through per-metric refs or a single diary record. Unproven candidates are
   * still shown on their own but never feed a calculated VPD.
   */
  ownSource: boolean;
  /** Capture identity of the record(s) behind this candidate. */
  refs: readonly (SensorCaptureRef | null)[];
  /** From a generic diary snapshot (raw source `diary`). */
  historical?: true;
  /** The temperature and RH a calculated VPD came from. */
  inputs?: { temp: number; rh: number };
}

/** A generic diary snapshot, as opposed to an Environment Check or manual-snapshot envelope. */
function isDiarySource(source: unknown): boolean {
  return typeof source === "string" && source.trim().toLowerCase() === "diary";
}

/** Snapshot sources map onto the canonical vocabulary; "unavailable" carries no reading. */
function snapshotSource(raw: string): SensorSource | null {
  switch (raw) {
    case "live":
      return "live";
    case "manual":
    case "diary":
      return "manual";
    case "csv":
      return "csv";
    case "sim":
      return "demo";
    case "unavailable":
      return null;
    default:
      return "invalid";
  }
}

type TonightSnapshot = NonNullable<TonightSnapshotInput["snapshot"]>;

function snapshotMetricSourceProven(
  snap: TonightSnapshot,
  key: TonightMetricKey,
  source: SensorSource,
): boolean {
  // One diary blob or one diary row: every metric shares that record's source.
  if (snap.source === "diary" || snap.diary_evidence_ref) return true;
  const ref = snap.metric_refs?.[key];
  return ref != null && normalizeSensorSource(ref.source) === source;
}

/**
 * The source of one snapshot metric: its own row's source when the snapshot
 * carries that metric's exact ref (a mixed-source snapshot must not lend its
 * aggregate source to every metric — Codex P1 on #2303 at 4a304fe3). A diary
 * record, or a legacy snapshot without refs, keeps the record's own source.
 */
function snapshotMetricSource(
  snap: TonightSnapshot,
  key: TonightMetricKey,
  aggregate: SensorSource,
): SensorSource {
  if (snap.source === "diary" || snap.diary_evidence_ref) return aggregate;
  const ref = snap.metric_refs?.[key];
  return ref ? normalizeSensorSource(ref.source) : aggregate;
}

function parseAt(value: string | null | undefined): { at: string; epochMs: number } | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? { at: value, epochMs } : null;
}

function rowsAreLoading(status: TonightRowsReadStatus): boolean {
  return status === "loading";
}

function rowsFailed(status: TonightRowsReadStatus): boolean {
  return status === "error" || status === "refresh_error";
}

/** Drop future and unknown-source readings. Live past the canon window is stale, still usable. */
function usableCandidate(candidate: Candidate, nowMs: number): Candidate | null {
  if (candidate.source === "invalid") return null;
  const ageMs = nowMs - candidate.epochMs;
  if (ageMs < -FUTURE_SKEW_MS) return null;
  if (candidate.source === "live" && ageMs > LIVE_CURRENT_STATE_STALE_MS) {
    return { ...candidate, source: "stale" };
  }
  return candidate;
}

function newestFirst(a: Candidate, b: Candidate): number {
  return b.epochMs - a.epochMs || a.origin - b.origin;
}

type CalculatedVpd =
  | { kind: "no_inputs" }
  | { kind: "underivable" }
  /** `paired`: temperature and RH share one capture time; `inputs`: the pair used. */
  | {
      kind: "derived";
      candidate: Candidate;
      paired: boolean;
      inputs: { temp: Candidate; rh: Candidate };
    };

function usableSorted(candidates: readonly Candidate[], nowMs: number): Candidate[] {
  return candidates
    .map((c) => usableCandidate(c, nowMs))
    .filter((c): c is Candidate => c != null)
    .sort(newestFirst);
}

/**
 * VPD from temperature and RH, used when no stored vpd_kpa exists or when a
 * same-capture pair is newer than every stored one.
 * Only inputs whose own source is proven are used. The newest same-time pair
 * with compatible sources wins over a newer unpaired reading. Otherwise the
 * latest proven temperature and RH are used, and the result is dated to the
 * older of the two so it is not newer than either input. Out-of-range inputs
 * stay invalid and carry no number. Inputs that exist but cannot honestly be
 * combined (mixed or unproven sources) are "underivable", never a value.
 */
function calculatedVpdCandidate(
  temps: readonly Candidate[],
  rhs: readonly Candidate[],
  nowMs: number,
): CalculatedVpd {
  const usableTemps = usableSorted(temps, nowMs);
  const usableRhs = usableSorted(rhs, nowMs);
  if (usableTemps.length === 0 || usableRhs.length === 0) return { kind: "no_inputs" };

  const provenTemps = usableTemps.filter((c) => c.ownSource);
  const provenRhs = usableRhs.filter((c) => c.ownSource);
  if (provenTemps.length === 0 || provenRhs.length === 0) return { kind: "underivable" };

  let temp = provenTemps[0];
  let rh = provenRhs[0];
  let paired = false;
  for (const candidateTemp of provenTemps) {
    const matchingRh = provenRhs.find(
      (candidateRh) =>
        candidateRh.epochMs === candidateTemp.epochMs &&
        compositeVpdSource(candidateTemp.source, candidateRh.source) != null,
    );
    if (matchingRh) {
      temp = candidateTemp;
      rh = matchingRh;
      paired = true;
      break;
    }
  }

  const older = temp.epochMs <= rh.epochMs ? temp : rh;
  const source = compositeVpdSource(temp.source, rh.source);
  if (source == null) return { kind: "underivable" };
  const when = {
    at: older.at,
    epochMs: older.epochMs,
    origin: 0 as const,
    calculated: true as const,
    ownSource: true,
    refs: [...temp.refs, ...rh.refs],
    inputs: { temp: temp.value, rh: rh.value },
    ...(temp.historical || rh.historical ? { historical: true as const } : {}),
  };
  // RH pinned at 0% or 100% is a stuck sensor, not a reading (same guard as the Environment ribbon).
  const vpd = rhIsPinned(rh.value)
    ? null
    : calculateVpdKpa({ tempC: temp.value, rhPercent: rh.value });
  if (vpd == null) {
    return {
      kind: "derived",
      candidate: { value: 0, source: "invalid", ...when },
      paired,
      inputs: { temp, rh },
    };
  }
  return {
    kind: "derived",
    candidate: { value: vpd, source, ...when },
    paired,
    inputs: { temp, rh },
  };
}

/** Compares after the same freshness normalization the pair went through (live past the window → stale). */
function isDisplayedCandidate(
  used: Candidate,
  displayed: Candidate | undefined,
  nowMs: number,
): boolean {
  const shown = displayed ? usableCandidate(displayed, nowMs) : null;
  return (
    shown != null &&
    used.epochMs === shown.epochMs &&
    used.value === shown.value &&
    used.source === shown.source
  );
}

function rhIsPinned(rh: number): boolean {
  return rh <= 0 || rh >= 100;
}

/**
 * Provenance of a value derived from two inputs. Same source → that source.
 * A live sensor pair where one input aged out → stale. Any other mix (live with
 * manual, CSV with demo, …) has no honest single label, so no value is derived.
 */
function compositeVpdSource(a: SensorSource, b: SensorSource): SensorSource | null {
  if (a === b) return a;
  const pair = new Set([a, b]);
  if (pair.has("live") && pair.has("stale")) return "stale";
  return null;
}

/**
 * Whether the capture at `ref` / `atMs` carries a sibling row the snapshot
 * read dropped for intake quality or an explicit stale/invalid source.
 * Matched by record identity when both are known, else by instant (ambiguous
 * captures are withheld). Such a capture is never shown as current, as the
 * raw-row capture gate already decides for the tents list and Tent Detail
 * (Codex P1 on #2303 at 4a304fe3). It applies to every candidate from that
 * capture, the raw row as well as the snapshot copy (Codex P1 at b2606eca).
 */
function captureHasRejectedSibling(
  rejected: readonly SensorSnapshotRejectedQualityRow[],
  ref: SensorCaptureRef | null,
  atMs: number,
): boolean {
  return rejected.some((row) => {
    const rowRef = sensorCaptureRef(row.captured_at, row.source);
    if (ref && rowRef) return ref === rowRef;
    return Number.isFinite(atMs) && Date.parse(row.captured_at) === atMs;
  });
}

/**
 * Newest finite candidate per metric, each keeping its own source and capture
 * time. A newer RH-only record never renews temperature. VPD with no stored
 * reading is calculated from temperature and RH (same capture time first); a
 * same-capture pair newer than every stored VPD also replaces it (#2268).
 */
export function buildTonightTentMetrics(input: {
  rows: readonly TonightSensorRow[] | null | undefined;
  rowsRead: { status: TonightRowsReadStatus };
  snapshot: TonightSnapshotInput;
  now: Date;
}): TonightMetricView[] {
  const nowMs = input.now.getTime();
  const evidenceRows = rowsFailed(input.rowsRead.status)
    ? []
    : selectDashboardSensorEvidenceRows(input.rows ?? []);

  const byKey = new Map<TonightMetricKey, Candidate[]>();
  for (const metric of METRICS) byKey.set(metric.key, []);

  const snap = input.snapshot.status === "ok" ? input.snapshot.snapshot : null;
  // Rejected siblings come from the raw rows as well as the snapshot, so a raw
  // candidate is withheld even while the snapshot is loading or unavailable
  // (Codex P1 on #2303 at 413fdbd2).
  const rejectedSiblings: SensorSnapshotRejectedQualityRow[] = [
    ...(snap?.rejected_quality_rows ?? []),
    ...(rowsFailed(input.rowsRead.status) ? [] : selectRejectedQualityRows(input.rows ?? [])),
  ];
  for (const { key, readingMetric } of METRICS) {
    const candidates = byKey.get(key)!;
    for (const row of evidenceRows) {
      if (row.metric !== readingMetric) continue;
      if (typeof row.value !== "number" || !Number.isFinite(row.value)) continue;
      const when = parseAt(row.captured_at ?? row.ts);
      if (!when) continue;
      const ref = rowCaptureRef(row);
      candidates.push({
        value: row.value,
        source: captureHasRejectedSibling(rejectedSiblings, ref, when.epochMs)
          ? "invalid"
          : normalizeSensorSource(row.source),
        ...when,
        origin: 0,
        ownSource: true,
        refs: [ref],
        ...(isDiarySource(row.source) ? { historical: true as const } : {}),
      });
    }

    const snapValue = snap ? snap[key] : null;
    const snapSource = snap ? snapshotSource(snap.source) : null;
    const snapWhen = snap ? parseAt(snap.ts) : null;
    if (
      snap &&
      snapSource &&
      snapWhen &&
      typeof snapValue === "number" &&
      Number.isFinite(snapValue)
    ) {
      const snapRef = snapshotCaptureRef(snap, key);
      const atMs = Date.parse(snap.metric_refs?.[key]?.captured_at ?? snap.ts ?? "");
      const metricSource = captureHasRejectedSibling(rejectedSiblings, snapRef, atMs)
        ? "invalid"
        : snapshotMetricSource(snap, key, snapSource);
      candidates.push({
        value: snapValue,
        source: metricSource,
        ...snapWhen,
        origin: 1,
        ownSource: snapshotMetricSourceProven(snap, key, metricSource),
        refs: [snapRef],
        ...(isDiarySource(snap.source) ? { historical: true as const } : {}),
      });
    }
    // A VPD row rejected on its own (quality or explicit stale/invalid source)
    // stays terminal: it is the newest VPD evidence, so an older valid VPD
    // must not surface behind it (Codex P1 on #2303 at 6a242e1f).
    if (key === "vpd") {
      for (const rejected of rejectedSiblings) {
        if (rejected.metric !== readingMetric) continue;
        const when = parseAt(rejected.captured_at);
        if (!when) continue;
        candidates.push({
          value: 0,
          source: "invalid",
          ...when,
          origin: 0,
          ownSource: false,
          refs: [sensorCaptureRef(rejected.captured_at, rejected.source)],
        });
      }
    }
    candidates.sort(newestFirst);
  }

  const vpdCandidates = byKey.get("vpd")!;
  let vpdUnderivable = false;
  const derived = calculatedVpdCandidate(byKey.get("temp")!, byKey.get("rh")!, nowMs);
  if (vpdCandidates.length === 0) {
    if (derived.kind === "derived") vpdCandidates.push(derived.candidate);
    vpdUnderivable = derived.kind === "underivable";
  } else if (
    derived.kind === "derived" &&
    derived.paired &&
    isDisplayedCandidate(derived.inputs.temp, byKey.get("temp")![0], nowMs) &&
    isDisplayedCandidate(derived.inputs.rh, byKey.get("rh")![0], nowMs) &&
    derived.candidate.epochMs > vpdCandidates[0].epochMs
  ) {
    // #2268: when the temperature and RH the card shows are one capture newer
    // than every stored VPD, that pair's calculated VPD replaces the stored one.
    // An older pair is never used beside newer displayed inputs.
    vpdCandidates.unshift(derived.candidate);
  }

  return METRICS.map(({ key, label }) => {
    const candidates = byKey.get(key)!;
    const best = candidates[0];

    if (!best) {
      const loading = rowsAreLoading(input.rowsRead.status) || input.snapshot.status === "loading";
      const failed = rowsFailed(input.rowsRead.status) || input.snapshot.status === "unavailable";
      // Temperature and RH exist but cannot honestly be combined: unavailable, not missing.
      const underivable = key === "vpd" && vpdUnderivable;
      const state: TonightMetricState = loading
        ? "loading"
        : failed || underivable
          ? "unavailable"
          : "missing";
      return {
        key,
        label,
        state,
        value: null,
        source: null,
        sourceLabel: null,
        capturedAt: null,
        ageText: null,
        calculated: false,
      };
    }

    const ageMs = nowMs - best.epochMs;
    let source: SensorSource = best.source;
    if (ageMs < -FUTURE_SKEW_MS) source = "invalid";
    else if (source === "live" && ageMs > LIVE_CURRENT_STATE_STALE_MS) source = "stale";

    const invalid = source === "invalid";
    return {
      key,
      label,
      state: invalid ? "invalid" : "value",
      value: invalid ? null : best.value,
      source,
      // A generic diary snapshot is historical context, never an Environment
      // Check: the card shows it as a diary note, not "Manual" (Codex P1 on
      // #2303 at 0994ea2a).
      sourceLabel: best.historical && !invalid ? DIARY_SOURCE_LABEL : sensorSourceLabel(source),
      capturedAt: best.at,
      ageText: formatAgeLabel(Math.max(0, ageMs)),
      calculated: best.calculated === true,
      captureRefs: best.refs,
      ...(best.historical ? { historical: true as const } : {}),
      ...(best.inputs ? { inputs: best.inputs } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Last log
// ---------------------------------------------------------------------------

export type TonightLastLog =
  | { kind: "loading"; text: string }
  | { kind: "unavailable"; text: string }
  | { kind: "today"; text: string }
  | { kind: "none_today"; text: string };

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The connected evidence read is grow-scoped: it counts logs for this tent
 * and logs in the grow with no tent. The copy says "in this grow" so it never
 * claims a tent-only history. A failed, pending or inapplicable read never
 * claims "No log today".
 */
export function buildTonightLastLog(input: {
  applies: boolean;
  status: "idle" | "loading" | "ok" | "unavailable";
  latestAt: string | null;
  now: Date;
}): TonightLastLog {
  if (!input.applies || input.status === "idle" || input.status === "unavailable") {
    return { kind: "unavailable", text: TONIGHT_TENT_HOME_COPY.lastLogUnavailable };
  }
  if (input.status === "loading") {
    return { kind: "loading", text: TONIGHT_TENT_HOME_COPY.lastLogLoading };
  }
  const when = parseAt(input.latestAt);
  if (!when || when.epochMs > input.now.getTime() + FUTURE_SKEW_MS) {
    return when
      ? { kind: "unavailable", text: TONIGHT_TENT_HOME_COPY.lastLogUnavailable }
      : { kind: "none_today", text: TONIGHT_TENT_HOME_COPY.noLogToday };
  }
  if (!isSameLocalDay(new Date(when.epochMs), input.now)) {
    return { kind: "none_today", text: TONIGHT_TENT_HOME_COPY.noLogToday };
  }
  const age = formatAgeLabel(Math.max(0, input.now.getTime() - when.epochMs));
  return { kind: "today", text: `${TONIGHT_TENT_HOME_COPY.lastLogPrefix} ${age}` };
}
