/**
 * EcoWitt Live Evidence Snapshot Export — pure deterministic helpers.
 *
 * Serializes the operator-entered evidence form + evaluator results into a
 * stable JSON snapshot that operators can download locally as proof of what
 * was checked on the bring-up page tonight.
 *
 * SAFETY:
 *  - Pure functions. No browser APIs (no Blob, no URL, no document, no
 *    clipboard, no localStorage/sessionStorage).
 *  - No Date.now(). All timestamps come from the caller.
 *  - No Supabase, fetch, functions.invoke, model calls, or Edge Function
 *    helpers.
 *  - No writes, no alerts, no Action Queue items, no device control.
 *  - Recursive redaction of secret-shaped strings before serialization.
 *  - Does not mutate input.
 */

import type {
  EcowittLiveEvidenceFormState,
} from "./ecowittLiveEvidenceFormRules";
import type { LiveSourceTruthGateResult } from "./liveSourceTruthGateRules";
import type { EcowittPerPlantResult } from "./ecowittLiveEvidenceMultiPlantRules";
import type { EcowittEvidenceUnitWarning } from "./ecowittLiveEvidenceUnitWarningRules";
import type { EcowittTonightModeViewModel } from "./ecowittTonightModeViewModel";

export const ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION =
  "ecowitt-live-evidence-snapshot.v1" as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_TYPE =
  "manual_operator_evidence" as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE =
  "/operator/ecowitt-live-bringup" as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_WARNING =
  "This is a manual operator evidence snapshot. It is not database proof and does not prove live sensor truth by itself." as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_DISCLAIMER =
  "Only treat evidence as live proof after comparing real EcoWitt/controller values against backend evidence and confirming source, captured_at, payload presence, confidence, and units." as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_SAFETY_FLAGS: readonly string[] =
  Object.freeze([
    "manual_snapshot_only",
    "not_database_proof",
    "requires_controller_comparison",
    "requires_device_identity_confirmation",
    "requires_timestamp_sanity_check",
    "no_device_control",
    "approval_required_for_actions",
    "do_not_use_demo_as_live",
  ]);

export const ECOWITT_LIVE_EVIDENCE_EXPORT_EMPTY_NEXT_STEP =
  "No next steps were returned. Recheck evidence before treating data as live." as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_TEMPLATE_NEXT_STEP =
  "Replace example/template values with tonight's real EcoWitt/MQTT/backend evidence before treating any result as useful." as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED = "[redacted]" as const;

export const ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME =
  "verdant-ecowitt-live-evidence-static.json" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EcowittLiveEvidenceSourceTruthSummary {
  readonly overall_verdict: string;
  readonly overall_is_live_proof: boolean;
  readonly overall_summary: string;
  readonly per_plant_count: number;
}

export interface EcowittLiveEvidenceSnapshotExport {
  readonly schema_version: typeof ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION;
  readonly export_type: typeof ECOWITT_LIVE_EVIDENCE_EXPORT_TYPE;
  readonly generated_at: string;
  readonly route: typeof ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE;
  readonly warning: typeof ECOWITT_LIVE_EVIDENCE_EXPORT_WARNING;
  readonly operator_disclaimer: typeof ECOWITT_LIVE_EVIDENCE_EXPORT_DISCLAIMER;
  readonly form_state: EcowittLiveEvidenceFormState;
  readonly overall_result: LiveSourceTruthGateResult;
  readonly plant_results: readonly EcowittPerPlantResult[];
  readonly unit_warnings: readonly EcowittEvidenceUnitWarning[];
  readonly form_warnings: readonly string[];
  readonly required_next_steps: readonly string[];
  readonly source_truth_summary: EcowittLiveEvidenceSourceTruthSummary;
  readonly safety_flags: readonly string[];
}

export interface EcowittLiveEvidenceExportInput {
  readonly generated_at: string;
  readonly form_state: EcowittLiveEvidenceFormState;
  readonly overall_result: LiveSourceTruthGateResult;
  readonly plant_results: readonly EcowittPerPlantResult[];
  readonly unit_warnings: readonly EcowittEvidenceUnitWarning[];
  readonly form_warnings: readonly string[];
  readonly required_next_steps: readonly string[];
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACTION_PATTERNS: readonly RegExp[] = [
  // JWT-ish (covers Supabase service_role keys and bridge tokens issued as JWTs)
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  // Generic JWT prefix without three parts (still secret-shaped)
  /eyJ[A-Za-z0-9_-]{30,}/g,
  // OpenAI API keys
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Supabase project keys / personal access tokens
  /sbp_[A-Za-z0-9]{16,}/g,
  /sbs_[A-Za-z0-9]{16,}/g,
  // Bearer tokens (case-insensitive prefix)
  /[Bb]earer\s+[A-Za-z0-9._\-+/=]{16,}/g,
  // Service role explicit mention with a value-like suffix
  /service[_-]?role[^\n]{0,80}[:=]\s*[A-Za-z0-9._\-+/=]{16,}/gi,
  // Bridge token explicit mention with a value-like suffix
  /bridge[_-]?token[^\n]{0,80}[:=]\s*[A-Za-z0-9._\-+/=]{16,}/gi,
];

function redactString(value: string): string {
  let out = value;
  for (const re of REDACTION_PATTERNS) {
    out = out.replace(re, ECOWITT_LIVE_EVIDENCE_EXPORT_REDACTED);
  }
  return out;
}

function redactValue<T>(value: T): T {
  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src)) {
      out[key] = redactValue(src[key]);
    }
    return out as unknown as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Template detection
