/**
 * alertFreshnessContext — pure helpers for Alerts page operator-context
 * messaging.
 *
 * Hard rules:
 *   - Pure: no I/O, no React, no Supabase, no time, no randomness.
 *   - Single source of truth for the alert-persistence freshness window: the
 *     LIVE window (15m) for EVERY source, mirroring isSnapshotPersistable.
 *     This is deliberately tighter than source-aware DISPLAY freshness, where
 *     Sensor Truth Canon keeps a manual reading current for 24h. Because this
 *     module's copy promises "eligible for alert persistence", a 24h manual
 *     label here would advertise persistence for snapshots the gate rejects.
 *   - Never relabels demo/stale/invalid/csv/diary/unknown telemetry as
 *     healthy or persistable.
 *   - Operator-facing copy must mirror `alertsCanPersist`. We never imply
 *     persistence for csv/sim/diary/unavailable or stale snapshots.
 */
import {
  STALE_THRESHOLD_MS,
  isStale,
  type SensorSnapshot,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import {
  snapshotPersistenceBlockReason,
  type PersistenceBlockReason,
  type PersistenceContext,
} from "@/lib/environmentAlertPersistence";
import { METRIC_LABELS, type GrowTargets } from "@/lib/environmentTargetComparison";
import {
  convertCelsiusForDisplay,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

/** Freshness window, in minutes, for operator-facing copy (all sources). */
export const STALE_THRESHOLD_MINUTES = Math.round(STALE_THRESHOLD_MS / 60_000);

/** Short human label for the alert persistence window. Every source is held to
 * the live window here, so this label carries no manual-specific carve-out. */
export const FRESHNESS_WINDOW_LABEL = "15-minute alert window";

export type LatestSnapshotFreshness = "fresh" | "stale" | "missing" | "unavailable";

/**
 * Operator-facing explanation for why the manual "Save alert" action is
 * unavailable, keyed by the gate's own reason.
 *
 * Each string must describe the reason it is keyed to and nothing else. A
 * single catch-all ("this reading is outside the window") is what this map
 * exists to prevent: it misreports provenance for a missing, simulated, or
 * demo snapshot, telling the grower their reading is merely expired when it
 * was never eligible in the first place.
 */
export const ALERT_SAVE_BLOCK_MESSAGE: Record<PersistenceBlockReason, string> = {
  demo_data: "This is demo data, so it cannot create a saved alert.",
  no_snapshot: "There is no sensor reading yet. Enter a manual snapshot to save alerts.",
  provenance_ineligible:
    "This Quick Log entry is recorded as manual diary evidence, so it cannot create a saved alert. Add a manual sensor reading to check alerts.",
  context_only_source:
    "This reading is context only. Saved alerts come from manual or live readings.",
  quality_unavailable: "This reading has no usable values, so it cannot create a saved alert.",
  outside_live_window: `This reading is outside the ${FRESHNESS_WINDOW_LABEL}, so it cannot raise a new alert. Enter a fresh manual snapshot.`,
};

/** Explanation for the current gate result, or null when saving is allowed. */
export function describeAlertSaveBlock(ctx: PersistenceContext): string | null {
  const reason = snapshotPersistenceBlockReason(ctx);
  return reason === null ? null : ALERT_SAVE_BLOCK_MESSAGE[reason];
}

export interface ClassifyLatestSnapshotArgs {
  /** From useLatestSensorSnapshot — `"ok"` means data loaded successfully. */
  status: "idle" | "loading" | "ok" | "unavailable";
  snapshot: SensorSnapshot | null;
  /** Injectable for tests. */
  now?: number;
}

/**
 * Classify the latest sensor snapshot into a deterministic freshness state
 * for the Alerts page header and stale-badge copy.
 *
 * This is DISPLAY freshness and is source-aware (manual/diary stay current
 * for 24h), so it agrees with every other display surface. It deliberately
 * does NOT answer "can this back an alert row" — that is
 * {@link snapshotAlertsCanPersist}, which applies the tighter live window.
 * A manual reading can legitimately be "fresh" here and still not persistable.
 *
 * Rules:
 *   - status "unavailable" / "loading" / "idle" → "unavailable".
 *   - snapshot null OR source "unavailable" OR ts null → "missing".
 *   - source live | manual AND not stale → "fresh".
 *   - everything else (stale, sim/diary/csv, future-dated, etc.) → "stale".
 *     Stale never gets relabeled as healthy.
 */
export function classifyLatestSnapshotFreshness(
  args: ClassifyLatestSnapshotArgs,
): LatestSnapshotFreshness {
  if (args.status !== "ok") return "unavailable";
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) return "missing";
  const now = args.now ?? Date.now();
  const stale = isStale(snap.ts, now, undefined, snap.source);
  if (stale) return "stale";
  if (snap.source === "live" || snap.source === "manual") return "fresh";
  // sim / diary / csv: not eligible for persistence even when "fresh".
  return "stale";
}

/**
 * True only when the latest snapshot is a manual reading that is still
 * inside the persistable window. This is what we surface as "a recent
 * manual snapshot exists inside the N-minute alert window".
 */
export function hasRecentManualSnapshot(args: ClassifyLatestSnapshotArgs): boolean {
  if (args.status !== "ok") return false;
  const snap = args.snapshot;
  if (!snap || snap.source !== "manual" || !snap.ts) return false;
  if (snap.alert_persistence_eligible === false) return false;
  const now = args.now ?? Date.now();
  return !isStale(snap.ts, now);
}

/**
 * Computes the exact same gate the alert persistence pipeline uses: a
 * snapshot can persist alerts only when status is loaded, source is
 * `live` or `manual`, it has not explicitly opted out, and its timestamp is
 * inside the freshness window.
 */
export function snapshotAlertsCanPersist(args: ClassifyLatestSnapshotArgs): boolean {
  if (args.status !== "ok") return false;
  const snap = args.snapshot;
  if (!snap || !snap.ts) return false;
  if (snap.alert_persistence_eligible === false) return false;
  if (snap.source !== "live" && snap.source !== "manual") return false;
  const now = args.now ?? Date.now();
  return !isStale(snap.ts, now);
}

/**
 * Operator-facing description of the latest snapshot, driven by
 * `alertsCanPersist` and the snapshot source. Never implies persistence
 * for csv / diary / sim / unavailable / stale snapshots.
 */
export function describeLatestSnapshotForAlerts(args: ClassifyLatestSnapshotArgs): string {
  if (args.status !== "ok") return "Snapshot status unavailable.";
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) {
    return "No snapshot available. Enter a manual snapshot to check alerts.";
  }
  const persistableSource = snap.source === "live" || snap.source === "manual";
  if (!persistableSource) {
    return "Latest snapshot is for context only. Alerts persist only from fresh manual or live readings.";
  }
  const now = args.now ?? Date.now();
  const sourceWord = snap.source === "live" ? "live" : "manual";
  if (snap.alert_persistence_eligible === false) {
    return "Latest manual snapshot is Quick Log diary evidence, so it cannot create saved alerts. Add a manual sensor reading to check alerts.";
  }
  // Two independent questions, reported separately so the copy never calls a
  // reading "stale" when display surfaces still consider it current:
  //   displayStale   — source-aware; is the telemetry itself out of date?
  //   outsidePersist — live window; can it back a new alert row?
  const displayStale = isStale(snap.ts, now, undefined, snap.source);
  const outsidePersistWindow = isStale(snap.ts, now);
  if (displayStale) {
    return `Latest ${sourceWord} snapshot is stale. Enter a new manual snapshot inside the ${FRESHNESS_WINDOW_LABEL}.`;
  }
  if (outsidePersistWindow) {
    return `Latest ${sourceWord} snapshot is current, but outside the ${FRESHNESS_WINDOW_LABEL} — enter a new manual snapshot to raise alerts from it.`;
  }
  return `Latest ${sourceWord} snapshot is fresh and can be checked against targets.`;
}

