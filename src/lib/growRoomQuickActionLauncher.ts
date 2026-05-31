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
 *    such surface is available the entry is rendered as disabled with a
 *    lightweight reason rather than silently omitted.
 *  - QuickLog dispatch carries an optional payload of already-known
 *    context (scoped grow id + scoped plant id). The helper never invents
 *    or looks up plant context — callers must pass what they already have.
 *  - Copy is observational and avoids control / certainty language.
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

/** Payload dispatched on the `verdant:open-quicklog` event. */
export interface GrowRoomQuickLogEventPayload {
  /** Already-known scoped grow id; null when no grow is in scope. */
  growId: string | null;
  /** Already-known scoped plant id; null when no plant is in scope. */
  plantId: string | null;
}

export interface GrowRoomLauncherEntry {
  kind: GrowRoomLauncherKind;
  label: string;
  description: string;
  /** Defined when the entry navigates to an existing route. */
  href?: string;
  /** Defined when the entry dispatches a global event instead of navigating. */
  event?: "open-quicklog";
  /**
   * Defined only for the `quicklog` event entry. The card forwards this
   * payload as the CustomEvent `detail`. May be `null` when no scoped
   * context is available — in that case the existing QuickLog modal opens
   * with no prefill, matching prior behavior.
   */
  eventPayload?: GrowRoomQuickLogEventPayload | null;
  /** Stable testId for render/assertion. */
  testId: string;
  /** True when required context is missing; the card renders a disabled button. */
  disabled?: boolean;
  /** Short observational reason shown alongside a disabled entry. */
  disabledReason?: string;
}

export interface GrowRoomLauncherInput {
  /** Scoped grow id from `?growId=`; null when no grow is in scope. */
  scopedGrowId: string | null;
  /**
   * Scoped plant id, if one is already known from existing route/context.
   * The helper does NOT look up plants — pass null when unknown.
   */
  scopedPlantId?: string | null;
  /**
   * When false, the Record-outcome entry is rendered as disabled with a
   * lightweight reason rather than removed. Defaults to true.
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
  const plantId = input.scopedPlantId ?? null;
  const recordOutcomeAvailable = input.recordOutcomeAvailable ?? true;

  const quickLogPayload: GrowRoomQuickLogEventPayload | null =
    growId || plantId ? { growId, plantId } : null;

  const entries: GrowRoomLauncherEntry[] = [
    {
      kind: "quicklog",
      ...LABELS.quicklog,
      event: "open-quicklog",
      eventPayload: quickLogPayload,
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
    {
      kind: "record_outcome",
      ...LABELS.record_outcome,
      href: recordOutcomeAvailable ? dashboardPath(growId) : undefined,
      testId: "grow-room-launcher-record-outcome",
      disabled: !recordOutcomeAvailable,
      disabledReason: recordOutcomeAvailable
        ? undefined
        : "No completed actions awaiting outcome capture yet.",
    },
  ];

  return entries;
}
