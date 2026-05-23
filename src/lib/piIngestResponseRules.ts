/**
 * piIngestResponseRules — pure HTTP response shaping for the future
 * `pi-ingest-readings` Edge Function.
 *
 * STRICT SCOPE:
 *  - Pure TypeScript. No Supabase. No React. No I/O. No network. No writes.
 *  - Maps a PiIngestPipelineResult (plus, on success, the caller-provided
 *    insert counts) into the HTTP response shape defined by
 *    docs/pi-ingest-readings-contract.md.
 *  - Does NOT perform inserts. Does NOT decide auth. Does NOT track state.
 */

import type {
  PiIngestPipelineResult,
  PiIngestPipelineStage,
} from "./piIngestPipeline";

// ----------------------------- Types -----------------------------

export interface PiIngestResponseHeaders {
  readonly [name: string]: string;
}

export interface PiIngestSuccessBody {
  readonly ok: true;
  readonly inserted: number;
  readonly rejected: number;
}

export interface PiIngestFailureBody {
  readonly ok: false;
  readonly error: string;
  readonly message: string;
}

export interface PiIngestHttpResponse<TBody> {
  readonly status: number;
  readonly headers: PiIngestResponseHeaders;
  readonly body: TBody;
}

export interface PiIngestSuccessInput {
  readonly inserted: number;
  readonly rejected?: number;
}

// ----------------------------- Helpers -----------------------------

function statusForStage(stage: PiIngestPipelineStage): number {
  switch (stage) {
    case "auth":
      return 401;
    case "abuse_guard":
      return 429;
    case "envelope":
    case "normalization":
    case "batch_scope":
      return 400;
    default:
      return 400;
  }
}

function firstIssueCode(
  result: Extract<PiIngestPipelineResult, { ok: false }>,
): string {
  return result.issues[0]?.code ?? `${result.stage}_error`;
}

function firstIssueMessage(
  result: Extract<PiIngestPipelineResult, { ok: false }>,
): string {
  return result.issues[0]?.message ?? `pi-ingest ${result.stage} failure`;
}

function retryAfterSeconds(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 1000));
}

function isNonNegativeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

// ----------------------------- API -----------------------------

export function shapePiIngestSuccessResponse(
  input: PiIngestSuccessInput,
): PiIngestHttpResponse<PiIngestSuccessBody> {
  if (!isNonNegativeInt(input.inserted)) {
    throw new Error("shapePiIngestSuccessResponse: inserted must be a non-negative integer");
  }
  const rejected = input.rejected ?? 0;
  if (!isNonNegativeInt(rejected)) {
    throw new Error("shapePiIngestSuccessResponse: rejected must be a non-negative integer");
  }
  return {
    status: 200,
    headers: {},
    body: { ok: true, inserted: input.inserted, rejected },
  };
}

export function shapePiIngestFailureResponse(
  result: Extract<PiIngestPipelineResult, { ok: false }>,
): PiIngestHttpResponse<PiIngestFailureBody> {
  const status = statusForStage(result.stage);
  const headers: Record<string, string> = {};
  if (status === 429) {
    const ms =
      result.retryAfterMs ??
      result.issues.find((i) => i.retryAfterMs !== undefined)?.retryAfterMs ??
      0;
    headers["Retry-After"] = String(retryAfterSeconds(ms));
  }
  return {
    status,
    headers,
    body: {
      ok: false,
      error: firstIssueCode(result),
      message: firstIssueMessage(result),
    },
  };
}

export function shapePiIngestResponse(input: {
  readonly result: PiIngestPipelineResult;
  readonly inserted?: number;
  readonly rejected?: number;
}):
  | PiIngestHttpResponse<PiIngestSuccessBody>
  | PiIngestHttpResponse<PiIngestFailureBody> {
  if (input.result.ok === true) {
    if (input.inserted === undefined) {
      throw new Error(
        "shapePiIngestResponse: inserted count is required on success",
      );
    }
    return shapePiIngestSuccessResponse({
      inserted: input.inserted,
      rejected: input.rejected ?? 0,
    });
  }
  return shapePiIngestFailureResponse(input.result);
}
