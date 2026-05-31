/**
 * Grow Room Mode quick-action launcher — pure routing helper.
 *
 * Builds a deterministic list of mobile-first launcher entries that point
 * at existing routes (sensors, doctor, alerts, dashboard pending-outcome
 * flow) or dispatch the existing `verdant:open-quicklog` event. Never
 * produces a write payload, a device command, or an automation surface.
 *
 * NO REACT. NO I/O. NO SUPABASE.
 *
 *  - Routes are constructed via shared route builders so a scoped grow id
 *    is preserved when available.
 *  - Each entry declares either `href` (Link target) or `event` (dispatch
 *    handler kind) — never both.
 *  - "Record outcome" links to the Dashboard pending-outcome reviews flow,
 *    which is the existing surface for capturing action outcomes. When no
 *    such surface is available the entry is omitted (graceful fallback).
 *  - Copy is observational: no autopilot / control / guaranteed / fixed
 *    language.
 */
import {
  alertsPath,
  dashboardPath,
  sensorsPath,
} from "@/lib/routes";

export type GrowRoomLauncherKind =
  | "quicklog"
  | "manual_sensor_snapshot"
  | "ask_doctor"
  | "review_alerts"
  | "record_outcome";

export interface GrowRoomLauncherEntry {
  kind: GrowRoomLauncherKind;
  label: string;
  description: string;
  /** Defined when the entry navigates to an existing route. */
  href?: string;
  /** Defined when the entry dispatches a global event instead of navigating. */
  event?: "open-quicklog";
  /** Stable testId for render/assertion. */
  testId: string;
}

export interface GrowRoomLauncherInput {
  /** Scoped grow id from `?growId=`; null when no grow is in scope. */
  scopedGrowId: string | null;
  /**
   * When false, the Record-outcome entry is omitted. Pass false when the
   * Dashboard pending-outcome surface is not reachable for this user.
   * Defaults to true.
   */
  recordOutcomeAvailable?: boolean;
}

const LABELS: Record<
  GrowRoomLauncherKind,
  { label: string; description: string }
> = {
  quicklog: {
    label: "Quick Log",
    description: "Open the diary entry sheet to log an observation, watering, feeding, or photo.",
  },
  manual_sensor_snapshot: {
    label: "Manual sensor snapshot",
    description: "Open the sensors view to record a manual reading.",
  },
  ask_doctor: {
    label: "Ask Doctor",
    description: "Open the AI Doctor to review plant context.",
  },
  review_alerts: {
    label: "Review alerts",
    description: "Open the alerts list to review open items.",
  },
  record_outcome: {
    label: "Record outcome",
    description: "Open the Dashboard to record outcomes for completed actions.",
  },
};

/** Deterministic launcher list. Pure. No side effects. */
export function buildGrowRoomLauncherEntries(
  input: GrowRoomLauncherInput,
): GrowRoomLauncherEntry[] {
  const growId = input.scopedGrowId ?? null;
  const recordOutcomeAvailable = input.recordOutcomeAvailable ?? true;

  const entries: GrowRoomLauncherEntry[] = [
    {
      kind: "quicklog",
      ...LABELS.quicklog,
      event: "open-quicklog",
      testId: "grow-room-launcher-quicklog",
    },
    {
      kind: "manual_sensor_snapshot",
      ...LABELS.manual_sensor_snapshot,
      href: sensorsPath(growId),
      testId: "grow-room-launcher-manual-sensor-snapshot",
    },
    {
      kind: "ask_doctor",
      ...LABELS.ask_doctor,
      href: "/doctor",
      testId: "grow-room-launcher-ask-doctor",
    },
    {
      kind: "review_alerts",
      ...LABELS.review_alerts,
      href: alertsPath(growId),
      testId: "grow-room-launcher-review-alerts",
    },
  ];

  if (recordOutcomeAvailable) {
    entries.push({
      kind: "record_outcome",
      ...LABELS.record_outcome,
      href: dashboardPath(growId),
      testId: "grow-room-launcher-record-outcome",
    });
  }

  return entries;
}
