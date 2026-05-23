/**
 * piIngestCommitPlan — pure commit-plan builder for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No writes.
 *  - Composes the pure insert-plan rules with a caller-supplied set of
 *    already-existing idempotency keys to produce the exact rows a future
 *    endpoint should write:
 *      * toInsertSensorRows         → rows for `sensor_readings`
 *      * toInsertIdempotencyRows    → rows for `pi_ingest_idempotency_keys`
 *      * duplicates                 → readings that are already recorded
 *      * summary                    → counts (total / toInsert / duplicates)
 *
 *  IMPORTANT DATA-SHAPE RULES:
 *   - The `sensor_readings` table does NOT have an `idempotency_key`
 *     column. The key is therefore tracked only on the matching
 *     idempotency row and is NEVER spliced into the sensor row.
 *   - Sensor row and idempotency row are emitted at the same index so the
 *     caller can correlate them after a successful insert.
 */
import type { PiIngestPipelineResult } from "./piIngestPipeline";
import type { NormalizedSensorReadingDraft } from "./sensorIngestNormalizationRules";
import {
  buildPiIngestInsertPlan,
  partitionAgainstExistingKeys,
  summarizeInsertPlanPartition,
  type PiIngestInsertPlanItem,
  type PiIngestInsertPartitionSummary,
} from "./piIngestInsertPlanRules";

// ----------------------------- Types -----------------------------

/**
 * Insert shape for `pi_ingest_idempotency_keys`. Declared structurally to
 * keep this module free of Supabase imports.
 */
export interface PiIngestIdempotencyRowDraft {
  readonly user_id: string;
  readonly tent_id: string;
  readonly bridge_id: string;
  readonly device_id: string;
  readonly metric: string;
  readonly captured_at: string;
  readonly idempotency_key: string;
}

export interface PiIngestCommitPlanDuplicate {
  readonly idempotencyKey: string;
  readonly row: NormalizedSensorReadingDraft;
}

export interface PiIngestCommitPlan {
  readonly ownerUserId: string;
  readonly bridgeId: string;
  readonly tentId: string;
  readonly toInsertSensorRows: readonly NormalizedSensorReadingDraft[];
  readonly toInsertIdempotencyRows: readonly PiIngestIdempotencyRowDraft[];
  readonly duplicates: readonly PiIngestCommitPlanDuplicate[];
  readonly summary: PiIngestInsertPartitionSummary;
}

export interface BuildPiIngestCommitPlanInput {
  readonly pipelineResult: PiIngestPipelineResult;
  readonly existingKeys: ReadonlySet<string> | Iterable<string>;
}

// ----------------------------- Helpers -----------------------------

const FORBIDDEN_SENSOR_ROW_KEY = "idempotency_key";

function ensureNoIdempotencyKeyOnRow(
  row: NormalizedSensorReadingDraft,
): NormalizedSensorReadingDraft {
  if (
    row &&
    typeof row === "object" &&
    FORBIDDEN_SENSOR_ROW_KEY in (row as Record<string, unknown>)
  ) {
    throw new Error(
      "piIngestCommitPlan: sensor_readings draft must not contain an idempotency_key field",
    );
  }
  return row;
}

function toIdempotencyRow(
  item: PiIngestInsertPlanItem,
  ownerUserId: string,
  bridgeId: string,
  tentId: string,
): PiIngestIdempotencyRowDraft {
  const r = item.row as Record<string, unknown>;
  const deviceId = typeof r.device_id === "string" ? r.device_id : "";
  const metric = typeof r.metric === "string" ? r.metric : "";
  const capturedAt =
    typeof r.captured_at === "string" ? r.captured_at : "";
  if (deviceId === "") {
    throw new Error(
      "piIngestCommitPlan: sensor row is missing device_id; cannot build idempotency row",
    );
  }
  if (metric === "") {
    throw new Error(
      "piIngestCommitPlan: sensor row is missing metric; cannot build idempotency row",
    );
  }
  if (capturedAt === "") {
    throw new Error(
      "piIngestCommitPlan: sensor row is missing captured_at; cannot build idempotency row",
    );
  }
  return {
    user_id: ownerUserId,
    tent_id: tentId,
    bridge_id: bridgeId,
    device_id: deviceId,
    metric,
    captured_at: capturedAt,
    idempotency_key: item.idempotencyKey,
  };
}

// ----------------------------- Builder -----------------------------

/**
 * Build the deterministic commit plan for a successful pipeline result.
 *
 * Throws if the pipeline result is a failure (callers must branch on
 * `pipelineResult.ok` first).
 */
export function buildPiIngestCommitPlan(
  input: BuildPiIngestCommitPlanInput,
): PiIngestCommitPlan {
  if (!input || !input.pipelineResult) {
    throw new Error("buildPiIngestCommitPlan: input.pipelineResult is required");
  }
  if (input.pipelineResult.ok !== true) {
    throw new Error(
      "buildPiIngestCommitPlan requires a successful PiIngestPipelineResult",
    );
  }

  const plan = buildPiIngestInsertPlan(input.pipelineResult);
  const partition = partitionAgainstExistingKeys(plan, input.existingKeys);
  const summary = summarizeInsertPlanPartition(partition);

  const toInsertSensorRows: NormalizedSensorReadingDraft[] = [];
  const toInsertIdempotencyRows: PiIngestIdempotencyRowDraft[] = [];
  for (const item of partition.toInsert) {
    const row = ensureNoIdempotencyKeyOnRow(item.row);
    toInsertSensorRows.push(row);
    toInsertIdempotencyRows.push(
      toIdempotencyRow(item, plan.ownerUserId, plan.bridgeId, plan.tentId),
    );
  }

  const duplicates: PiIngestCommitPlanDuplicate[] = partition.duplicates.map(
    (d) => ({
      idempotencyKey: d.idempotencyKey,
      row: ensureNoIdempotencyKeyOnRow(d.row),
    }),
  );

  return {
    ownerUserId: plan.ownerUserId,
    bridgeId: plan.bridgeId,
    tentId: plan.tentId,
    toInsertSensorRows,
    toInsertIdempotencyRows,
    duplicates,
    summary,
  };
}
