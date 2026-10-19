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
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { formatAgeLabel } from "@/lib/sensorSnapshotFreshnessRules";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";

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

export type TonightSensorRow = DashboardSensorEvidenceRow & { id?: string };

export type TonightRowsReadStatus = "loading" | "error" | "refresh_error" | "success";

export interface TonightSnapshotInput {
  status: "idle" | "loading" | "ok" | "unavailable";
  snapshot: {
    source: string;
    ts: string | null;
    temp: number | null;
    rh: number | null;
    vpd: number | null;
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
}

/** Allowed clock skew before a capture time counts as "in the future". */
const FUTURE_SKEW_MS = 60_000;

interface Candidate {
  value: number;
  source: SensorSource;
  at: string;
  epochMs: number;
  /** 0 = sensor row, 1 = diary-inclusive snapshot; deterministic tie-break. */
  origin: 0 | 1;
  /** Set only on a VPD candidate derived from temperature and RH. */
  calculated?: true;
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

/**
 * VPD from temperature and RH when no stored vpd_kpa exists.
 * A pair captured at the same time wins over a newer unpaired reading.
 * Otherwise the latest usable temperature and the latest usable RH are used,
 * and the result is dated to the older of the two so it is not newer than
 * either input. Out-of-range inputs stay invalid and carry no number.
 */
function calculatedVpdCandidate(
  temps: readonly Candidate[],
  rhs: readonly Candidate[],
  nowMs: number,
): Candidate | null {
  const usableTemps = temps
    .map((c) => usableCandidate(c, nowMs))
    .filter((c): c is Candidate => c != null)
    .sort(newestFirst);
  const usableRhs = rhs
    .map((c) => usableCandidate(c, nowMs))
    .filter((c): c is Candidate => c != null)
    .sort(newestFirst);
  if (usableTemps.length === 0 || usableRhs.length === 0) return null;

  const rhByEpoch = new Map<number, Candidate>();
  for (const rh of usableRhs) {
    if (!rhByEpoch.has(rh.epochMs)) rhByEpoch.set(rh.epochMs, rh);
  }
  let temp = usableTemps[0];
  let rh = usableRhs[0];
  const paired = usableTemps.find((c) => rhByEpoch.has(c.epochMs));
  if (paired) {
    temp = paired;
    rh = rhByEpoch.get(paired.epochMs)!;
  }

  const older = temp.epochMs <= rh.epochMs ? temp : rh;
  const source = compositeVpdSource(temp.source, rh.source);
  if (source == null) return null;
  const when = {
    at: older.at,
    epochMs: older.epochMs,
    origin: 0 as const,
    calculated: true as const,
  };
  // RH pinned at 0% or 100% is a stuck sensor, not a reading (same guard as the Environment ribbon).
  const vpd = rhIsPinned(rh.value)
    ? null
    : calculateVpdKpa({ tempC: temp.value, rhPercent: rh.value });
  if (vpd == null) return { value: 0, source: "invalid", ...when };
  return { value: vpd, source, ...when };
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
 * Newest finite candidate per metric, each keeping its own source and capture
 * time. A newer RH-only record never renews temperature. VPD with no stored
 * reading is calculated from temperature and RH (same capture time first).
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

  for (const { key, readingMetric } of METRICS) {
    const candidates = byKey.get(key)!;
    for (const row of evidenceRows) {
      if (row.metric !== readingMetric) continue;
      if (typeof row.value !== "number" || !Number.isFinite(row.value)) continue;
      const when = parseAt(row.captured_at ?? row.ts);
      if (!when) continue;
      candidates.push({
        value: row.value,
        source: normalizeSensorSource(row.source),
        ...when,
        origin: 0,
      });
    }

    const snap = input.snapshot.status === "ok" ? input.snapshot.snapshot : null;
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
      candidates.push({ value: snapValue, source: snapSource, ...snapWhen, origin: 1 });
    }
    candidates.sort(newestFirst);
  }

  const vpdCandidates = byKey.get("vpd")!;
  if (vpdCandidates.length === 0) {
    const derived = calculatedVpdCandidate(byKey.get("temp")!, byKey.get("rh")!, nowMs);
    if (derived) vpdCandidates.push(derived);
  }

  return METRICS.map(({ key, label }) => {
    const candidates = byKey.get(key)!;
    const best = candidates[0];

    if (!best) {
      const loading = rowsAreLoading(input.rowsRead.status) || input.snapshot.status === "loading";
      const failed = rowsFailed(input.rowsRead.status) || input.snapshot.status === "unavailable";
      const state: TonightMetricState = loading ? "loading" : failed ? "unavailable" : "missing";
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
      sourceLabel: sensorSourceLabel(source),
      capturedAt: best.at,
      ageText: formatAgeLabel(Math.max(0, ageMs)),
      calculated: best.calculated === true,
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
