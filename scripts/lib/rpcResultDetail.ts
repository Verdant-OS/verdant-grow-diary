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

function clipString(value: string): string {
  return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value;
}

/**
 * Strings are clipped to MAX_FIELD_CHARS. Other values stay structured when
 * their JSON form fits; otherwise they are replaced by their clipped JSON text.
 */
function clip(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return clipString(value);
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return clipString(String(value));
  }
  if (json === undefined) return clipString(String(value));
  return json.length > MAX_FIELD_CHARS ? clipString(json) : value;
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

export type RpcResultDetail = {
  kind: string;
  status: unknown;
  statusText: unknown;
  error: { code: unknown; message: unknown; details: unknown; hint: unknown } | null;
  data: unknown;
};

/** Object form, for embedding several results in one JSON detail. */
export function rpcResultDetail(result: RpcResultLike): RpcResultDetail {
  const error = result?.error ?? null;
  return {
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
    data: clip(result?.data),
  };
}

export function describeRpcResult(result: RpcResultLike): string {
  return JSON.stringify(rpcResultDetail(result));
}