/* -------------------------------------------------------------------------- */
/* Alerts header context view-model                                            */
/* -------------------------------------------------------------------------- */

export interface AlertsHeaderRange {
  metricLabel: string;
  min: number | null;
  max: number | null;
  unit: string;
}

export interface LatestSnapshotDetail {
  /** Capitalized operator-facing source label: Manual / Live / CSV /
   * Diary / Simulated / Unknown. Never claims persistence. */
  sourceLabel: string;
  /** Pure relative-time string, e.g. "8 minutes ago" or "3 days ago".
   * Null when no usable timestamp. */
  capturedAgoText: string | null;
  insideWindow: boolean;
  canPersist: boolean;
  /** Prepared one-line operator-facing sentence — safe to render. */
  detailLine: string;
}

export interface AlertsHeaderContextViewModel {
  growName: string | null;
  stageLabel: string | null;
  ranges: {
    temp: AlertsHeaderRange | null;
    rh: AlertsHeaderRange | null;
    vpd: AlertsHeaderRange | null;
  };
  freshnessWindowLabel: string;
  latestFreshness: LatestSnapshotFreshness;
  latestSource: SnapshotSource | null;
  /** True only when the latest snapshot is persistable per the same rules
   * the alert pipeline uses. Presentation must never claim persistence
   * when this is false. */
  alertsCanPersist: boolean;
  /** Prepared one-line detail for the latest snapshot. Null when there
   * is no snapshot or status is unavailable/loading. */
  latestDetail: LatestSnapshotDetail | null;
}

