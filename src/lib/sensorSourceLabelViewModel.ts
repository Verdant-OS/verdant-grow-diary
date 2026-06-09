/**
 * sensorSourceLabelViewModel — pure presentation layer that unifies the
 * source/state of a sensor reading into a single badge model.
 *
 * Goals:
 *   - One place to compute the user-facing label (e.g. "Manual reading",
 *     "Live", "Demo", "Stale", "Invalid", "EcoWitt").
 *   - One place to compute the visual tone so demo/stale/invalid never
 *     visually resemble healthy live data.
 *   - Manual readings are never rendered as "Live" — even when a manual
 *     device note ("EcoWitt WH45 ...") is attached.
 *
 * Hard constraints:
 *   - Pure. No I/O. No React. No timers.
 *   - Does not change the underlying source enum.
 *   - Unknown sources resolve to a neutral "Unknown" badge — never
 *     "Live" / "Healthy".
 */
import {
  resolveSensorSourceLabel,
  type SensorVendor,
} from "./sensorSourceLabelRules";
import {
  extractManualDeviceNote,
  normalizeManualSourceNote,
  MANUAL_READING_LABEL,
} from "./manualSensorSourceLabel";
import {
  buildSensorTruthCopyGuard,
  type SensorTruthCopyGuard,
} from "@/lib/sensorTruthCopyGuardRules";
import type { SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";
import type { SensorReadingSource } from "@/mock";

export type SourceBadgeTone =
  | "live" // fresh, trusted upstream telemetry
  | "manual" // grower-entered
  | "csv" // historical import
  | "demo" // fixture-backed, never real
  | "stale" // was live, but past freshness window
  | "invalid" // unusable telemetry
  | "unknown";

export interface SensorSourceBadge {
  /** User-facing label. Never raw enum text. */
  label: string;
  /** Visual tone for styling. */
  tone: SourceBadgeTone;
  /** True when the reading must NOT be treated as healthy live data. */
  isDegraded: boolean;
  /** True for grower-entered readings. */
  isManual: boolean;
  /** Recognised hardware vendor, if any (presentation hint only). */
  vendor: SensorVendor | null;
  /** Optional grower-entered manual device note, sanitized. */
  manualDeviceNote: string | null;
  /** Stable a11y description for screen readers. */
  ariaLabel: string;
  /** Conservative presenter copy guard. Never promotes bad/unknown telemetry. */
  truthCopyGuard: SensorTruthCopyGuard;
}

export interface BuildSensorSourceBadgeInput {
  source: SensorReadingSource | null | undefined;
  /** Canonical snapshot status when the caller has it. Missing stays conservative. */
  status?: SnapshotStatus | null;
  /** Vendor lineage tag if known (e.g. raw_payload.metadata.vendor). */
  vendor?: string | null;
  /** Grower-entered manual device note (preferred). */
  manualDeviceNote?: string | null;
  /** Stored device_id; may carry a "manual:" prefixed note as fallback. */
  deviceId?: string | null;
}

const DEGRADED_TONES: ReadonlySet<SourceBadgeTone> = new Set([
  "demo",
  "stale",
  "invalid",
  "unknown",
]);

function toneFromSource(
  source: SensorReadingSource | null | undefined,
): SourceBadgeTone {
  switch (source) {
    case "live":
      return "live";
    case "manual":
      return "manual";
    case "csv":
      return "csv";
    case "demo":
      return "demo";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    default:
      return "unknown";
  }
}

/**
 * Build a unified badge view model for any sensor reading. Pure.
 *
 * Invariants enforced here:
 *   - source === "manual" always yields tone "manual" and a label that
 *     starts with "Manual reading", regardless of any vendor lineage tag
 *     or device note. Manual is never promoted to "Live".
 *   - Unknown sources collapse to tone "unknown" — never "live".
 *   - Demo / stale / invalid always carry `isDegraded: true`.
 */
export function buildSensorSourceBadge(
  input: BuildSensorSourceBadgeInput,
): SensorSourceBadge {
  const source = input.source ?? null;
  const tone = toneFromSource(source);
  const truthCopyGuard = buildSensorTruthCopyGuard({
    sourceTone: tone,
    status: input.status ?? null,
  });
  const resolved = resolveSensorSourceLabel({
    source,
    // Suppress vendor promotion for non-live readings so a "manual"
    // reading with a vendor hint never renders as "EcoWitt" (which
    // could be confused with live).
    vendor: source === "live" ? input.vendor ?? null : null,
  });

  const manualDeviceNote =
    source === "manual"
      ? normalizeManualSourceNote(input.manualDeviceNote ?? null) ??
        extractManualDeviceNote(input.deviceId ?? null)
      : null;

  // Presenter-only badge copy. Underlying enum and
  // `resolveSensorSourceLabel` are untouched so other surfaces
  // (dashboard, timeline, ingest) keep their short pill copy.
  let label: string;
  switch (tone) {
    case "manual":
      label = manualDeviceNote
        ? `${MANUAL_READING_LABEL} · ${manualDeviceNote}`
        : MANUAL_READING_LABEL;
      break;
    case "live":
      // Honour vendor promotion (e.g. "Ecowitt") when present;
      // otherwise render "Live sensor" — never bare "Live".
      label = resolved.vendorPromoted ? resolved.label : "Live sensor";
      break;
    case "csv":
      label = "CSV import";
      break;
    case "demo":
      label = "Demo data";
      break;
    case "stale":
      label = "Stale reading";
      break;
    case "invalid":
      label = "Invalid reading";
      break;
    case "unknown":
    default:
      label = "Unknown source";
      break;
  }

  // Plain, safe aria copy — never includes raw enum tags, alert ids,
  // grow ids, or back-pointer tokens. Manual still surfaces the
  // grower-entered device note when present.
  const ariaLabel =
    tone === "manual" && manualDeviceNote
      ? `Sensor source: Manual reading, ${manualDeviceNote}`
      : `Sensor source: ${label}`;

  return {
    label,
    tone,
    isDegraded: DEGRADED_TONES.has(tone) || truthCopyGuard.canDescribeAsHealthyLive === false,
    isManual: tone === "manual",
    vendor: resolved.vendor,
    manualDeviceNote,
    ariaLabel,
    truthCopyGuard,
  };
}

/**
 * Tailwind class helper for the badge tone. Kept here so components
 * never hand-pick colors for source badges and demo/stale/invalid stay
 * visually distinct from live.
 */
export function sourceBadgeToneClass(tone: SourceBadgeTone): string {
  switch (tone) {
    case "live":
      return "border-emerald-500 text-emerald-600 dark:text-emerald-300";
    case "manual":
      return "border-primary text-primary";
    case "csv":
      return "border-sky-500 text-sky-600 dark:text-sky-300";
    case "demo":
      return "border-amber-400 text-amber-600 dark:text-amber-300";
    case "stale":
      return "border-amber-500 text-amber-700 dark:text-amber-300";
    case "invalid":
      return "border-destructive text-destructive";
    case "unknown":
    default:
      return "border-muted-foreground text-muted-foreground";
  }
}
