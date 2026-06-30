/**
 * Release Receipt Emitter v1.
 *
 * Pure, deterministic helper that converts a structured set of validation
 * command results into a `release-receipt.v1` artifact and validates it
 * through the parser contract before returning.
 *
 * Hard rules:
 *  - No I/O, no fetch, no Supabase, no GitHub API, no clock reads
 *    (caller passes `generated_at`).
 *  - Status is derived deterministically from command results + blockers.
 *  - Counts are derived deterministically from command results.
 *  - Output is round-tripped through `parseReleaseReceiptArtifact` so the
 *    emitter cannot produce an artifact the parser would reject.
 *  - This module is script-only / local-safe. Do NOT import it from UI.
 */

import {
  RELEASE_RECEIPT_SCHEMA_VERSION,
  type ParsedReleaseReceiptFailure,
  type ReleaseReceiptArtifactV1,
  type ReleaseReceiptBlocker,
  type ReleaseReceiptCommandResult,
  type ReleaseReceiptCounts,
  type ReleaseReceiptKind,
  type ReleaseReceiptMetadata,
  type ReleaseReceiptSource,
  type ReleaseReceiptStatus,
} from "./releaseReceiptParserContract";
import { parseReleaseReceiptArtifact } from "./releaseReceiptParser";

export interface EmitReleaseReceiptInput {
  artifactId: string;
  generatedAt: string;
  source: ReleaseReceiptSource;
  receiptKind: ReleaseReceiptKind;
  summary: string;
  commands: ReleaseReceiptCommandResult[];
  blockers?: ReleaseReceiptBlocker[];
  metadata?: ReleaseReceiptMetadata;
  sourceRunId?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  workflowName?: string | null;
  /**
   * Optional explicit status. When omitted, status is derived from commands +
   * active release-blockers.
   */
  status?: ReleaseReceiptStatus;
}

export type EmitReleaseReceiptResult =
  | { ok: true; artifact: ReleaseReceiptArtifactV1 }
  | { ok: false; errors: string[] };

/** Sum command counts into a deterministic totals block. */
export function deriveReleaseReceiptCounts(
  commands: readonly ReleaseReceiptCommandResult[],
): ReleaseReceiptCounts {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of commands) {
    passed += c.passed;
    failed += c.failed;
    skipped += c.skipped;
  }
  return { passed, failed, skipped, total: passed + failed + skipped };
}

/**
 * Deterministically derive an overall artifact status from command results
 * and active release-blockers. Conservative: any failure/blocked/unknown
 * downgrades the artifact.
 */
export function deriveReleaseReceiptStatus(
  commands: readonly ReleaseReceiptCommandResult[],
  blockers: readonly ReleaseReceiptBlocker[],
): ReleaseReceiptStatus {
  if (commands.length === 0) return "unknown";
  const activeReleaseBlocker = blockers.some(
    (b) => b.active && b.severity === "release_blocker",
  );
  if (activeReleaseBlocker) return "blocked";
  let sawFail = false;
  let sawBlocked = false;
  let sawUnknown = false;
  let sawPass = false;
  for (const c of commands) {
    if (c.status === "fail") sawFail = true;
    else if (c.status === "blocked") sawBlocked = true;
    else if (c.status === "unknown") sawUnknown = true;
    else if (c.status === "pass") sawPass = true;
  }
  if (sawFail) return "fail";
  if (sawBlocked) return "blocked";
  if (sawUnknown) return "unknown";
  if (sawPass) return "pass";
  // All skipped — treat as pending (nothing actually ran).
  return "pending";
}

/**
 * Build + validate a `release-receipt.v1` artifact from structured input.
 * Returns the parsed/normalized artifact, or structured errors. Never throws.
 */
export function emitReleaseReceiptArtifact(
  input: EmitReleaseReceiptInput,
): EmitReleaseReceiptResult {
  const blockers = input.blockers ?? [];
  const counts = deriveReleaseReceiptCounts(input.commands);
  const status = input.status ?? deriveReleaseReceiptStatus(input.commands, blockers);

  const candidate: ReleaseReceiptArtifactV1 = {
    schema_version: RELEASE_RECEIPT_SCHEMA_VERSION,
    artifact_id: input.artifactId,
    generated_at: input.generatedAt,
    source: input.source,
    source_run_id: input.sourceRunId ?? null,
    commit_sha: input.commitSha ?? null,
    branch: input.branch ?? null,
    workflow_name: input.workflowName ?? null,
    receipt_kind: input.receiptKind,
    status,
    summary: input.summary,
    commands: [...input.commands],
    counts,
    blockers: [...blockers],
    metadata: { ...(input.metadata ?? {}) },
  };

  const parsed = parseReleaseReceiptArtifact(candidate);
  if (parsed.ok === true) {
    return { ok: true, artifact: parsed.artifact };
  }
  return { ok: false, errors: (parsed as ParsedReleaseReceiptFailure).errors };
}

