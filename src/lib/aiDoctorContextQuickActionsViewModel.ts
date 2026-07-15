/**
 * aiDoctorContextQuickActionsViewModel — pure mapping from
 * AI Doctor Context "missing" codes to safe quick-action descriptors.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - Never writes diary, sensor readings, action_queue, alerts, or sessions.
 *  - Returns descriptors only. Components decide how to render them.
 *  - Reuses existing app events / routes — no new modal systems.
 *  - Copy stays calm; no AI-confidence language.
 */
import { sensorsPath, plantDetailPath } from "@/lib/routes";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

export type AiDoctorContextQuickActionKind =
  | "update_plant_profile"
  | "add_recent_log"
  | "add_manual_sensor_snapshot"
  | "capture_new_snapshot"
  | "add_plant_photo";


export interface AiDoctorContextQuickActionLinkTarget {
  kind: "link";
  href: string;
}

export interface AiDoctorContextQuickActionEventTarget {
  kind: "event";
  eventName: typeof PLANT_QUICKLOG_PREFILL_EVENT;
  payload: AiDoctorContextQuickLogEventPayload | null;
}

export type AiDoctorContextQuickActionTarget =
  | AiDoctorContextQuickActionLinkTarget
  | AiDoctorContextQuickActionEventTarget;

export interface AiDoctorContextQuickLogEventPayload {
  plantId: string;
  plantName: string | null;
  growId: string | null;
  tentId: string | null;
  tentName: string | null;
  eventType: "observation" | "environment";
  suggestSnapshot: boolean;
}



export interface AiDoctorContextQuickAction {
  kind: AiDoctorContextQuickActionKind;
  label: string;
  /** Missing-context codes this action addresses (one or more). */
  satisfies: readonly string[];
  target: AiDoctorContextQuickActionTarget;
  /** True when required context (plantId/growId) is not yet available. */
  disabled: boolean;
  disabledReason?: string;
  testId: string;
}

export type AiDoctorSnapshotFreshnessTrigger = "fresh" | "stale" | "missing";

export interface BuildAiDoctorContextQuickActionsArgs {
  missing: readonly string[];
  plantId?: string | null;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  tentName?: string | null;
  /**
   * Freshness state of the latest manual sensor snapshot. When "stale"
   * or "missing", a "Capture new snapshot" quick action is appended
   * that opens the Environment Check Quick Log prefilled with plant
   * / tent identity context (no sensor values are pre-filled).
   */
  snapshotFreshnessState?: AiDoctorSnapshotFreshnessTrigger;
}

const QUICK_ACTION_LABELS: Record<AiDoctorContextQuickActionKind, string> = {
  update_plant_profile: "Edit plant details",
  add_recent_log: "Add note",
  add_manual_sensor_snapshot: "Add sensor snapshot",
  capture_new_snapshot: "Capture new snapshot",
  add_plant_photo: "Add photo",
};

/**
 * Map of missing codes → which quick action satisfies them.
 * Codes not listed here intentionally produce no quick action
 * (e.g. there is no "missing warning context" code — the panel
 * shows a passive note instead, never a misleading button).
 */
const MISSING_CODE_TO_ACTION: Record<string, AiDoctorContextQuickActionKind> = {
  "plant-profile": "update_plant_profile",
  strain: "update_plant_profile",
  stage: "update_plant_profile",
  medium: "update_plant_profile",
  "plant-photo": "add_plant_photo",
  "recent-timeline-activity": "add_recent_log",
  "recent-watering-or-feeding": "add_recent_log",
  "recent-manual-sensor-snapshot": "add_manual_sensor_snapshot",
};

/** Stable display order for the quick-action row. */
const ACTION_ORDER: AiDoctorContextQuickActionKind[] = [
  "update_plant_profile",
  "add_recent_log",
  "add_manual_sensor_snapshot",
  "capture_new_snapshot",
  "add_plant_photo",
];


