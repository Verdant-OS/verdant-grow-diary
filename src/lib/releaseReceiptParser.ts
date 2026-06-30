/**
 * Release Receipt Parser — pure, deterministic.
 *
 * Validates raw artifact input against the v1 contract and normalizes it
 * into the existing Release Readiness evidence shapes. No I/O, no network,
 * no Supabase, no clock. Never throws on bad input — returns structured
 * failure instead.
 */

import {
  RELEASE_RECEIPT_BLOCKER_SEVERITIES,
  RELEASE_RECEIPT_COMMAND_STATUSES,
  RELEASE_RECEIPT_FORBIDDEN_METADATA_KEYS,
  RELEASE_RECEIPT_KINDS,
  RELEASE_RECEIPT_SCHEMA_VERSION,
  RELEASE_RECEIPT_SOURCES,
  RELEASE_RECEIPT_STATUSES,
  RELEASE_RECEIPT_UNSAFE_SUBSTRINGS,
  type ParsedReleaseReceiptFailure,
  type ParsedReleaseReceiptResult,
  type ParsedReleaseReceiptSuccess,
  type ReleaseEvidenceBlocker,
  type ReleaseEvidenceReceipt,
  type ReleaseReceiptArtifactV1,
  type ReleaseReceiptBlocker,
  type ReleaseReceiptCommandResult,
  type ReleaseReceiptCounts,
  type ReleaseReceiptKind,
  type ReleaseReceiptMetadata,
} from "./releaseReceiptParserContract";

import {
  LOCAL_TARGETED_DISCLAIMER,
  MANUAL_NOTE_DISCLAIMER,
  type ReceiptCategory,
  type ReceiptStatus,
} from "./releaseReadinessEvidenceReceiptViewModel";

export type {
  ParsedReleaseReceiptFailure,
  ParsedReleaseReceiptResult,
  ParsedReleaseReceiptSuccess,
};


// --- Type guards ---------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function isIsoDateString(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function containsUnsafeSubstring(v: string): string | null {
  for (const needle of RELEASE_RECEIPT_UNSAFE_SUBSTRINGS) {
    if (v.includes(needle)) return needle;
  }
  return null;
}

function validateSafeString(field: string, v: unknown, errors: string[]): v is string {
  if (typeof v !== "string") {
    errors.push(`${field} must be a string`);
    return false;
  }
  const hit = containsUnsafeSubstring(v);
  if (hit) {
    errors.push(`${field} contains unsafe substring "${hit}"`);
    return false;
  }
  return true;
}

function validateSafeNullableString(
  field: string,
  v: unknown,
  errors: string[],
): v is string | null {
  if (v === null) return true;
  return validateSafeString(field, v, errors);
}

