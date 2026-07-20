/**
 * Genetics & Propagation Traceability — canonical string-literal vocabularies,
 * runtime arrays, type guards, and safe human labels.
 *
 * PURE: no React, no Supabase, no I/O. Mirrors the SQL CHECK vocabularies so the
 * client and database agree. Every label lookup falls back safely for unknown /
 * legacy values (never throws, never invents meaning).
 */

// ---------------------------------------------------------------------------
// Accession source
// ---------------------------------------------------------------------------
export type AccessionSourceKind = "seed" | "clone" | "tissue_culture" | "unknown";
export const ACCESSION_SOURCE_KINDS: readonly AccessionSourceKind[] = [
  "seed",
  "clone",
  "tissue_culture",
  "unknown",
];
export function isAccessionSourceKind(v: unknown): v is AccessionSourceKind {
  return typeof v === "string" && (ACCESSION_SOURCE_KINDS as readonly string[]).includes(v);
}
export function accessionSourceLabel(v: unknown): string {
  switch (v) {
    case "seed":
      return "Seed";
    case "clone":
      return "Clone";
    case "tissue_culture":
      return "Tissue culture";
    case "unknown":
      return "Unknown source";
    default:
      return "Unknown source";
  }
}

/** Provenance certainty state of an accession's identity. */
export type KnownState = "known" | "unknown" | "unassigned" | "not_applicable";
export const KNOWN_STATES: readonly KnownState[] = [
  "known",
  "unknown",
  "unassigned",
  "not_applicable",
];
export function isKnownState(v: unknown): v is KnownState {
  return typeof v === "string" && (KNOWN_STATES as readonly string[]).includes(v);
}
export function knownStateLabel(v: unknown): string {
  switch (v) {
    case "known":
      return "Known";
    case "unknown":
      return "Unknown";
    case "unassigned":
      return "Unassigned";
    case "not_applicable":
      return "Not applicable";
    default:
      return "Unknown";
  }
}

// ---------------------------------------------------------------------------
// Propagation batches
// ---------------------------------------------------------------------------
export type PropagationMethod = "seed" | "cutting" | "tissue_culture" | "division" | "unknown";
export const PROPAGATION_METHODS: readonly PropagationMethod[] = [
  "seed",
  "cutting",
  "tissue_culture",
  "division",
  "unknown",
];
export function isPropagationMethod(v: unknown): v is PropagationMethod {
  return typeof v === "string" && (PROPAGATION_METHODS as readonly string[]).includes(v);
}
export function propagationMethodLabel(v: unknown): string {
  switch (v) {
    case "seed":
      return "Seed";
    case "cutting":
      return "Cutting";
    case "tissue_culture":
      return "Tissue culture";
    case "division":
      return "Division";
    case "unknown":
      return "Unknown method";
    default:
      return "Unknown method";
  }
}

export type BatchStatus =
  | "planned"
  | "active"
  | "rooting"
  | "rooted"
  | "completed"
  | "failed"
  | "archived";
export const BATCH_STATUSES: readonly BatchStatus[] = [
  "planned",
  "active",
  "rooting",
  "rooted",
  "completed",
  "failed",
  "archived",
];
export function isBatchStatus(v: unknown): v is BatchStatus {
  return typeof v === "string" && (BATCH_STATUSES as readonly string[]).includes(v);
}
export function batchStatusLabel(v: unknown): string {
  switch (v) {
    case "planned":
      return "Planned";
    case "active":
      return "Active";
    case "rooting":
      return "Rooting";
    case "rooted":
      return "Rooted";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "archived":
      return "Archived";
    default:
      return "Unknown status";
  }
}

// ---------------------------------------------------------------------------
// Trace subjects + screening
// ---------------------------------------------------------------------------
export type SubjectType = "accession" | "batch" | "plant";
export const SUBJECT_TYPES: readonly SubjectType[] = ["accession", "batch", "plant"];
export function isSubjectType(v: unknown): v is SubjectType {
  return typeof v === "string" && (SUBJECT_TYPES as readonly string[]).includes(v);
}

export type ScreeningResult = "positive" | "negative" | "inconclusive" | "not_tested";
export const SCREENING_RESULTS: readonly ScreeningResult[] = [
  "positive",
  "negative",
  "inconclusive",
  "not_tested",
];
export function isScreeningResult(v: unknown): v is ScreeningResult {
  return typeof v === "string" && (SCREENING_RESULTS as readonly string[]).includes(v);
}

/**
 * Rolled-up evidence posture. There is deliberately no reassuring all-clear
 * state — the absence of evidence is `untested`, and a negative is only ever
 * `negative_scoped` (scoped to a specific target + date), never an unscoped
 * claim of health.
 */
export type EvidenceState = "positive" | "inconclusive" | "negative_scoped" | "untested";
export const EVIDENCE_STATES: readonly EvidenceState[] = [
  "positive",
  "inconclusive",
  "negative_scoped",
  "untested",
];
export function isEvidenceState(v: unknown): v is EvidenceState {
  return typeof v === "string" && (EVIDENCE_STATES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Quarantine
// ---------------------------------------------------------------------------
export type QuarantineStatus = "open" | "released" | "disposed";
export const QUARANTINE_STATUSES: readonly QuarantineStatus[] = ["open", "released", "disposed"];
export function isQuarantineStatus(v: unknown): v is QuarantineStatus {
  return typeof v === "string" && (QUARANTINE_STATUSES as readonly string[]).includes(v);
}

export type ClosureKind = "cleared" | "disposed" | "override";
export type QuarantineAction = "open" | "release" | "dispose" | "reopen" | "override";

/** Trace node kinds spanning the new production lineage + adapted pheno records. */
export type TraceNodeKind = "accession" | "batch" | "plant" | "keeper" | "clone" | "cross";
export function traceNodeKindLabel(v: unknown): string {
  switch (v) {
    case "accession":
      return "Accession";
    case "batch":
      return "Propagation batch";
    case "plant":
      return "Plant";
    case "keeper":
      return "Keeper";
    case "clone":
      return "Clone";
    case "cross":
      return "Cross";
    default:
      return "Node";
  }
}
