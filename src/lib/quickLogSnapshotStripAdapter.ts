/**
 * quickLogSnapshotStripAdapter — pure adapter that converts a
 * `SensorSnapshot` (from `useLatestSensorSnapshot`) into a presenter
 * view-model for the Quick Log pre-save sensor snapshot strip.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase, no Date.now() unless caller omits `now`.
 *  - Classification is delegated to `sensorSnapshotStatusContract`
 *    (`classifyAuditRow`). No status math lives here or in JSX.
 *  - This slice only ever surfaces four states: usable | stale | invalid
 *    | no_data. `needs_review` cannot be produced because the adapter
 *    always synthesizes a 1/1 audit row; if the contract ever returns
 *    it for some future input shape, we defensively collapse to invalid
 *    so the UI never shows an unsupported variant.
 */
import {
  classifyAuditRow,
  type Classification,
  type SnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import { deriveProviderLabel } from "@/constants/sensorProviderLabels";
import {
  classifySnapshotTrustBadge,
  type SnapshotTrustBadgeView,
} from "@/lib/sensorSnapshotTrustBadgeRules";
import {
  formatTemperatureDisplay,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

export type QuickLogSnapshotStripStatus = "usable" | "stale" | "invalid" | "no_data";

export type QuickLogSnapshotStripAction =
  | { kind: "none" }
  | { kind: "refresh"; label: string; href: string }
  | { kind: "review"; label: string; href: string }
  | { kind: "add"; label: string; href: string }
  | { kind: "edit"; label: string; href: string };

export interface QuickLogSnapshotStripViewModel {
  status: QuickLogSnapshotStripStatus;
  /** Compact title shown next to the status pill. */
  title: string;
  /** One-sentence trust copy. */
  description: string;
  /** Captured timestamp (ISO) or null when no snapshot is available. */
  capturedAt: string | null;
  /**
   * Absolute, deterministic captured-at label ("Jul 7, 2026, 7:14 PM UTC")
   * or null when there is no snapshot. Presented alongside the relative
   * age so growers can always see the exact moment captured. Never
   * relabels manual data as live.
   */
  capturedAtLabel: string | null;
  /** Human-friendly age string ("5 min ago", "2 days ago"), or null. */
  ageLabel: string | null;
  /** Selected metric chips, presenter-safe. Empty when unknown. */
  metrics: ReadonlyArray<{ label: string; value: string }>;
  /** Safe navigation-only next action, never an automation. */
  action: QuickLogSnapshotStripAction;
  /** Underlying contract classification (for tests / observability). */
  classification: Classification;
  /**
   * Optional non-Live provider/source label (e.g. "ecowitt",
   * "home_assistant"). Null when no source exists or when source is
   * "live" — Live is communicated by the resolver-driven badge, never
   * by this chip. Pure presentation; never widens trust.
   */
  providerLabel: string | null;
  /**
   * Trust badge view (Live/Stale/Invalid/Manual/Demo/CSV) derived from
   * `sensorSnapshotTrustBadgeRules`. Provider/vendor identity is rendered
   * separately and never substituted for trust. Stale/invalid/unknown
   * snapshots are never attachable as Live context.
   */
  trustBadge: SnapshotTrustBadgeView;
}

const TITLES: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "Sensor context ready",
  stale: "Sensor snapshot stale",
  invalid: "Sensor snapshot not trusted",
  no_data: "No sensor snapshot attached",
};

const DESCRIPTIONS: Record<QuickLogSnapshotStripStatus, string> = {
  usable: "This log will include current sensor context.",
  stale: "Refresh before saving for better AI Doctor context.",
  invalid: "This reading will not be treated as reliable context.",
  no_data: "Add a snapshot so this log has room context.",
};

/** Demo-usable strip title — never claims live/current sensor context. */
export const DEMO_USABLE_TITLE = "Demo sensor context";
/** Demo-usable strip description — labeled demo, never treated as live. */
export const DEMO_USABLE_DESCRIPTION =
  "Sample data will be labeled demo — never treated as live sensor context.";

const SENSORS_HREF = "/sensors";
/**
 * Deep-link fragment for the Manual Sensor Reading anchor inside
 * `/sensors` (see `<section id="manual-reading">` in `src/pages/Sensors.tsx`).
 * Used by the "Add snapshot" CTA so growers who have no snapshot yet
 * can enter a manual reading in one tap without hunting for the form.
 * The manual entry surface labels the reading `source: manual` — this
 * link never claims to add live data.
 */
export const MANUAL_SNAPSHOT_ENTRY_HREF = "/sensors#manual-reading";

/**
 * Edit action shown only when the current snapshot's source is `manual`.
 * Never surfaced for `live`, `sim`, `demo`, `csv`, `stale`, or unknown —
 * editing must never be used to overwrite live-ingest telemetry.
 */
export const MANUAL_SNAPSHOT_EDIT_ACTION: QuickLogSnapshotStripAction = {
  kind: "edit",
  label: "Edit manual readings",
  href: MANUAL_SNAPSHOT_ENTRY_HREF,
};

function actionFor(status: QuickLogSnapshotStripStatus): QuickLogSnapshotStripAction {
  switch (status) {
    case "usable":
      return { kind: "none" };
    case "stale":
      return { kind: "refresh", label: "Refresh snapshot", href: SENSORS_HREF };
    case "invalid":
      return { kind: "review", label: "Review sensor intake", href: SENSORS_HREF };
    case "no_data":
      return { kind: "add", label: "Add snapshot", href: MANUAL_SNAPSHOT_ENTRY_HREF };
  }
}

/**
 * Deterministic absolute-time formatter for the "Captured: …" line.
 * Uses UTC + a fixed format so unit tests are stable across machines.
 * Example: "Jul 7, 2026, 7:14 PM UTC".
 */
export function formatCapturedAtAbsolute(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mo = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const yr = d.getUTCFullYear();
  let h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${mo} ${day}, ${yr}, ${h}:${m} ${ampm} UTC`;
}

function formatAge(capturedMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - capturedMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "1 day ago" : `${day} days ago`;
}

function buildMetrics(
  snapshot: SensorSnapshot,
  temperatureUnit: TemperatureUnitPreference,
): ReadonlyArray<{ label: string; value: string }> {
  const out: { label: string; value: string }[] = [];
  if (snapshot.temp !== null) {
    out.push({
      label: "Temp",
      value: formatTemperatureDisplay(snapshot.temp, {
        valueUnit: "C",
        unit: temperatureUnit,
        digits: 1,
      }),
    });
  }
  if (snapshot.rh !== null) out.push({ label: "RH", value: `${snapshot.rh.toFixed(0)}%` });
  if (snapshot.vpd !== null) out.push({ label: "VPD", value: `${snapshot.vpd.toFixed(2)} kPa` });
  return out;
}

/**
 * Narrow the contract status to the four states the Quick Log strip
 * supports. `needs_review` (theoretically reachable via future inputs)
 * collapses to `invalid` so the UI never silently treats unsupported
 * variants as healthy.
 */
function narrowStatus(s: SnapshotStatus): QuickLogSnapshotStripStatus {
  if (s === "usable" || s === "stale" || s === "invalid" || s === "no_data") return s;
  return "invalid";
}

export interface BuildQuickLogStripArgs {
  snapshot: SensorSnapshot | null | undefined;
  /** True when the loader is still resolving — treated as no_data UX-wise. */
  loading?: boolean;
  /** Selected plant has a tent assignment. False ⇒ no_data. */
  hasTent?: boolean;
  /**
   * Whether the grower currently has "Attach sensor snapshot" toggled on.
   * Defaults to true to preserve existing presenter callers (tests).
   * When false AND status would be `usable`, copy reflects "available but
   * not attached" so the strip never falsely claims the log will include
   * sensor context.
   */
  attached?: boolean;
  now?: Date;
  /**
   * Active temperature display unit. REQUIRED — this adapter is pure
   * (no I/O, never reads the live preference itself), so a caller that
   * omits this can only ever get a silently-wrong-unit reading. This is
   * exactly the bug class Codex flagged repeatedly across Quick Log:
   * making the field compulsory means tsc catches a forgotten unit at
   * every call site instead of it shipping as a hardcoded °C.
   */
  temperatureUnit: TemperatureUnitPreference;
}

export function buildQuickLogSnapshotStrip(
  args: BuildQuickLogStripArgs,
): QuickLogSnapshotStripViewModel {
  const {
    snapshot,
    loading = false,
    hasTent = true,
    attached = true,
    now = new Date(),
    temperatureUnit,
  } = args;

  // No tent selected or loader still in flight or empty snapshot ⇒ no_data.
  const isEmpty =
    !snapshot || !hasTent || loading || snapshot.source === "unavailable" || !snapshot.ts;

  if (isEmpty) {
    const classification = classifyAuditRow(null, { now });
    return {
      status: "no_data",
      title: TITLES.no_data,
      description: DESCRIPTIONS.no_data,
      capturedAt: null,
      capturedAtLabel: null,
      ageLabel: null,
      metrics: [],
      action: actionFor("no_data"),
      classification,
      providerLabel: null,
      trustBadge: classifySnapshotTrustBadge({ empty: true, source: snapshot?.source ?? null }),
    };
  }

  // Sim/demo sources are never trusted as live context.
  const src = (snapshot.source as string) ?? null;
  const validity =
    src === "sim" ? { isValid: false as const, reason: "malformed_reading" as const } : undefined;

  const classification = classifyAuditRow(
    {
      rowsReceived: 1,
      rowsAccepted: 1,
      capturedAt: snapshot.ts,
      source: src,
    },
    { now, validity },
  );

  const status = narrowStatus(classification.status);
  // `isEmpty` above already rejected a missing `ts`; re-read it as non-null.
  const capturedAtIso = snapshot.ts ?? "";
  const capturedMs = new Date(capturedAtIso).getTime();
  const ageLabel = Number.isFinite(capturedMs) ? formatAge(capturedMs, now.getTime()) : null;

  // Resolve title/description/action with the attach-toggle override:
  // when a snapshot is technically usable but the grower has toggled
  // "Attach sensor snapshot" OFF, the strip must not claim the log
  // will include sensor context.
  const usableButDetached = status === "usable" && !attached;
  const title = usableButDetached ? "Sensor snapshot available" : TITLES[status];
  const description = usableButDetached
    ? "Toggle “Attach sensor snapshot” to include it in this log."
    : DESCRIPTIONS[status];
  const baseAction = usableButDetached ? actionFor("no_data" as const) : actionFor(status);
  // When the resolved snapshot is a MANUAL reading and the strip is not
  // in a detached-toggle state, prefer the edit action so growers can
  // correct/update the manual reading directly. Never applied for live,
  // sim, demo, csv, or unknown sources.
  const finalAction: QuickLogSnapshotStripAction = usableButDetached
    ? { kind: "none" }
    : src === "manual" && (status === "usable" || status === "stale")
      ? MANUAL_SNAPSHOT_EDIT_ACTION
      : baseAction;

  return {
    status,
    title,
    description,
    capturedAt: snapshot.ts,
    capturedAtLabel: formatCapturedAtAbsolute(snapshot.ts),
    ageLabel,
    metrics: buildMetrics(snapshot, temperatureUnit),
    action: finalAction,
    classification,
    providerLabel: deriveProviderLabel(src),
    trustBadge: classifySnapshotTrustBadge({
      resolverStatus:
        status === "usable"
          ? src === "live"
            ? "fresh_live"
            : "fresh_non_live"
          : status === "stale"
            ? "stale"
            : status === "invalid"
              ? "invalid"
              : "empty",
      source: src,
    }),
  };
}

// ---------------------------------------------------------------------------
// New tent-scoped adapter — consumes the strict-resolver SensorSnapshot
// produced by `useLatestTentSensorSnapshot` (src/lib/sensor.ts) and emits
// the same presenter view-model the strip already renders. Classification
// is delegated to the strict resolver: NO 30-min stale heuristic, NO
// rewrite of source labels, NO fake-live promotion.
// ---------------------------------------------------------------------------
import type {
  SensorSnapshot as StrictSensorSnapshot,
  SensorSnapshotStatus as StrictSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import type { LatestTentSensorSnapshotStatus } from "@/lib/sensor";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";

export interface BuildQuickLogStripFromTentStateArgs {
  status: LatestTentSensorSnapshotStatus;
  snapshot: StrictSensorSnapshot;
  hasTent: boolean;
  attached?: boolean;
  now?: Date;
  /**
   * Active temperature display unit. REQUIRED — this adapter is pure
   * (no I/O, never reads the live preference itself), so a caller that
   * omits this can only ever get a silently-wrong-unit reading. This is
   * exactly the bug class Codex flagged repeatedly across Quick Log:
   * making the field compulsory means tsc catches a forgotten unit at
   * every call site instead of it shipping as a hardcoded °C.
   */
  temperatureUnit: TemperatureUnitPreference;
}

function narrowStrict(s: StrictSnapshotStatus): QuickLogSnapshotStripStatus {
  switch (s) {
    case "fresh_live":
    case "fresh_non_live":
      return "usable";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    case "empty":
    default:
      return "no_data";
  }
}

function synthClassification(status: QuickLogSnapshotStripStatus, label: string): Classification {
  const reason =
    status === "usable"
      ? "fresh_accepted"
      : status === "stale"
        ? "outside_stale_window"
        : status === "invalid"
          ? "malformed_reading"
          : "no_rows";
  return {
    status,
    reason,
    isHealthyEvidence: status === "usable",
    label,
  };
}

function buildStrictMetrics(
  snap: StrictSensorSnapshot,
  temperatureUnit: TemperatureUnitPreference,
): ReadonlyArray<{ label: string; value: string }> {
  const out: { label: string; value: string }[] = [];
  const tempF = snap.metrics.temp_f;
  if (typeof tempF === "number" && Number.isFinite(tempF)) {
    out.push({
      label: "Temp",
      value: formatTemperatureDisplay(tempF, {
        valueUnit: "F",
        unit: temperatureUnit,
        digits: 1,
      }),
    });
  }
  const rh = snap.metrics.humidity_pct;
  if (typeof rh === "number" && Number.isFinite(rh)) {
    out.push({ label: "RH", value: `${rh.toFixed(0)}%` });
  }
  const vpd = snap.metrics.vpd_kpa;
  if (typeof vpd === "number" && Number.isFinite(vpd)) {
    out.push({ label: "VPD", value: `${vpd.toFixed(2)} kPa` });
  }
  return out;
}

/**
 * Source label to PERSIST in `details.sensor.source` for an attached snapshot.
 *
 * Raised by Codex (P1) and Copilot on #1170: the strip gates attachability on
 * `normalizeSensorSource()`, but `buildSensorSnapshotDetails` persists
 * `snapshot.source` VERBATIM. So a `fresh_non_live` row sourced
 * `manual_snapshot` / `import` / `user` / `entry` / `log` / `diary` was
 * attachable yet persisted a label outside the six-label contract, which
 * `timelineEvidenceDetailViewModel.normalizeSource` renders as `unknown` — a
 * genuinely MANUAL reading displayed as unknown provenance.
 *
 * Deliberately narrow. Canonicalizing every source would be WORSE, not better,
 * because the raw label carries provider identity that the timeline displays
 * (`growDiaryTimelineRules.SOURCE_DISPLAY_LABELS`), and two of those canonicalize
 * to a falsehood:
 *
 *   pi_bridge       -> "Pi bridge"   canonical live     identity lost
 *   ecowitt         -> "EcoWitt"     canonical INVALID  a real reading marked invalid
 *   node_red_bridge -> "Node-RED"    canonical INVALID  same
 *
 * So this rewrites ONLY when the canonical form is `manual` or `csv` — the
 * aliases this PR made attachable, which carry no provider identity (they render
 * as sanitized echoes: "Manual_snapshot", "Import", "User"). Every other label,
 * including every provider, is persisted untouched. The pre-existing behaviour of
 * live aliases is out of scope and unchanged.
 */
export function persistedSensorSourceLabel(rawSource: unknown): unknown {
  if (typeof rawSource !== "string") return rawSource;
  const canonical = normalizeSensorSource(rawSource);
  if (canonical !== "manual" && canonical !== "csv") return rawSource;
  return canonical;
}

export function buildQuickLogStripFromTentState(
  args: BuildQuickLogStripFromTentStateArgs,
): QuickLogSnapshotStripViewModel {
  const {
    status: loaderStatus,
    snapshot,
    hasTent,
    attached = true,
    now = new Date(),
    temperatureUnit,
  } = args;

  // Treat idle/loading/empty/error/no-tent as no_data (UI parity with the
  // legacy dashboard-shape adapter). The strict resolver never invents
  // healthy data when the loader is not in `ready`.
  const isEmpty =
    !hasTent ||
    loaderStatus === "idle" ||
    loaderStatus === "loading" ||
    loaderStatus === "empty" ||
    loaderStatus === "error" ||
    snapshot.status === "empty" ||
    !snapshot.captured_at;

  if (isEmpty) {
    return {
      status: "no_data",
      title: TITLES.no_data,
      description: DESCRIPTIONS.no_data,
      capturedAt: null,
      capturedAtLabel: null,
      ageLabel: null,
      metrics: [],
      action: actionFor("no_data"),
      classification: synthClassification("no_data", "No sensor data yet"),
      providerLabel: null,
      trustBadge: classifySnapshotTrustBadge({ empty: true, source: snapshot.source ?? null }),
    };
  }

  // Leftover #1163 / #1003 strip coherence: `fresh_non_live` and `stale`
  // prove freshness/age, not trust. Derive pill status and trust-badge
  // resolver status from the same `normalizeSensorSource` verdict so
  // pill, badge, and advisory agree. Legacy receiving-transport labels
  // (`ecowitt`/`mqtt`/…) and missing labels demote to invalid; reviewed
  // live aliases (`pi_bridge`) stay coherent Live; demo/stale never
  // healthy. `fresh_live` is untouched: the strict resolver only emits
  // it for canonical live rows. Call normalizeSensorSource — never edit it.
  const canonicalSource = normalizeSensorSource(snapshot.source);
  const isNonLiveTelemetry = snapshot.status === "fresh_non_live" || snapshot.status === "stale";

  let status: QuickLogSnapshotStripStatus;
  let badgeResolverStatus: StrictSnapshotStatus;
  if (isNonLiveTelemetry) {
    if (canonicalSource === "invalid") {
      status = "invalid";
      badgeResolverStatus = "invalid";
    } else if (snapshot.status === "stale" || canonicalSource === "stale") {
      status = "stale";
      badgeResolverStatus = "stale";
    } else if (canonicalSource === "live") {
      status = "usable";
      badgeResolverStatus = "fresh_live";
    } else {
      status = "usable";
      badgeResolverStatus = "fresh_non_live";
    }
  } else {
    status = narrowStrict(snapshot.status);
    badgeResolverStatus = snapshot.status;
  }
  // `isEmpty` above already rejected a missing `captured_at`.
  const capturedAtIso = snapshot.captured_at ?? "";
  const capturedMs = Date.parse(capturedAtIso);
  const ageLabel = Number.isFinite(capturedMs) ? formatAge(capturedMs, now.getTime()) : null;

  const usableButDetached = status === "usable" && !attached;
  // Detached copy still wins over demo-usable copy.
  const demoUsable = !usableButDetached && status === "usable" && canonicalSource === "demo";
  const manualContext = snapshot.status === "fresh_non_live" && canonicalSource === "manual";
  const csvContext = snapshot.status === "fresh_non_live" && canonicalSource === "csv";
  const usableDescription = manualContext
    ? "This log will include grower-entered Manual context — not live telemetry."
    : csvContext
      ? "This log will include imported CSV history — not current conditions."
      : DESCRIPTIONS.usable;
  const title = usableButDetached
    ? "Sensor snapshot available"
    : demoUsable
      ? DEMO_USABLE_TITLE
      : TITLES[status];
  const description = usableButDetached
    ? "Toggle “Attach sensor snapshot” to include it in this log."
    : demoUsable
      ? DEMO_USABLE_DESCRIPTION
      : status === "usable"
        ? usableDescription
        : DESCRIPTIONS[status];
  const baseAction: QuickLogSnapshotStripAction = usableButDetached
    ? { kind: "none" }
    : actionFor(status);
  const action: QuickLogSnapshotStripAction =
    !usableButDetached &&
    snapshot.source === "manual" &&
    (status === "usable" || status === "stale")
      ? MANUAL_SNAPSHOT_EDIT_ACTION
      : baseAction;

  const classification = {
    ...synthClassification(status, snapshot.badge_label),
    ...(canonicalSource === "demo" ? { isHealthyEvidence: false as const } : {}),
  };

  // Live badge for reviewed aliases may stay for display coherence, but
  // remapping `badgeResolverStatus` to `fresh_live` must not grant a real
  // `fresh_non_live` row Live attachability. Preserve the canonical resolver's
  // attachable Manual/CSV verdicts, including its reviewed source aliases.
  const trustBadge = {
    ...classifySnapshotTrustBadge({
      resolverStatus: badgeResolverStatus,
      // Non-live rows pass the canonical source so badge mapping agrees
      // with the pill (raw transport labels never reach mapNonLiveSource).
      source: isNonLiveTelemetry ? canonicalSource : snapshot.source,
    }),
    // Provider identity always from the RAW label (e.g. pi_bridge → Pi Bridge).
    providerLabel: deriveProviderLabel(snapshot.source),
  };
  if (snapshot.status === "fresh_non_live" && badgeResolverStatus === "fresh_live") {
    trustBadge.attachable = false;
  }

  return {
    status,
    title,
    description,
    capturedAt: snapshot.captured_at,
    capturedAtLabel: formatCapturedAtAbsolute(snapshot.captured_at),
    ageLabel,
    metrics: buildStrictMetrics(snapshot, temperatureUnit),
    action,
    classification,
    providerLabel: deriveProviderLabel(snapshot.source),
    trustBadge,
  };
}
