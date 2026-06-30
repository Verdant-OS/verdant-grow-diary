/**
 * Release Receipt Parser Contract v1.
 *
 * SAFETY-CONTRACT: APPROVAL-REQUIRED
 *
 * Defines the trusted artifact shape Verdant will accept as parser-generated
 * evidence for Release Readiness. Pure types + constants only — no I/O, no
 * fetch, no Supabase, no clock reads. Consumers must validate every artifact
 * through `releaseReceiptParser` before treating it as trusted.
 *
 * The unsafe-substring denylist below mentions credential keywords as bare
 * literals so the parser can reject artifacts that leak them. The keywords
 * are denylist data, not real credential usage.
 *
 * Hard rules:
 *  - Only `schema_version === RELEASE_RECEIPT_SCHEMA_VERSION` is accepted.
 *  - Only a `ci_full_suite` artifact with `status: "pass"` and no active
 *    release_blocker may unlock Release GO.
 *  - `local_targeted` and `manual_operator_note` artifacts NEVER unlock GO.
 *  - `ci_full_suite` cannot come from `manual_import`.
 *  - Unsafe metadata (secret-like values) is rejected.
 */

export const RELEASE_RECEIPT_SCHEMA_VERSION = "release-receipt.v1" as const;

export type ReleaseReceiptSchemaVersion = typeof RELEASE_RECEIPT_SCHEMA_VERSION;

export type ReleaseReceiptSource =
  | "github_actions"
  | "local_parser"
  | "manual_import";

export type ReleaseReceiptKind =
  | "ci_full_suite"
  | "local_targeted"
  | "manual_operator_note";

export type ReleaseReceiptStatus =
  | "pass"
  | "fail"
  | "blocked"
  | "pending"
  | "unknown";

export type ReleaseReceiptCommandStatus =
  | "pass"
  | "fail"
  | "blocked"
  | "skipped"
  | "unknown";

export type ReleaseReceiptBlockerSeverity =
  | "release_blocker"
  | "warning"
  | "info";

export interface ReleaseReceiptCommandResult {
  name: string;
  command: string;
  status: ReleaseReceiptCommandStatus;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number | null;
  summary: string;
}

export interface ReleaseReceiptCounts {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface ReleaseReceiptBlocker {
  id: string;
  label: string;
  severity: ReleaseReceiptBlockerSeverity;
  active: boolean;
  summary: string;
}

export type ReleaseReceiptMetadataValue = string | number | boolean;

export type ReleaseReceiptMetadata = Record<string, ReleaseReceiptMetadataValue>;

export interface ReleaseReceiptArtifactV1 {
  schema_version: ReleaseReceiptSchemaVersion;
  artifact_id: string;
  generated_at: string;
  source: ReleaseReceiptSource;
  source_run_id: string | null;
  commit_sha: string | null;
  branch: string | null;
  workflow_name: string | null;
  receipt_kind: ReleaseReceiptKind;
  status: ReleaseReceiptStatus;
  summary: string;
  commands: ReleaseReceiptCommandResult[];
  counts: ReleaseReceiptCounts;
  blockers: ReleaseReceiptBlocker[];
  metadata: ReleaseReceiptMetadata;
}

/** Substrings that disqualify a string field as unsafe (secret-like). */
export const RELEASE_RECEIPT_UNSAFE_SUBSTRINGS: readonly string[] = [
  "service_role",
  "SUPABASE_SERVICE_ROLE_KEY",
  "Authorization: Bearer",
  "sk-",
  "ghp_",
  "vbt_",
  "api_key",
  "access_token",
];

/** Reserved/forbidden metadata key names. */
export const RELEASE_RECEIPT_FORBIDDEN_METADATA_KEYS: readonly string[] = [
  "service_role",
  "service_role_key",
  "supabase_service_role_key",
  "authorization",
  "access_token",
  "refresh_token",
  "api_key",
  "api_token",
  "bridge_token",
  "raw_payload",
  "secret",
  "password",
];

export const RELEASE_RECEIPT_SOURCES: readonly ReleaseReceiptSource[] = [
  "github_actions",
  "local_parser",
  "manual_import",
];

export const RELEASE_RECEIPT_KINDS: readonly ReleaseReceiptKind[] = [
  "ci_full_suite",
  "local_targeted",
  "manual_operator_note",
];

export const RELEASE_RECEIPT_STATUSES: readonly ReleaseReceiptStatus[] = [
  "pass",
  "fail",
  "blocked",
  "pending",
  "unknown",
];

export const RELEASE_RECEIPT_COMMAND_STATUSES: readonly ReleaseReceiptCommandStatus[] =
  ["pass", "fail", "blocked", "skipped", "unknown"];

export const RELEASE_RECEIPT_BLOCKER_SEVERITIES: readonly ReleaseReceiptBlockerSeverity[] =
  ["release_blocker", "warning", "info"];

// ---------------------------------------------------------------------------
// Parser result union (discriminated by `ok`).
//
// Re-exports of viewmodel evidence types live alongside the union so the
// parser result is fully describable from the contract layer alone.
// Type-only imports — no runtime coupling.
// ---------------------------------------------------------------------------

import type {
  EvidenceBlocker as _EvidenceBlocker,
  EvidenceReceipt as _EvidenceReceipt,
} from "./releaseReadinessEvidenceReceiptViewModel";

export type ReleaseEvidenceReceipt = _EvidenceReceipt;
export type ReleaseEvidenceBlocker = _EvidenceBlocker;

export type ParsedReleaseReceiptSuccess = {
  ok: true;
  artifact: ReleaseReceiptArtifactV1;
  evidenceReceipt: ReleaseEvidenceReceipt;
  blockers: ReleaseEvidenceBlocker[];
  warnings: string[];
};

export type ParsedReleaseReceiptFailure = {
  ok: false;
  errors: string[];
  warnings: string[];
};

export type ParsedReleaseReceiptResult =
  | ParsedReleaseReceiptSuccess
  | ParsedReleaseReceiptFailure;

