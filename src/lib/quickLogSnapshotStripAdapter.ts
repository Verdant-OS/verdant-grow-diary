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

export type QuickLogSnapshotStripStatus =
  | "usable"
  | "stale"
  | "invalid"
  | "no_data";

export type QuickLogSnapshotStripAction =
  | { kind: "none" }
  | { kind: "refresh"; label: string; href: string }
  | { kind: "review"; label: string; href: string }
  | { kind: "add"; label: string; href: string };

export interface QuickLogSnapshotStripViewModel {
  status: QuickLogSnapshotStripStatus;
  /** Compact title shown next to the status pill. */
  title: string;
  /** One-sentence trust copy. */
  description: string;
  /** Captured timestamp (ISO) or null when no snapshot is available. */
  capturedAt: string | null;
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

const SENSORS_HREF = "/sensors";

function actionFor(status: QuickLogSnapshotStripStatus): QuickLogSnapshotStripAction {
  switch (status) {
    case "usable":
      return { kind: "none" };
    case "stale":
      return { kind: "refresh", label: "Refresh snapshot", href: SENSORS_HREF };
    case "invalid":
      return { kind: "review", label: "Review sensor intake", href: SENSORS_HREF };
    case "no_data":
      return { kind: "add", label: "Add snapshot", href: SENSORS_HREF };
  }
}

/**
 * Map of recognised, presenter-safe provider/source labels. Keys are
 * the lowercased source value with `-` normalised to `_`. Values are
 * the friendly display labels — never include the word "Live" and
 * never act as a Live promotion. The chip text itself is prefixed
 * with "source: " in the strip; aria-label uses "Sensor source: …".
 */
const PROVIDER_LABELS: Record<string, string> = {
  ecowitt: "EcoWitt",
  mqtt: "MQTT",
  home_assistant: "Home Assistant",
  pi_bridge: "Pi Bridge",
  raspberry_pi: "Raspberry Pi",
  spider_farmer: "Spider Farmer",
  spider_farmer_ggs: "Spider Farmer GGS",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
};

const PROVIDER_LABEL_MAX = 32;

function titleCase(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}


/**
 * Format a source/provider string into a short, presenter-safe display
 * label. Returns null when no chip should render (missing source, or
 * source is `live` / `unavailable` — Live is communicated by the
 * resolver-driven badge, never by this chip).
 *
 * Recognised vendors map to friendly capitalisation. Unknown values are
 * lowercased, `_`/`-` are replaced with spaces, words title-cased, and
 * the result is length-capped so secret-looking strings never leak as
 * a UI chip.
 */
export function deriveProviderLabel(
  source: string | null | undefined,
): string | null {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "live" || lower === "unavailable") return null;
  const key = lower.replace(/-/g, "_");
  if (PROVIDER_LABELS[key]) return PROVIDER_LABELS[key];
  const safe = lower
    .replace(/[^a-z0-9_\- ]+/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!safe) return null;
  const titled = safe
    .split(" ")
    .map(titleCase)
    .join(" ");
  return titled.length > PROVIDER_LABEL_MAX
    ? `${titled.slice(0, PROVIDER_LABEL_MAX - 1)}…`
    : titled;
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
): ReadonlyArray<{ label: string; value: string }> {
  const out: { label: string; value: string }[] = [];
  if (snapshot.temp !== null) out.push({ label: "Temp", value: `${snapshot.temp.toFixed(1)}°C` });
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
  } = args;

  // No tent selected or loader still in flight or empty snapshot ⇒ no_data.
  const isEmpty =
    !snapshot ||
    !hasTent ||
    loading ||
    snapshot.source === "unavailable" ||
    !snapshot.ts;

  if (isEmpty) {
    const classification = classifyAuditRow(null, { now });
    return {
      status: "no_data",
      title: TITLES.no_data,
      description: DESCRIPTIONS.no_data,
      capturedAt: null,
      ageLabel: null,
      metrics: [],
      action: actionFor("no_data"),
      classification,
      providerLabel: null,
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
  const capturedMs = new Date(snapshot.ts).getTime();
  const ageLabel = Number.isFinite(capturedMs)
    ? formatAge(capturedMs, now.getTime())
    : null;

  // Resolve title/description/action with the attach-toggle override:
  // when a snapshot is technically usable but the grower has toggled
  // "Attach sensor snapshot" OFF, the strip must not claim the log
  // will include sensor context.
  const usableButDetached = status === "usable" && !attached;
  const title = usableButDetached ? "Sensor snapshot available" : TITLES[status];
  const description = usableButDetached
    ? "Toggle “Attach sensor snapshot” to include it in this log."
    : DESCRIPTIONS[status];
  const action = usableButDetached ? actionFor("no_data" as const) : actionFor(status);
  // Detached usable still surfaces no nav button (toggle is the action).
  const finalAction: QuickLogSnapshotStripAction = usableButDetached
    ? { kind: "none" }
    : action;

  return {
    status,
    title,
    description,
    capturedAt: snapshot.ts,
    ageLabel,
    metrics: buildMetrics(snapshot),
    action: finalAction,
    classification,
    providerLabel: deriveProviderLabel(src),
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

export interface BuildQuickLogStripFromTentStateArgs {
  status: LatestTentSensorSnapshotStatus;
  snapshot: StrictSensorSnapshot;
  hasTent: boolean;
  attached?: boolean;
  now?: Date;
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

function synthClassification(
  status: QuickLogSnapshotStripStatus,
  label: string,
): Classification {
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

function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

function buildStrictMetrics(
  snap: StrictSensorSnapshot,
): ReadonlyArray<{ label: string; value: string }> {
  const out: { label: string; value: string }[] = [];
  const tempF = snap.metrics.temp_f;
  if (typeof tempF === "number" && Number.isFinite(tempF)) {
    out.push({ label: "Temp", value: `${fToC(tempF).toFixed(1)}°C` });
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

export function buildQuickLogStripFromTentState(
  args: BuildQuickLogStripFromTentStateArgs,
): QuickLogSnapshotStripViewModel {
  const { status: loaderStatus, snapshot, hasTent, attached = true, now = new Date() } = args;

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
      ageLabel: null,
      metrics: [],
      action: actionFor("no_data"),
      classification: synthClassification("no_data", "No sensor data yet"),
      providerLabel: null,
    };
  }

  const status = narrowStrict(snapshot.status);
  const capturedMs = Date.parse(snapshot.captured_at);
  const ageLabel = Number.isFinite(capturedMs)
    ? formatAge(capturedMs, now.getTime())
    : null;

  const usableButDetached = status === "usable" && !attached;
  const title = usableButDetached ? "Sensor snapshot available" : TITLES[status];
  const description = usableButDetached
    ? "Toggle “Attach sensor snapshot” to include it in this log."
    : DESCRIPTIONS[status];
  const action: QuickLogSnapshotStripAction = usableButDetached
    ? { kind: "none" }
    : actionFor(status);

  return {
    status,
    title,
    description,
    capturedAt: snapshot.captured_at,
    ageLabel,
    metrics: buildStrictMetrics(snapshot),
    action,
    classification: synthClassification(status, snapshot.badge_label),
    providerLabel: deriveProviderLabel(snapshot.source),
  };
}