const RH_UNIT = "%";
const VPD_UNIT = "kPa";

function roundOrNull(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function buildTempRange(
  targets: GrowTargets | null,
  tempUnit: TemperatureUnitPreference,
): AlertsHeaderRange | null {
  if (!targets || !targets.temp) return null;
  const t = targets.temp;
  if (t.min === null && t.max === null) return null;
  if (tempUnit === "fahrenheit") {
    return {
      metricLabel: METRIC_LABELS.temp,
      min: roundOrNull(convertCelsiusForDisplay(t.min, "fahrenheit")),
      max: roundOrNull(convertCelsiusForDisplay(t.max, "fahrenheit")),
      unit: "°F",
    };
  }
  return { metricLabel: METRIC_LABELS.temp, min: t.min, max: t.max, unit: "°C" };
}

function buildRhRange(targets: GrowTargets | null): AlertsHeaderRange | null {
  if (!targets || !targets.rh) return null;
  const t = targets.rh;
  if (t.min === null && t.max === null) return null;
  return { metricLabel: METRIC_LABELS.rh, min: t.min, max: t.max, unit: RH_UNIT };
}

function buildVpdRange(targets: GrowTargets | null): AlertsHeaderRange | null {
  if (!targets || !targets.vpd) return null;
  const t = targets.vpd;
  if (t.min === null && t.max === null) return null;
  return { metricLabel: METRIC_LABELS.vpd, min: t.min, max: t.max, unit: VPD_UNIT };
}

export interface BuildAlertsHeaderContextArgs {
  growName: string | null;
  stage: string | null;
  targets: GrowTargets | null;
  snapshot: SensorSnapshot | null;
  status: "idle" | "loading" | "ok" | "unavailable";
  now?: number;
  /** Optional override; when omitted, defaults to Celsius display so the
   * pure helper stays free of localStorage reads. Wrappers should pass
   * the loaded preference. */
  tempUnit?: TemperatureUnitPreference;
}

export function buildAlertsHeaderContext(
  args: BuildAlertsHeaderContextArgs,
): AlertsHeaderContextViewModel {
  const latestFreshness = classifyLatestSnapshotFreshness({
    snapshot: args.snapshot,
    status: args.status,
    now: args.now,
  });
  const latestSource: SnapshotSource | null =
    args.status === "ok" && args.snapshot ? args.snapshot.source : null;
  const alertsCanPersist = snapshotAlertsCanPersist({
    snapshot: args.snapshot,
    status: args.status,
    now: args.now,
  });
  const tempUnit: TemperatureUnitPreference = args.tempUnit ?? "celsius";
  return {
    growName: args.growName ?? null,
    stageLabel: args.stage ? formatStageLabel(args.stage) : null,
    ranges: {
      temp: buildTempRange(args.targets, tempUnit),
      rh: buildRhRange(args.targets),
      vpd: buildVpdRange(args.targets),
    },
    freshnessWindowLabel: FRESHNESS_WINDOW_LABEL,
    latestFreshness,
    latestSource,
    alertsCanPersist,
    latestDetail: buildLatestSnapshotDetail({
      snapshot: args.snapshot,
      status: args.status,
      now: args.now,
    }),
  };
}

function formatStageLabel(stage: string): string {
  const s = stage.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Latest snapshot detail                                                      */
/* -------------------------------------------------------------------------- */

const SOURCE_LABELS: Record<SnapshotSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  diary: "Diary",
  sim: "Simulated",
  unavailable: "Unknown",
  unverified: "Unverified",
};

/** Deterministic relative-time helper. Pure: no Intl.RelativeTimeFormat
 * locale variance. Returns null for null/invalid timestamps. */
export function formatCapturedAgo(capturedAtMs: number | null, now: number): string | null {
  if (capturedAtMs === null || !Number.isFinite(capturedAtMs)) return null;
  const diffMs = now - capturedAtMs;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  let value: number;
  let unit: string;
  if (mins < 1) return future ? "in <1 minute" : "<1 minute ago";
  if (mins < 60) {
    value = mins;
    unit = "minute";
  } else if (mins < 60 * 24) {
    value = Math.round(mins / 60);
    unit = "hour";
  } else {
    value = Math.round(mins / (60 * 24));
    unit = "day";
  }
  const plural = value === 1 ? unit : `${unit}s`;
  return future ? `in ${value} ${plural}` : `${value} ${plural} ago`;
}

export function buildLatestSnapshotDetail(
  args: ClassifyLatestSnapshotArgs,
): LatestSnapshotDetail | null {
  if (args.status !== "ok") return null;
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) return null;
  const now = args.now ?? Date.now();
  const ms = Date.parse(snap.ts);
  const capturedAgoText = formatCapturedAgo(Number.isFinite(ms) ? ms : null, now);
  const stale = isStale(snap.ts, now);
  const insideWindow = !stale;
  const persistableSource = snap.source === "live" || snap.source === "manual";
  const provenanceIneligible = snap.alert_persistence_eligible === false;
  const canPersist = persistableSource && !provenanceIneligible && insideWindow;
  const sourceLabel = SOURCE_LABELS[snap.source] ?? "Unknown";
  const captured = capturedAgoText ? `captured ${capturedAgoText}` : "captured time unknown";
  let detailLine: string;
  if (!persistableSource) {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · context only. Alerts persist only from fresh manual or live readings.`;
  } else if (provenanceIneligible) {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · Quick Log diary evidence; it cannot create persisted alerts.`;
  } else if (!insideWindow) {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · outside ${FRESHNESS_WINDOW_LABEL}. Enter a fresh manual snapshot to persist alerts.`;
  } else {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · inside ${FRESHNESS_WINDOW_LABEL} · eligible for alert persistence.`;
  }
  return { sourceLabel, capturedAgoText, insideWindow, canPersist, detailLine };
}

