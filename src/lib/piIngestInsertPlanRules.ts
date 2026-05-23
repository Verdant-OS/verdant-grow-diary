/**
 * piIngestInsertPlanRules — pure insert-plan builder for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No writes.
 *  - Converts a successful PiIngestPipelineResult into a deterministic,
 *    ordered list of { idempotencyKey, row } items.
 *  - Provides a pre-insert duplicate filter against a caller-supplied set
 *    of already-existing idempotency keys.
 *
 * IMPORTANT DATA-SHAPE RULE:
 *  - The `sensor_readings` table does NOT yet have an `idempotency_key`
 *    column. The idempotency key is therefore kept OUTSIDE the row, on
 *    the plan item, and is never spliced into the row payload.
 */

import type { PiIngestPipelineResult } from "./piIngestPipeline";
import type { NormalizedSensorReadingDraft } from "./sensorIngestNormalizationRules";

// ----------------------------- Types -----------------------------

export interface PiIngestInsertPlanItem {
  readonly idempotencyKey: string;
  readonly row: NormalizedSensorReadingDraft;
}

export interface PiIngestInsertPlan {
  readonly ownerUserId: string;
  readonly bridgeId: string;
  readonly tentId: string;
  readonly items: readonly PiIngestInsertPlanItem[];
}

export interface PiIngestInsertPartition {
  readonly toInsert: readonly PiIngestInsertPlanItem[];
  readonly duplicates: readonly PiIngestInsertPlanItem[];
}

export interface PiIngestInsertPartitionSummary {
  readonly total: number;
  readonly toInsert: number;
  readonly duplicates: number;
}

// ----------------------------- Builder -----------------------------

type SuccessResult = Extract<PiIngestPipelineResult, { ok: true }>;

function isSuccess(r: PiIngestPipelineResult): r is SuccessResult {
  return r.ok === true;
}

/**
 * Convert a successful pipeline result into a deterministic insert plan.
 *
 * Throws if the pipeline result is a failure (callers must branch on
 * `result.ok` before invoking) or if the drafts/keys lengths disagree.
 */
export function buildPiIngestInsertPlan(
  pipelineSuccessResult: PiIngestPipelineResult,
): PiIngestInsertPlan {
  if (!isSuccess(pipelineSuccessResult)) {
    throw new Error(
      "buildPiIngestInsertPlan requires a successful PiIngestPipelineResult",
    );
  }
  const { readingDrafts, idempotencyKeys, ownerUserId, bridgeId, tentId } =
    pipelineSuccessResult;
  if (readingDrafts.length !== idempotencyKeys.length) {
    throw new Error(
      `insert-plan length mismatch: ${readingDrafts.length} drafts vs ${idempotencyKeys.length} keys`,
    );
  }
  const items: PiIngestInsertPlanItem[] = readingDrafts.map((row, i) => ({
    idempotencyKey: idempotencyKeys[i],
    row,
  }));
  return { ownerUserId, bridgeId, tentId, items };
}

// ----------------------------- Partitioning -----------------------------

/**
 * Split a plan into rows that should be inserted vs rows that already
 * exist (by idempotency key). Order within each partition is preserved.
 *
 * `existingKeys` may be a Set, Array, or any iterable of strings.
 */
export function partitionAgainstExistingKeys(
  plan: PiIngestInsertPlan,
  existingKeys: ReadonlySet<string> | Iterable<string>,
): PiIngestInsertPartition {
  const existing =
    existingKeys instanceof Set
      ? (existingKeys as ReadonlySet<string>)
      : new Set<string>(existingKeys);
  const toInsert: PiIngestInsertPlanItem[] = [];
  const duplicates: PiIngestInsertPlanItem[] = [];
  for (const item of plan.items) {
    if (existing.has(item.idempotencyKey)) duplicates.push(item);
    else toInsert.push(item);
  }
  return { toInsert, duplicates };
}

export function summarizeInsertPlanPartition(
  partition: PiIngestInsertPartition,
): PiIngestInsertPartitionSummary {
  return {
    total: partition.toInsert.length + partition.duplicates.length,
    toInsert: partition.toInsert.length,
    duplicates: partition.duplicates.length,
  };
}