function validateMetadata(
  v: unknown,
  errors: string[],
): ReleaseReceiptMetadata | null {
  if (!isPlainObject(v)) {
    errors.push("metadata must be an object");
    return null;
  }
  const out: ReleaseReceiptMetadata = {};
  for (const [key, value] of Object.entries(v)) {
    const lower = key.toLowerCase();
    if (RELEASE_RECEIPT_FORBIDDEN_METADATA_KEYS.includes(lower)) {
      errors.push(`metadata key "${key}" is forbidden`);
      continue;
    }
    if (typeof value === "string") {
      const hit = containsUnsafeSubstring(value);
      if (hit) {
        errors.push(`metadata["${key}"] contains unsafe substring "${hit}"`);
        continue;
      }
      out[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        errors.push(`metadata["${key}"] must be finite`);
        continue;
      }
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else {
      errors.push(`metadata["${key}"] must be string, number, or boolean`);
    }
  }
  return out;
}

function validateCounts(
  v: unknown,
  errors: string[],
): ReleaseReceiptCounts | null {
  if (!isPlainObject(v)) {
    errors.push("counts must be an object");
    return null;
  }
  const { passed, failed, skipped, total } = v as Record<string, unknown>;
  if (
    !isFiniteNonNegativeInt(passed) ||
    !isFiniteNonNegativeInt(failed) ||
    !isFiniteNonNegativeInt(skipped) ||
    !isFiniteNonNegativeInt(total)
  ) {
    errors.push("counts fields must be non-negative integers");
    return null;
  }
  if (total !== passed + failed + skipped) {
    errors.push("counts.total must equal passed + failed + skipped");
    return null;
  }
  return { passed, failed, skipped, total };
}

function validateCommand(
  idx: number,
  v: unknown,
  errors: string[],
): ReleaseReceiptCommandResult | null {
  if (!isPlainObject(v)) {
    errors.push(`commands[${idx}] must be an object`);
    return null;
  }
  const raw = v as Record<string, unknown>;
  const ok =
    validateSafeString(`commands[${idx}].name`, raw.name, errors) &&
    validateSafeString(`commands[${idx}].command`, raw.command, errors) &&
    validateSafeString(`commands[${idx}].summary`, raw.summary, errors);
  if (!ok) return null;
  if (
    typeof raw.status !== "string" ||
    !RELEASE_RECEIPT_COMMAND_STATUSES.includes(raw.status as never)
  ) {
    errors.push(`commands[${idx}].status is invalid`);
    return null;
  }
  if (
    !isFiniteNonNegativeInt(raw.passed) ||
    !isFiniteNonNegativeInt(raw.failed) ||
    !isFiniteNonNegativeInt(raw.skipped)
  ) {
    errors.push(`commands[${idx}] counts must be non-negative integers`);
    return null;
  }
  if (
    raw.duration_ms !== null &&
    !(typeof raw.duration_ms === "number" && Number.isFinite(raw.duration_ms) && raw.duration_ms >= 0)
  ) {
    errors.push(`commands[${idx}].duration_ms must be null or a non-negative number`);
    return null;
  }
  return {
    name: raw.name as string,
    command: raw.command as string,
    status: raw.status as ReleaseReceiptCommandResult["status"],
    passed: raw.passed,
    failed: raw.failed,
    skipped: raw.skipped,
    duration_ms: raw.duration_ms as number | null,
    summary: raw.summary as string,
  };
}

function validateBlocker(
  idx: number,
  v: unknown,
  errors: string[],
): ReleaseReceiptBlocker | null {
  if (!isPlainObject(v)) {
    errors.push(`blockers[${idx}] must be an object`);
    return null;
  }
  const raw = v as Record<string, unknown>;
  const ok =
    validateSafeString(`blockers[${idx}].id`, raw.id, errors) &&
    validateSafeString(`blockers[${idx}].label`, raw.label, errors) &&
    validateSafeString(`blockers[${idx}].summary`, raw.summary, errors);
  if (!ok) return null;
  if (
    typeof raw.severity !== "string" ||
    !RELEASE_RECEIPT_BLOCKER_SEVERITIES.includes(raw.severity as never)
  ) {
    errors.push(`blockers[${idx}].severity is invalid`);
    return null;
  }
  if (typeof raw.active !== "boolean") {
    errors.push(`blockers[${idx}].active must be boolean`);
    return null;
  }
  return {
    id: raw.id as string,
    label: raw.label as string,
    severity: raw.severity as ReleaseReceiptBlocker["severity"],
    active: raw.active,
    summary: raw.summary as string,
  };
}

// --- Public API ----------------------------------------------------------

export function isReleaseReceiptArtifactV1(
  input: unknown,
): input is ReleaseReceiptArtifactV1 {
  const result = parseReleaseReceiptArtifact(input);
  return result.ok;
}

export function parseReleaseReceiptArtifact(
  input: unknown,
): ParsedReleaseReceiptResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ["artifact must be an object"], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (raw.schema_version !== RELEASE_RECEIPT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `unknown schema_version (expected "${RELEASE_RECEIPT_SCHEMA_VERSION}")`,
      ],
      warnings,
    };
  }

  // Required strings.
  validateSafeString("artifact_id", raw.artifact_id, errors);
  validateSafeString("summary", raw.summary, errors);
  validateSafeNullableString("source_run_id", raw.source_run_id, errors);
  validateSafeNullableString("commit_sha", raw.commit_sha, errors);
  validateSafeNullableString("branch", raw.branch, errors);
  validateSafeNullableString("workflow_name", raw.workflow_name, errors);

  if (!isIsoDateString(raw.generated_at)) {
    errors.push("generated_at must be a valid ISO datetime string");
  }
  if (
    typeof raw.source !== "string" ||
    !RELEASE_RECEIPT_SOURCES.includes(raw.source as never)
  ) {
    errors.push("source is invalid");
  }
  if (
    typeof raw.receipt_kind !== "string" ||
    !RELEASE_RECEIPT_KINDS.includes(raw.receipt_kind as never)
  ) {
    errors.push("receipt_kind is invalid");
  }
  if (
    typeof raw.status !== "string" ||
    !RELEASE_RECEIPT_STATUSES.includes(raw.status as never)
  ) {
    errors.push("status is invalid");
  }

  // ci_full_suite cannot come from manual_import.
  if (
    raw.receipt_kind === "ci_full_suite" &&
    raw.source === "manual_import"
  ) {
    errors.push("ci_full_suite artifacts cannot have source=manual_import");
  }

  // Commands.
  let commands: ReleaseReceiptCommandResult[] = [];
  if (!Array.isArray(raw.commands)) {
    errors.push("commands must be an array");
  } else {
    const parsed: ReleaseReceiptCommandResult[] = [];
    raw.commands.forEach((c, i) => {
      const p = validateCommand(i, c, errors);
      if (p) parsed.push(p);
    });
    commands = parsed;
  }

  const counts = validateCounts(raw.counts, errors);

  // Blockers.
  let blockers: ReleaseReceiptBlocker[] = [];
  if (!Array.isArray(raw.blockers)) {
    errors.push("blockers must be an array");
  } else {
    const parsed: ReleaseReceiptBlocker[] = [];
    raw.blockers.forEach((b, i) => {
      const p = validateBlocker(i, b, errors);
      if (p) parsed.push(p);
    });
    blockers = parsed;
  }

  const metadata = validateMetadata(raw.metadata, errors);

  if (errors.length > 0 || !counts || !metadata) {
    return { ok: false, errors, warnings };
  }

  const artifact: ReleaseReceiptArtifactV1 = {
    schema_version: RELEASE_RECEIPT_SCHEMA_VERSION,
    artifact_id: raw.artifact_id as string,
    generated_at: raw.generated_at as string,
    source: raw.source as ReleaseReceiptArtifactV1["source"],
    source_run_id: (raw.source_run_id as string | null) ?? null,
    commit_sha: (raw.commit_sha as string | null) ?? null,
    branch: (raw.branch as string | null) ?? null,
    workflow_name: (raw.workflow_name as string | null) ?? null,
    receipt_kind: raw.receipt_kind as ReleaseReceiptKind,
    status: raw.status as ReleaseReceiptArtifactV1["status"],
    summary: raw.summary as string,
    commands,
    counts,
    blockers,
    metadata,
  };

  const evidenceReceipt = normalizeReleaseReceiptToEvidenceReceipt(artifact);
  const evidenceBlockers = normalizeReleaseReceiptBlockers(artifact);

  return {
    ok: true,
    artifact,
    evidenceReceipt,
    blockers: evidenceBlockers,
    warnings,
  };
}