function quickLogPayload(
  args: BuildAiDoctorContextQuickActionsArgs,
  eventType: "observation" | "environment" = "observation",
): AiDoctorContextQuickLogEventPayload | null {
  if (!args.plantId) return null;
  return {
    plantId: args.plantId,
    plantName: args.plantName ?? null,
    growId: args.growId ?? null,
    tentId: args.tentId ?? null,
    tentName: args.tentName ?? null,
    eventType,
    suggestSnapshot: true,
  };
}


function buildAction(
  kind: AiDoctorContextQuickActionKind,
  satisfies: readonly string[],
  args: BuildAiDoctorContextQuickActionsArgs,
): AiDoctorContextQuickAction {
  const testId = `ai-doctor-context-quick-action-${kind.replace(/_/g, "-")}`;
  switch (kind) {
    case "update_plant_profile": {
      const href = args.plantId ? plantDetailPath(args.plantId) : "/plants";
      return {
        kind,
        label: QUICK_ACTION_LABELS[kind],
        satisfies,
        target: { kind: "link", href },
        disabled: !args.plantId,
        disabledReason: args.plantId
          ? undefined
          : "Plant context is not loaded yet.",
        testId,
      };
    }
    case "add_recent_log":
    case "add_plant_photo": {
      const payload = quickLogPayload(args);
      return {
        kind,
        label: QUICK_ACTION_LABELS[kind],
        satisfies,
        target: {
          kind: "event",
          eventName: PLANT_QUICKLOG_PREFILL_EVENT,
          payload,
        },
        disabled: !args.plantId,
        disabledReason: args.plantId
          ? undefined
          : "Plant context is not loaded yet.",
        testId,
      };
    }
    case "add_manual_sensor_snapshot": {
      return {
        kind,
        label: QUICK_ACTION_LABELS[kind],
        satisfies,
        target: { kind: "link", href: sensorsPath(args.growId ?? null) },
        disabled: false,
        testId,
      };
    }
    case "capture_new_snapshot": {
      const payload = quickLogPayload(args, "environment");
      return {
        kind,
        label: QUICK_ACTION_LABELS[kind],
        satisfies,
        target: {
          kind: "event",
          eventName: PLANT_QUICKLOG_PREFILL_EVENT,
          payload,
        },
        disabled: !args.plantId,
        disabledReason: args.plantId
          ? undefined
          : "Plant context is not loaded yet.",
        testId,
      };
    }
  }
}


/**
 * Build the deterministic list of quick actions that address the given
 * missing-context codes. Each action appears at most once, in stable order.
 */
export function buildAiDoctorContextQuickActions(
  args: BuildAiDoctorContextQuickActionsArgs,
): AiDoctorContextQuickAction[] {
  const missing = Array.isArray(args.missing) ? args.missing : [];
  const bucket = new Map<AiDoctorContextQuickActionKind, string[]>();
  for (const code of missing) {
    const kind = MISSING_CODE_TO_ACTION[code];
    if (!kind) continue;
    const prev = bucket.get(kind) ?? [];
    if (!prev.includes(code)) prev.push(code);
    bucket.set(kind, prev);
  }
  // "Capture new snapshot" is triggered by freshness state (stale /
  // missing), independent of the 7-day missing-context code. Tagged
  // with a synthetic satisfies code so downstream tests/analytics can
  // distinguish it from the 7-day surface.
  if (
    args.snapshotFreshnessState === "stale" ||
    args.snapshotFreshnessState === "missing"
  ) {
    bucket.set("capture_new_snapshot", [
      `snapshot-freshness-${args.snapshotFreshnessState}`,
    ]);
  }
  const out: AiDoctorContextQuickAction[] = [];
  for (const kind of ACTION_ORDER) {
    const codes = bucket.get(kind);
    if (!codes || codes.length === 0) continue;
    out.push(buildAction(kind, codes, args));
  }
  return out;
}


/** Calm, non-actionable copy when no warning context exists. */
export const AI_DOCTOR_NO_WARNING_CONTEXT_COPY = "No warning context found.";
