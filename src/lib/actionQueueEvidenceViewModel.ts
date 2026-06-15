/**
 * actionQueueEvidenceViewModel — single source of truth for Action Queue
 * evidence provenance copy surfaced on rows and on the Action Detail
 * origin panels.
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no I/O, no model calls.
 *  - Never reads or returns raw payloads, vendor metadata, service_role,
 *    Bearer tokens, API keys, filenames, or private/internal IDs.
 *  - Never claims current-room support. Action Queue evidence is always
 *    captured-moment / historical from the grower review surface.
 *  - Unknown origin → calm "Review evidence" fallback.
 *  - Unknown alert type → calm "Environment alert" fallback.
 *  - Missing sanitized snapshot metrics → neutral unavailable copy only.
 *    Quality is never inferred from free-text fields.
 *
 * Wires into:
 *   - src/pages/ActionQueue.tsx     (row chip)
 *   - src/pages/ActionDetail.tsx    (origin panels: alert + AI Doctor)
 */

import {
  getActionQueueSourceKind,
  type ActionQueueSource,
} from "@/lib/actionQueueProvenanceRules";
import {
  ENVIRONMENT_ALERT_FALLBACK_LABEL,
  formatEnvironmentAlertLabel,
} from "@/lib/environmentAlertLabelRules";
import {
  evaluateManualSensorSnapshotQuality,
  type ManualSensorSnapshotInput,
  type ManualSensorSnapshotQuality,
} from "@/lib/manualSensorSnapshotQualityRules";

/**
 * Re-export under the requested `classify*` name so callers can read the
 * intent at the call-site. Identical signature/behavior to the underlying
 * `evaluateManualSensorSnapshotQuality` helper.
 */
export const classifyManualSensorSnapshotQuality =
  evaluateManualSensorSnapshotQuality;

export const ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL =
  "Evidence quality: not available from this action record";
export const ACTION_EVIDENCE_QUALITY_UNAVAILABLE_SUMMARY =
  "No sanitized sensor snapshot is attached to this action record.";
export const ACTION_EVIDENCE_REVIEW_ONLY_LABEL =
  "Status: Grower review required";
export const ACTION_EVIDENCE_NO_AUTOMATION_NOTE =
  "Verdant will not send equipment commands automatically.";
export const ACTION_EVIDENCE_HISTORICAL_NOTE =
  "Captured-moment evidence only — not current-room guidance.";
export const ACTION_EVIDENCE_ORIGIN_FALLBACK = "Review evidence";

const SOURCE_LABEL: Readonly<Record<ActionQueueSource, string>> = {
  environment_alert: "Environment Alert",
  ai_coach: "AI Coach",
  ai_doctor: "AI Doctor",
  manual: "Manual",
  unknown: "Unknown",
};

/**
 * Narrow sanitized projection of an Action Queue row/detail accepted by
 * the view-model helper. Only fields that are safe to read in a
 * presenter-level surface — no `raw_payload`, no `target_device` ids, no
 * back-pointer tokens.
 */
export interface ActionEvidenceInput {
  readonly source?: string | null;
  readonly action_type?: string | null;
  /** Optional grow-room alert type slug for environment-alert sourced rows. */
  readonly alert_type?: string | null;
  /** Optional ISO timestamp string for when the evidence was captured. */
  readonly captured_at?: string | number | Date | null;
  /**
   * Optional fully sanitized snapshot projection. Only the well-known
   * numeric metric fields + captured_at + source. Never raw payloads.
   */
  readonly snapshot?: ManualSensorSnapshotInput | null;
}

export interface ActionEvidenceViewModel {
  readonly originLabel: string;
  readonly originKind: ActionQueueSource;
  readonly sourceLabel: string;
  readonly capturedAtLabel: string;
  readonly evidenceQualityLabel: string;
  readonly evidenceQualitySummary: string;
  readonly reviewOnlyLabel: string;
  readonly safetyNotes: ReadonlyArray<string>;
  readonly hasSnapshotQuality: boolean;
  readonly snapshotQuality: ManualSensorSnapshotQuality | null;
}

function formatCapturedAtLabel(
  v: ActionEvidenceInput["captured_at"],
): string {
  if (v == null || v === "") return "Captured: not recorded";
  let ms: number;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === "number") ms = v;
  else ms = Date.parse(String(v));
  if (!Number.isFinite(ms)) return "Captured: not recorded";
  // Deterministic ISO display — never includes filenames, IDs, or vendor metadata.
  return `Captured: ${new Date(ms).toISOString()}`;
}

function buildOriginLabel(
  kind: ActionQueueSource,
  alertType: string | null | undefined,
): string {
  switch (kind) {
    case "environment_alert":
      // Always go through the safe label formatter; unknown alert type
      // collapses to the calm "Environment alert" fallback.
      return formatEnvironmentAlertLabel(alertType ?? null);
    case "ai_doctor":
      return "AI Doctor review";
    case "ai_coach":
      return "AI Coach suggestion";
    case "manual":
      return "Manual entry";
    case "unknown":
    default:
      return ACTION_EVIDENCE_ORIGIN_FALLBACK;
  }
}

/**
 * Build the centralized Action Queue evidence view-model.
 *
 * Pure / deterministic / null-safe. Safe to call from rows, detail
 * panels, and aria-label builders. Same input → same output.
 */
export function buildActionEvidenceViewModel(
  input: ActionEvidenceInput | null | undefined,
  options?: { readonly nowMs?: number },
): ActionEvidenceViewModel {
  const safe = input && typeof input === "object" ? input : {};
  const originKind = getActionQueueSourceKind({ source: safe.source ?? null });
  const originLabel = buildOriginLabel(originKind, safe.alert_type);
  const sourceLabel = SOURCE_LABEL[originKind];
  const capturedAtLabel = formatCapturedAtLabel(safe.captured_at ?? null);

  const safetyNotes: string[] = [
    ACTION_EVIDENCE_HISTORICAL_NOTE,
    ACTION_EVIDENCE_NO_AUTOMATION_NOTE,
  ];

  // Snapshot quality — only when sanitized metrics are explicitly attached.
  // We never infer quality from text fields. We always evaluate in
  // historical mode so the result can never claim current-room support.
  let snapshotQuality: ManualSensorSnapshotQuality | null = null;
  if (safe.snapshot && typeof safe.snapshot === "object") {
    snapshotQuality = classifyManualSensorSnapshotQuality(safe.snapshot, {
      mode: "historical",
      nowMs: options?.nowMs,
    });
  }

  const hasSnapshotQuality = snapshotQuality !== null;
  const evidenceQualityLabel = hasSnapshotQuality
    ? `Evidence quality: ${snapshotQuality!.summary}`
    : ACTION_EVIDENCE_QUALITY_UNAVAILABLE_LABEL;
  const evidenceQualitySummary = hasSnapshotQuality
    ? snapshotQuality!.summary
    : ACTION_EVIDENCE_QUALITY_UNAVAILABLE_SUMMARY;

  return Object.freeze({
    originLabel,
    originKind,
    sourceLabel,
    capturedAtLabel,
    evidenceQualityLabel,
    evidenceQualitySummary,
    reviewOnlyLabel: ACTION_EVIDENCE_REVIEW_ONLY_LABEL,
    safetyNotes: Object.freeze([...safetyNotes]),
    hasSnapshotQuality,
    snapshotQuality,
  });
}

export { ENVIRONMENT_ALERT_FALLBACK_LABEL };