// ---------------------------------------------------------------------------

function looksLikeTemplateState(form: EcowittLiveEvidenceFormState): boolean {
  const tent = (form.tent_id ?? "").trim().toLowerCase();
  const plant = (form.plant_id ?? "").trim().toLowerCase();
  return (
    tent === "example-tent" ||
    plant.startsWith("example-plant") ||
    tent.startsWith("example-")
  );
}

// ---------------------------------------------------------------------------
// Next steps assembly
// ---------------------------------------------------------------------------

function assembleNextSteps(
  raw: readonly string[],
  isTemplate: boolean,
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") continue;
    const trimmed = s.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  if (isTemplate) {
    const tpl = ECOWITT_LIVE_EVIDENCE_EXPORT_TEMPLATE_NEXT_STEP;
    if (!seen.has(tpl)) {
      out.push(tpl);
      seen.add(tpl);
    }
  }
  if (out.length === 0) {
    return Object.freeze([ECOWITT_LIVE_EVIDENCE_EXPORT_EMPTY_NEXT_STEP]);
  }
  const sorted = [...out].sort();
  return Object.freeze(sorted);
}

// ---------------------------------------------------------------------------
// Source truth summary
// ---------------------------------------------------------------------------

function buildSourceTruthSummary(
  overall: LiveSourceTruthGateResult,
  plantResults: readonly EcowittPerPlantResult[],
): EcowittLiveEvidenceSourceTruthSummary {
  return Object.freeze({
    overall_verdict: overall.verdict,
    overall_is_live_proof: overall.is_live_proof === true,
    overall_summary: overall.summary,
    per_plant_count: plantResults.length,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildEcowittLiveEvidenceSnapshotExport(
  input: EcowittLiveEvidenceExportInput,
): EcowittLiveEvidenceSnapshotExport {
  // Deep-copy + redact every payload section before assembling the snapshot.
  const form_state = redactValue(input.form_state);
  const overall_result = redactValue(input.overall_result);
  const plant_results = redactValue(input.plant_results);
  const unit_warnings = redactValue(input.unit_warnings);
  const form_warnings = redactValue(input.form_warnings);

  const isTemplate = looksLikeTemplateState(input.form_state);
  const next_raw = redactValue(input.required_next_steps);
  const required_next_steps = assembleNextSteps(next_raw, isTemplate);

  const source_truth_summary = buildSourceTruthSummary(
    overall_result,
    plant_results,
  );

  const snapshot: EcowittLiveEvidenceSnapshotExport = {
    schema_version: ECOWITT_LIVE_EVIDENCE_EXPORT_SCHEMA_VERSION,
    export_type: ECOWITT_LIVE_EVIDENCE_EXPORT_TYPE,
    generated_at: input.generated_at,
    route: ECOWITT_LIVE_EVIDENCE_EXPORT_ROUTE,
    warning: ECOWITT_LIVE_EVIDENCE_EXPORT_WARNING,
    operator_disclaimer: ECOWITT_LIVE_EVIDENCE_EXPORT_DISCLAIMER,
    form_state,
    overall_result,
    plant_results,
    unit_warnings,
    form_warnings,
    required_next_steps,
    source_truth_summary,
    safety_flags: ECOWITT_LIVE_EVIDENCE_EXPORT_SAFETY_FLAGS,
  };

  return Object.freeze(snapshot);
}

export function serializeEcowittLiveEvidenceSnapshotExport(
  snapshot: EcowittLiveEvidenceSnapshotExport,
): string {
  return JSON.stringify(snapshot, null, 2);
}

// ISO 8601 with required time portion and trailing Z.
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function buildEcowittLiveEvidenceSnapshotFilename(
  generatedAt: string,
): string {
  if (typeof generatedAt !== "string" || !ISO_RE.test(generatedAt)) {
    return ECOWITT_LIVE_EVIDENCE_EXPORT_STATIC_FILENAME;
  }
  // Drop optional fractional seconds for filename stability and replace
  // colons with hyphens for filesystem safety.
  const trimmed = generatedAt.replace(/\.\d+Z$/, "Z");
  const safe = trimmed.replace(/:/g, "-");
  return `verdant-ecowitt-live-evidence-${safe}.json`;
}
