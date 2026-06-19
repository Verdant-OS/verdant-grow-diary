/**
 * aiDoctorPhase1TimelineDraft — pure draft builder.
 *
 * Builds a deterministic payload for the existing Quick Log v2 manual-save
 * RPC (`quicklog_save_manual`) so an AI Doctor Phase 1 result can be saved
 * as a read-only evidence/history item on the selected plant's timeline.
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no fetch, no RPC, no invoke.
 *  - Does NOT write anything. Just shapes data for the existing save hook.
 *  - Saved as `note` action (not water, not feeding) — never executes equipment.
 *  - Discriminator `details.kind === "ai_doctor_phase1_evidence"`.
 *  - No action_queue_suggestion is escalated to an Action Queue row here.
 *  - No raw payloads, secrets, tokens, env vars, or model prompts.
 *  - Reject missing selected plant or missing result.
 */

import type {
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

export const AI_DOCTOR_PHASE1_TIMELINE_SOURCE =
  "ai_doctor_phase1_evidence" as const;
export const AI_DOCTOR_PHASE1_TIMELINE_KIND =
  "ai_doctor_phase1_evidence" as const;
export const AI_DOCTOR_PHASE1_ENGINE_VERSION = "phase1" as const;
export const AI_DOCTOR_PHASE1_RECEIPT_VERSION = "v1" as const;
export const AI_DOCTOR_PHASE1_EVIDENCE_LABEL =
  "AI Doctor Phase 1 evidence" as const;
export const AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER =
  "Saved as evidence only. This is not an approved action and does not control equipment." as const;

export type AiDoctorPhase1TimelineBlockedReason =
  | "missing_plant_id"
  | "missing_grow_id"
  | "missing_result"
  | "missing_summary";

export interface AiDoctorPhase1TimelinePlantIdentity {
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
  plant_name?: string | null;
}

export interface AiDoctorPhase1TimelineDraftInput {
  identity: AiDoctorPhase1TimelinePlantIdentity;
  result: AiDoctorDiagnosisResult | null | undefined;
  /** Injected clock for determinism. Defaults to epoch when omitted. */
  now?: Date;
  /** Optional ISO timestamp override. */
  occurredAt?: string | null;
}

export interface AiDoctorPhase1TimelineRedactedResult {
  summary: string;
  likely_issue: string;
  confidence: string;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  risk_level: string;
  /** Always preview-only here. Never escalated. */
  action_queue_suggestion_status: "preview_only";
}

export interface AiDoctorPhase1TimelineDraftDetails {
  kind: typeof AI_DOCTOR_PHASE1_TIMELINE_KIND;
  source: typeof AI_DOCTOR_PHASE1_TIMELINE_SOURCE;
  label: typeof AI_DOCTOR_PHASE1_EVIDENCE_LABEL;
  disclaimer: typeof AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER;
  evidence_only: true;
  manual_save: true;
  preview_only: true;
  no_live_ai_model: true;
  no_action_queue_write: true;
  no_alert_write: true;
  no_device_control: true;
  engine_version: typeof AI_DOCTOR_PHASE1_ENGINE_VERSION;
  receipt_version: typeof AI_DOCTOR_PHASE1_RECEIPT_VERSION;
  context_hash: string;
  idempotency_key: string;
  result: AiDoctorPhase1TimelineRedactedResult;
}

export interface AiDoctorPhase1TimelineDraftOk {
  ok: true;
  idempotency_key: string;
  payload: QuickLogV2SavePayload;
  details: AiDoctorPhase1TimelineDraftDetails;
}

export interface AiDoctorPhase1TimelineDraftBlocked {
  ok: false;
  reasons: readonly AiDoctorPhase1TimelineBlockedReason[];
}

export type AiDoctorPhase1TimelineDraftResult =
  | AiDoctorPhase1TimelineDraftOk
  | AiDoctorPhase1TimelineDraftBlocked;

function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const k of Object.keys(value as object)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deepFreeze((value as any)[k]);
    }
  }
  return value;
}