/* -------------------------------------------------------------------------- */
/* Unscoped Alerts grow context selection                                      */
/* -------------------------------------------------------------------------- */

export interface AlertsGrowCandidate {
  id: string;
  name: string | null;
  stage?: string | null;
  /** Optional — used as deterministic tiebreaker for "most recently updated". */
  updated_at?: string | null;
}

export interface PickAlertsGrowContextArgs {
  scopedGrowId?: string | null;
  activeGrowId?: string | null;
  grows: AlertsGrowCandidate[];
  /** Optional — grow ids known to have open alerts. */
  growIdsWithOpenAlerts?: ReadonlyArray<string>;
}

export type AlertsGrowContextReason = "scoped" | "active" | "open-alerts" | "most-recent" | "first";

export interface AlertsGrowContextSelection {
  growId: string;
  growName: string | null;
  stage: string | null;
  isFallback: boolean;
  reason: AlertsGrowContextReason;
}

/**
 * Deterministically pick the most relevant grow context for the Alerts
 * header. Preference order:
 *   1. scoped grow (from URL) — exact match must exist in `grows`.
 *   2. active grow — exact match must exist in `grows`.
 *   3. any grow with open alerts (id-sorted for determinism).
 *   4. most recently updated grow (by updated_at; id tiebreak).
 *   5. first grow by id.
 * Returns null when no candidate grow exists.
 */
