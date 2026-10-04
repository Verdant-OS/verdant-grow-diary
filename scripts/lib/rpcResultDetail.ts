/**
 * Format a supabase-js RPC result for harness failure output.
 *
 * supabase-js resolves `data: null` for every non-2xx PostgREST/Kong response,
 * for transport failures (status 0), and for a 404 with an empty body, which it
 * rewrites to `204 No Content` with `error: null`. Printing only `data` therefore
 * turns all of those into an indistinguishable "null". This keeps the HTTP
 * status, the PostgREST error fields and the data together so a failing check
 * names the real failure. Pure: no env reads, no I/O.
 */
export type RpcResultLike =
  | {
      data?: unknown;
      error?: {
        code?: unknown;
        message?: unknown;
        details?: unknown;
        hint?: unknown;
      } | null;
      status?: unknown;
      statusText?: unknown;
    }
  | null
  | undefined;

const MAX_FIELD_CHARS = 500;

function clip(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value;
}

export function classifyRpcResult(result: RpcResultLike): string {
  if (!result) return "no_result";
  const status = typeof result.status === "number" ? result.status : null;
  if (result.error) return status === 0 ? "transport_error" : "http_error";
  if (result.data === null || result.data === undefined) {
    // postgrest-js rewrites a 404 with an empty body to 204 / error null.
    if (status === 204) return "empty_body_204_or_rewritten_404";
    return "null_data_without_error";
  }
  return "ok_data";
}

export function describeRpcResult(result: RpcResultLike): string {
  const error = result?.error ?? null;
  return JSON.stringify({
    kind: classifyRpcResult(result),
    status: result?.status ?? null,
    statusText: result?.statusText ?? null,
    error: error
      ? {
          code: clip(error.code),
          message: clip(error.message),
          details: clip(error.details),
          hint: clip(error.hint),
        }
      : null,
    data: result?.data ?? null,
  });
}