function computeContextHash(
  identity: AiDoctorPhase1TimelinePlantIdentity,
  result: AiDoctorDiagnosisResult,
): string {
  const stable = {
    e: AI_DOCTOR_PHASE1_ENGINE_VERSION,
    p: identity.plant_id ?? "",
    t: identity.tent_id ?? "",
    g: identity.grow_id ?? "",
    s: result.summary,
    li: result.likely_issue,
    cf: result.confidence,
    rl: result.risk_level,
    ev: [...result.evidence],
    mi: [...result.missing_information],
    pc: [...result.possible_causes],
    ia: result.immediate_action,
    wn: [...result.what_not_to_do],
    f24: result.follow_up_24h,
    r3: result.recovery_plan_3_day,
  };
  return stableHash(JSON.stringify(stable));
}

function buildNote(
  identity: AiDoctorPhase1TimelinePlantIdentity,
  result: AiDoctorDiagnosisResult,
): string {
  const who = identity.plant_name ? ` for ${identity.plant_name}` : "";
  const lines = [
    `${AI_DOCTOR_PHASE1_EVIDENCE_LABEL}${who}.`,
    `Summary: ${result.summary}`,
    `Likely issue: ${result.likely_issue}`,
    `Confidence: ${result.confidence}`,
    `Risk: ${result.risk_level}`,
    AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
  ];
  return lines.join("\n");
}

export function buildAiDoctorPhase1TimelineDraft(
  input: AiDoctorPhase1TimelineDraftInput,
): AiDoctorPhase1TimelineDraftResult {
  const reasons: AiDoctorPhase1TimelineBlockedReason[] = [];
  const { identity, result } = input;
  if (!identity?.plant_id) reasons.push("missing_plant_id");
  if (!identity?.grow_id) reasons.push("missing_grow_id");
  if (!result) reasons.push("missing_result");
  else if (!result.summary || result.summary.trim() === "")
    reasons.push("missing_summary");

  if (reasons.length > 0 || !result) {
    return deepFreeze({
      ok: false,
      reasons: Object.freeze([...reasons]),
    } satisfies AiDoctorPhase1TimelineDraftBlocked);
  }

  const now = input.now ?? new Date(0);
  const occurredAt = input.occurredAt ?? now.toISOString();

  const contextHash = computeContextHash(identity, result);
  const idempotencyKey = `ai_doctor_phase1_evidence:${identity.plant_id}:${AI_DOCTOR_PHASE1_ENGINE_VERSION}:${AI_DOCTOR_PHASE1_RECEIPT_VERSION}:${contextHash}`;

  const redacted: AiDoctorPhase1TimelineRedactedResult = {
    summary: result.summary,
    likely_issue: result.likely_issue,
    confidence: result.confidence,
    evidence: [...result.evidence],
    missing_information: [...result.missing_information],
    possible_causes: [...result.possible_causes],
    immediate_action: result.immediate_action,
    what_not_to_do: [...result.what_not_to_do],
    follow_up_24h: result.follow_up_24h,
    recovery_plan_3_day: result.recovery_plan_3_day,
    risk_level: result.risk_level,
    action_queue_suggestion_status: "preview_only",
  };

  const details: AiDoctorPhase1TimelineDraftDetails = {
    kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
    source: AI_DOCTOR_PHASE1_TIMELINE_SOURCE,
    label: AI_DOCTOR_PHASE1_EVIDENCE_LABEL,
    disclaimer: AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
    evidence_only: true,
    manual_save: true,
    preview_only: true,
    no_live_ai_model: true,
    no_action_queue_write: true,
    no_alert_write: true,
    no_device_control: true,
    engine_version: AI_DOCTOR_PHASE1_ENGINE_VERSION,
    receipt_version: AI_DOCTOR_PHASE1_RECEIPT_VERSION,
    context_hash: contextHash,
    idempotency_key: idempotencyKey,
    result: redacted,
  };

  const payload: QuickLogV2SavePayload = {
    p_target_type: "plant",
    p_target_id: identity.plant_id as string,
    p_action: "note",
    p_volume_ml: null,
    p_note: buildNote(identity, result),
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: occurredAt,
    p_details: details as unknown as Record<string, unknown>,
  };

  return deepFreeze({
    ok: true,
    idempotency_key: idempotencyKey,
    payload,
    details,
  } satisfies AiDoctorPhase1TimelineDraftOk);
}

export function isOkPhase1TimelineDraft(
  r: AiDoctorPhase1TimelineDraftResult,
): r is AiDoctorPhase1TimelineDraftOk {
  return r.ok === true;
}