export function pickAlertsGrowContext(
  args: PickAlertsGrowContextArgs,
): AlertsGrowContextSelection | null {
  const grows = args.grows ?? [];
  if (grows.length === 0) return null;

  const findById = (id: string | null | undefined) =>
    id ? (grows.find((g) => g.id === id) ?? null) : null;

  const scoped = findById(args.scopedGrowId);
  if (scoped) return toSelection(scoped, "scoped", false);

  const active = findById(args.activeGrowId);
  if (active) return toSelection(active, "active", false);

  const openAlertIds = new Set(args.growIdsWithOpenAlerts ?? []);
  if (openAlertIds.size > 0) {
    const open = grows
      .filter((g) => openAlertIds.has(g.id))
      .sort((a, b) => {
        const ta = a.updated_at ? Date.parse(a.updated_at) : NaN;
        const tb = b.updated_at ? Date.parse(b.updated_at) : NaN;
        if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
        return a.id.localeCompare(b.id);
      })[0];
    if (open) return toSelection(open, "open-alerts", true);
  }

  const withUpdates = grows
    .filter((g) => typeof g.updated_at === "string" && g.updated_at)
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at as string);
      const tb = Date.parse(b.updated_at as string);
      if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  if (withUpdates[0]) return toSelection(withUpdates[0], "most-recent", true);

  const first = [...grows].sort((a, b) => a.id.localeCompare(b.id))[0];
  return toSelection(first, "first", true);
}

function toSelection(
  g: AlertsGrowCandidate,
  reason: AlertsGrowContextReason,
  isFallback: boolean,
): AlertsGrowContextSelection {
  return {
    growId: g.id,
    growName: g.name ?? null,
    stage: g.stage ?? null,
    isFallback,
    reason,
  };
}

/* -------------------------------------------------------------------------- */
/* Source chip view-model                                                      */
/* -------------------------------------------------------------------------- */

/** Tone categories for the latest-snapshot source chip. Only `eligible`
 * represents a fresh manual sensor/live snapshot the alert engine can
 * persist from. Presenter maps these to semantic tokens. */
export type SourceChipTone = "eligible" | "warning" | "context" | "caution";

export interface SourceChipViewModel {
  /** Operator-facing label: Manual / Live / CSV / Diary / Simulated /
   * Unknown. Never relabels untrusted telemetry as healthy. */
  label: string;
  tone: SourceChipTone;
  /** Short qualifier such as "fresh", "stale", "context only",
   * "no snapshot". Null when not applicable. */
  qualifier: string | null;
  /** Mirrors the same gate used by the alert persistence pipeline. */
  canPersist: boolean;
}

export function buildSourceChip(args: ClassifyLatestSnapshotArgs): SourceChipViewModel {
  if (args.status !== "ok") {
    return { label: "Unknown", tone: "caution", qualifier: null, canPersist: false };
  }
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) {
    return {
      label: "Unknown",
      tone: "caution",
      qualifier: "no snapshot",
      canPersist: false,
    };
  }
  const stale = isStale(snap.ts, args.now ?? Date.now());
  const label = SOURCE_LABELS[snap.source] ?? "Unknown";
  if (snap.alert_persistence_eligible === false) {
    return { label, tone: "context", qualifier: "manual evidence", canPersist: false };
  }
  if (snap.source === "manual" || snap.source === "live") {
    if (stale) {
      return { label, tone: "warning", qualifier: "stale", canPersist: false };
    }
    return { label, tone: "eligible", qualifier: "fresh", canPersist: true };
  }
  return { label, tone: "context", qualifier: "context only", canPersist: false };
}

