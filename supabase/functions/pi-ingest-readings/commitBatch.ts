// Server-only commit helper for pi-ingest-readings.
//
// Wraps the atomic Postgres RPC `pi_ingest_commit_batch` behind a
// narrow, injectable client interface so the Edge Function can later
// commit normalized readings + idempotency keys in a single transaction.
//
// This module:
//   - MUST run only inside the Edge Function path.
//   - MUST NOT be imported from anything under src/.
//   - MUST NOT accept a client-provided owner id (caller passes the
//     server-resolved tent owner as `userId`).
//   - MUST NOT SELECT/INSERT/UPDATE/DELETE directly; it only calls the
//     designated RPC.
//   - MUST NOT log idempotency keys, sensor values, raw payloads, or
//     raw RPC error messages.
//   - Is NOT yet wired into index.ts.

export const PI_INGEST_COMMIT_BATCH_RPC = "pi_ingest_commit_batch" as const;

export type PiIngestCommitBatchResponse = {
  data: unknown;
  error: { message: string } | null;
};

export type PiIngestCommitBatchRpcArgs = {
  p_user_id: string;
  p_bridge_id: string;
  p_tent_id: string;
  p_rows: ReadonlyArray<Record<string, unknown>>;
};

export type PiIngestCommitBatchClient = {
  rpc: (
    fn: string,
    args: PiIngestCommitBatchRpcArgs,
  ) => Promise<PiIngestCommitBatchResponse>;
};

export type PiIngestCommitBatchSensorDraft = {
  tent_id: string;
  metric: string;
  value: number;
  source: "pi_bridge";
  quality?: string | null;
  device_id?: string | null;
  captured_at?: string | null;
  raw_payload?: unknown;
};

export type PiIngestCommitBatchIdempotencyDraft = {
  tent_id: string;
  bridge_id: string;
  device_id: string;
  metric: string;
  captured_at: string;
  idempotency_key: string;
};

export type PiIngestCommitBatchRow = {
  idempotencyKey: string;
  sensor: PiIngestCommitBatchSensorDraft;
  idempotency: PiIngestCommitBatchIdempotencyDraft;
};

export type PiIngestCommitBatchInput = {
  userId: string;
  bridgeId: string;
  tentId: string;
  rows: ReadonlyArray<PiIngestCommitBatchRow>;
};

export type PiIngestCommitBatchFailureReason =
  | "missing_input"
  | "commit_failed";

export type PiIngestCommitBatchResult =
  | { ok: true; inserted: number; rejected: number }
  | {
      ok: false;
      reason: PiIngestCommitBatchFailureReason;
      message: string;
    };

const FAILURE_MESSAGES: Record<PiIngestCommitBatchFailureReason, string> = {
  missing_input: "missing or invalid commit input",
  commit_failed: "pi-ingest commit failed",
};

function failure(
  reason: PiIngestCommitBatchFailureReason,
): PiIngestCommitBatchResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateRow(row: PiIngestCommitBatchRow): boolean {
  if (!row || typeof row !== "object") return false;
  if (!isNonEmptyString(row.idempotencyKey)) return false;
  const s = row.sensor;
  if (!s || typeof s !== "object") return false;
  if (!isNonEmptyString(s.tent_id)) return false;
  if (!isNonEmptyString(s.metric)) return false;
  if (!isFiniteNumber(s.value)) return false;
  if (s.source !== "pi_bridge") return false;
  const k = row.idempotency;
  if (!k || typeof k !== "object") return false;
  if (!isNonEmptyString(k.tent_id)) return false;
  if (!isNonEmptyString(k.bridge_id)) return false;
  if (!isNonEmptyString(k.device_id)) return false;
  if (!isNonEmptyString(k.metric)) return false;
  if (!isNonEmptyString(k.captured_at)) return false;
  if (!isNonEmptyString(k.idempotency_key)) return false;
  if (k.idempotency_key !== row.idempotencyKey) return false;
  return true;
}

function buildRpcRow(row: PiIngestCommitBatchRow): Record<string, unknown> {
  const s = row.sensor;
  const k = row.idempotency;
  return {
    idempotency_key: k.idempotency_key,
    device_id: k.device_id,
    metric: s.metric,
    captured_at: k.captured_at,
    value: s.value,
    source: "pi_bridge",
    quality: s.quality ?? "ok",
    raw_payload: s.raw_payload ?? null,
  };
}

/**
 * Call the atomic `pi_ingest_commit_batch` RPC with the supplied
 * normalized + idempotency drafts. Returns counts on success.
 *
 * Fail-closed:
 *   - Any missing/invalid id, missing client, empty/invalid rows
 *     → `missing_input`.
 *   - Thrown error / RPC error / malformed response
 *     → `commit_failed` (no raw error text propagated).
 */
export async function commitPiIngestBatch(
  client: PiIngestCommitBatchClient,
  input: PiIngestCommitBatchInput,
): Promise<PiIngestCommitBatchResult> {
  if (!input || typeof input !== "object") return failure("missing_input");
  if (!isNonEmptyString(input.userId)) return failure("missing_input");
  if (!isNonEmptyString(input.bridgeId)) return failure("missing_input");
  if (!isNonEmptyString(input.tentId)) return failure("missing_input");
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    return failure("missing_input");
  }
  for (const row of input.rows) {
    if (!validateRow(row)) return failure("missing_input");
    if (row.sensor.tent_id !== input.tentId) return failure("missing_input");
    if (row.idempotency.tent_id !== input.tentId) {
      return failure("missing_input");
    }
    if (row.idempotency.bridge_id !== input.bridgeId) {
      return failure("missing_input");
    }
  }
  if (!client || typeof client.rpc !== "function") {
    return failure("commit_failed");
  }

  const p_rows = input.rows.map(buildRpcRow);

  let response: PiIngestCommitBatchResponse;
  try {
    response = await client.rpc(PI_INGEST_COMMIT_BATCH_RPC, {
      p_user_id: input.userId,
      p_bridge_id: input.bridgeId,
      p_tent_id: input.tentId,
      p_rows,
    });
  } catch {
    return failure("commit_failed");
  }

  if (!response || response.error) return failure("commit_failed");

  const data = response.data;
  let row: Record<string, unknown> | null = null;
  if (Array.isArray(data)) {
    if (data.length !== 1 || !isPlainObject(data[0])) {
      return failure("commit_failed");
    }
    row = data[0];
  } else if (isPlainObject(data)) {
    row = data;
  } else {
    return failure("commit_failed");
  }

  const inserted = row.inserted;
  const rejected = row.rejected;
  if (
    typeof inserted !== "number" ||
    !Number.isFinite(inserted) ||
    inserted < 0 ||
    typeof rejected !== "number" ||
    !Number.isFinite(rejected) ||
    rejected < 0
  ) {
    return failure("commit_failed");
  }

  return { ok: true, inserted, rejected };
}
