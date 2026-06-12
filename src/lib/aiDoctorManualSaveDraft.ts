/**
 * aiDoctorManualSaveDraft — pure draft builder.
 *
 * Produces the exact payload shape a future confirmed save would pass into
 * `useQuickLogV2Save` / `quicklog_save_manual`. THIS FILE NEVER WRITES.
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no fetch, no RPC, no invoke.
 *  - No diagnosis persistence, no alerts, no Action Queue mutations.
 *  - Deterministic for a given input.
 *  - No raw payloads, secrets, tokens, env vars, or model prompts in output.
 */

import type { AiDoctorCheckInPreviewView } from "./aiDoctorCheckInPreviewViewModel";

export const AI_DOCTOR_MANUAL_SAVE_SOURCE =
  "ai_doctor_check_in_manual_save" as const;
export const AI_DOCTOR_MANUAL_SAVE_KIND = "ai_doctor_check_in" as const;
export const AI_DOCTOR_ENGINE_VERSION_DEFAULT = "phase1" as const;
export const AI_DOCTOR_RECEIPT_VERSION_DEFAULT = "v1" as const;

export type AiDoctorManualSaveBlockedReason =
  | "missing_plant_id"
  | "missing_tent_id"
  | "missing_grow_id"
  | "missing_note"
  | "missing_summary";

export interface AiDoctorManualSavePlantIdentity {
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
  plant_name?: string | null;
  stage?: string | null;
}

export interface AiDoctorManualSaveDraftInput {
  view: AiDoctorCheckInPreviewView;
  identity: AiDoctorManualSavePlantIdentity;
  receiptText: string;
  /** Optional ISO timestamp for occurred_at — defaults to now() injected via clock. */
  occurredAt?: string | null;
  /** Injected clock for determinism. */
  now?: Date;
  engineVersion?: string;
  receiptVersion?: string;
  /** Optional caller-provided non-secret provenance bag (already redacted). */
  contextProvenance?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AiDoctorRedactedEngineOutput {
  summary: string;
  likely_issue: string;
  confidence: number;
  evidence: readonly string[];
  missing_information: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  risk_level: string;
  action_queue_suggestion_status: "pending_approval" | null;
}

export interface AiDoctorManualSaveDraftDetails {
  kind: typeof AI_DOCTOR_MANUAL_SAVE_KIND;
  preview_only: true;
  manual_save: true;
  deterministic_engine: true;
  no_live_ai_model: true;
  engine_version: string;
  receipt_version: string;
  context_hash: string;
  context_provenance: Readonly<Record<string, string | number | boolean | null>>;
  limitations: ReadonlyArray<{ code: string; message: string }>;
  engine_output: AiDoctorRedactedEngineOutput;
}

export interface AiDoctorManualSaveDraftOk {
  ok: true;
  draft: {
    event_type: "observation";
    source: typeof AI_DOCTOR_MANUAL_SAVE_SOURCE;
    note: string;
    plant_id: string;
    tent_id: string;
    grow_id: string;
    occurred_at: string;
    details: AiDoctorManualSaveDraftDetails;
  };
  idempotency_key: string;
}

export interface AiDoctorManualSaveDraftBlocked {
  ok: false;
  reasons: readonly AiDoctorManualSaveBlockedReason[];
}

export type AiDoctorManualSaveDraftResult =
  | AiDoctorManualSaveDraftOk
  | AiDoctorManualSaveDraftBlocked;

/** Stable, non-cryptographic hash (FNV-1a 32-bit, base36). Deterministic. */
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
  view: AiDoctorCheckInPreviewView,
  identity: AiDoctorManualSavePlantIdentity,
  engineVersion: string,
): string {
  const stable = {
    e: engineVersion,
    p: identity.plant_id ?? "",
    t: identity.tent_id ?? "",
    g: identity.grow_id ?? "",
    st: identity.stage ?? "",
    s: view.summary,
    li: view.likelyIssue,
    cb: view.confidenceBand,
    cf: view.confidence,
    rl: view.riskLevel,
    ev: view.evidence,
    mi: view.missingInformation,
    pc: view.possibleCauses,
    ia: view.immediateAction,
    wn: view.whatNotToDo,
    f24: view.followUp24h,
    r3: view.recoveryPlan3Day,
    lim: view.limitations.map((l) => l.code),
  };
  return stableHash(JSON.stringify(stable));
}

export function buildAiDoctorManualSaveDraft(
  input: AiDoctorManualSaveDraftInput,
): AiDoctorManualSaveDraftResult {
  const reasons: AiDoctorManualSaveBlockedReason[] = [];
  const { identity, view, receiptText } = input;
  if (!identity.plant_id) reasons.push("missing_plant_id");
  if (!identity.tent_id) reasons.push("missing_tent_id");
  if (!identity.grow_id) reasons.push("missing_grow_id");
  if (!receiptText || receiptText.trim() === "") reasons.push("missing_note");
  if (!view?.summary || view.summary.trim() === "")
    reasons.push("missing_summary");

  if (reasons.length > 0) {
    return deepFreeze({ ok: false, reasons: Object.freeze([...reasons]) });
  }

  const engineVersion = input.engineVersion ?? AI_DOCTOR_ENGINE_VERSION_DEFAULT;
  const receiptVersion =
    input.receiptVersion ?? AI_DOCTOR_RECEIPT_VERSION_DEFAULT;
  const now = input.now ?? new Date(0);
  const occurredAt = input.occurredAt ?? now.toISOString();

  const contextHash = computeContextHash(view, identity, engineVersion);
  const idempotencyKey = `aidoc:${identity.plant_id}:${engineVersion}:${receiptVersion}:${contextHash}`;

  const engineOutput: AiDoctorRedactedEngineOutput = {
    summary: view.summary,
    likely_issue: view.likelyIssue,
    confidence: view.confidence,
    evidence: [...view.evidence],
    missing_information: [...view.missingInformation],
    immediate_action: view.immediateAction,
    what_not_to_do: [...view.whatNotToDo],
    follow_up_24h: view.followUp24h,
    recovery_plan_3_day: view.recoveryPlan3Day,
    risk_level: view.riskLevel,
    action_queue_suggestion_status: view.actionQueueSuggestion
      ? view.actionQueueSuggestion.status
      : null,
  };

  const details: AiDoctorManualSaveDraftDetails = {
    kind: AI_DOCTOR_MANUAL_SAVE_KIND,
    preview_only: true,
    manual_save: true,
    deterministic_engine: true,
    no_live_ai_model: true,
    engine_version: engineVersion,
    receipt_version: receiptVersion,
    context_hash: contextHash,
    context_provenance: input.contextProvenance ?? {},
    limitations: view.limitations.map((l) => ({
      code: l.code,
      message: l.message,
    })),
    engine_output: engineOutput,
  };

  const result: AiDoctorManualSaveDraftOk = {
    ok: true,
    draft: {
      event_type: "observation",
      source: AI_DOCTOR_MANUAL_SAVE_SOURCE,
      note: receiptText,
      plant_id: identity.plant_id as string,
      tent_id: identity.tent_id as string,
      grow_id: identity.grow_id as string,
      occurred_at: occurredAt,
      details,
    },
    idempotency_key: idempotencyKey,
  };
  return deepFreeze(result);
}