function kindToCategory(kind: ReleaseReceiptKind): ReceiptCategory {
  switch (kind) {
    case "ci_full_suite":
      return "ci_full_suite";
    case "local_targeted":
      return "local_targeted";
    case "manual_operator_note":
      return "manual_operator_note";
  }
}

function statusToReceiptStatus(
  s: ReleaseReceiptArtifactV1["status"],
): ReceiptStatus {
  // Both type sets share identical members.
  return s;
}

export function normalizeReleaseReceiptToEvidenceReceipt(
  artifact: ReleaseReceiptArtifactV1,
): ReleaseEvidenceReceipt {
  const category = kindToCategory(artifact.receipt_kind);
  const status = statusToReceiptStatus(artifact.status);

  const hasActiveReleaseBlocker = artifact.blockers.some(
    (b) => b.active && b.severity === "release_blocker",
  );

  const isPassingCi =
    artifact.receipt_kind === "ci_full_suite" &&
    artifact.status === "pass" &&
    !hasActiveReleaseBlocker;

  const canUnlockReleaseGo = isPassingCi;

  let blocksReleaseGo = false;
  if (artifact.receipt_kind === "ci_full_suite") {
    if (
      artifact.status === "fail" ||
      artifact.status === "blocked" ||
      hasActiveReleaseBlocker
    ) {
      blocksReleaseGo = true;
    }
  }

  const sourceLabel =
    artifact.receipt_kind === "ci_full_suite"
      ? "parser-receipt"
      : artifact.receipt_kind === "local_targeted"
        ? "local-targeted"
        : "operator-note";

  const commandOrSource =
    artifact.commands[0]?.command ?? artifact.workflow_name ?? artifact.artifact_id;

  const notes =
    category === "local_targeted"
      ? LOCAL_TARGETED_DISCLAIMER
      : category === "manual_operator_note"
        ? MANUAL_NOTE_DISCLAIMER
        : artifact.summary;

  return {
    id: artifact.artifact_id,
    label: artifact.workflow_name ?? artifact.artifact_id,
    category,
    status,
    sourceLabel,
    capturedAt: artifact.generated_at,
    commandOrSource,
    summary: artifact.summary,
    blocksReleaseGo,
    canUnlockReleaseGo,
    notes,
  };
}

export function normalizeReleaseReceiptBlockers(
  artifact: ReleaseReceiptArtifactV1,
): ReleaseEvidenceBlocker[] {
  return artifact.blockers
    .filter((b) => b.active && b.severity === "release_blocker")
    .map((b) => ({ id: b.id, label: b.label, detail: b.summary }));
}