/* -------------------------------------------------------------------------- */
/* Source eligibility help copy                                                */
/* -------------------------------------------------------------------------- */

export const SOURCE_ELIGIBILITY_HELP = {
  title: "Source rules",
  eligible: "Eligible for persisted alerts: fresh manual sensor readings or live readings.",
  contextOnly:
    "Context only: Quick Log manual evidence, CSV, demo, diary, simulated, stale, invalid, unavailable, or unknown readings.",
  summary:
    "Alerts persist only from fresh manual sensor readings or live readings. Quick Log manual evidence, CSV, demo, diary, simulated, stale, invalid, unavailable, or unknown readings are shown for context only.",
  why: "This prevents stale or untrusted telemetry from creating misleading alerts.",
} as const;

/* -------------------------------------------------------------------------- */
/* Empty-state CTA                                                             */
/* -------------------------------------------------------------------------- */

export interface EmptyStateSnapshotCta {
  message: string;
  /** True when a "/sensors#manual-reading" action makes sense. */
  showAddManualSnapshot: boolean;
  /** Stable category for tests/styling. */
  kind: "missing" | "stale" | "context-only";
}

/**
 * Returns a CTA for the Alerts empty state ONLY when the latest snapshot
 * is missing, stale, or context-only. Returns null when the latest
 * snapshot is fresh and eligible for persistence (no nudge needed).
 */
export function emptyStateSnapshotCta(
  args: ClassifyLatestSnapshotArgs,
): EmptyStateSnapshotCta | null {
  if (args.status !== "ok") return null;
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) {
    return {
      message: "No snapshot available. Enter a fresh manual snapshot to check alerts.",
      showAddManualSnapshot: true,
      kind: "missing",
    };
  }
  if (snap.alert_persistence_eligible === false) {
    return {
      message:
        "Latest manual evidence is Quick Log diary evidence and cannot create persisted alerts. Add a manual sensor reading to check alerts.",
      showAddManualSnapshot: true,
      kind: "context-only",
    };
  }
  const persistable = snap.source === "manual" || snap.source === "live";
  if (!persistable) {
    return {
      message:
        "Latest snapshot is context-only. Enter a fresh manual snapshot to create persisted alerts.",
      showAddManualSnapshot: true,
      kind: "context-only",
    };
  }
  const stale = isStale(snap.ts, args.now ?? Date.now());
  if (stale) {
    return {
      message: `Latest snapshot is outside the ${FRESHNESS_WINDOW_LABEL}. Enter a fresh manual snapshot to check alerts.`,
      showAddManualSnapshot: true,
      kind: "stale",
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Duplicate-prevention reassurance                                            */
/* -------------------------------------------------------------------------- */

export interface DuplicateReassuranceArgs {
  /** Must mirror the persistence gate. */
  canPersist: boolean;
  /** True when the relevant grow already has at least one open alert. */
  hasOpenAlerts: boolean;
  /** Optional stronger signal: an open alert is known to match the
   * current snapshot's source/metric/rule. */
  hasMatchingOpenAlert?: boolean;
}

/**
 * Reassurance copy explaining that the alert engine de-duplicates. Returns
 * null when the snapshot cannot persist or when no open alert exists for
 * safe inference. Never claims a duplicate was prevented unless an open
 * alert is known to exist.
 */
export function duplicateReassuranceCopy(args: DuplicateReassuranceArgs): string | null {
  if (!args.canPersist) return null;
  if (args.hasMatchingOpenAlert) {
    return "Alert already exists for this latest snapshot. No duplicate was created.";
  }
  if (args.hasOpenAlerts) {
    return "Matching open alert already exists. Verdant will not create a duplicate for this condition.";
  }
  return null;
}
