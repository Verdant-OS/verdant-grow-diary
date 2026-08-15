/**
 * edgeFunctionError — read sanitized discriminators our Edge Functions return
 * on non-2xx responses (`error`, or the narrow entitlement `reason` shape).
 *
 * WHY THIS EXISTS: supabase-js throws `FunctionsHttpError(response)` for any
 * non-2xx (see @supabase/functions-js FunctionsClient), so `error.context`
 * **is the raw `Response`** — not a `{ status, body }` envelope. Reading
 * `context.body` hands you a `ReadableStream`, which is an object with no
 * `error` key, so hand-rolled extraction silently yields `null` forever and
 * whole error branches quietly die.
 *
 * Always `.clone()` before reading: a response body stream can only be
 * consumed once, and the caller may still want it.
 *
 * Never throws — an unreadable body is `null`, so callers keep their own
 * status-based fallbacks instead of collapsing into a generic catch.
 */

async function readEdgeFunctionJson(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof (ctx as Response).json !== "function") return null;
  try {
    const body = (await (ctx as Response).clone().json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    // Not a JSON body (HTML gateway page, empty response, already consumed).
    return null;
  }
}

/**
 * Best-effort read of the `error` string from a failed `functions.invoke`
 * error. Returns null when there is no JSON body, no `error` string, or the
 * body has already been consumed.
 */
export async function readEdgeFunctionErrorCode(error: unknown): Promise<string | null> {
  const body = await readEdgeFunctionJson(error);
  return body && typeof body.error === "string" ? body.error : null;
}

export interface EdgeFunctionReasonPayload {
  reason: string;
  display_plan_id: string | null;
}

/**
 * Read the narrow denial shape used by entitlement functions. Raw response
 * fields are never returned, and unreadable or malformed bodies stay null so
 * callers retain their fail-closed fallback.
 */
export async function readEdgeFunctionReasonPayload(
  error: unknown,
): Promise<EdgeFunctionReasonPayload | null> {
  const body = await readEdgeFunctionJson(error);
  if (!body || typeof body.reason !== "string") return null;
  return {
    reason: body.reason,
    display_plan_id: typeof body.display_plan_id === "string" ? body.display_plan_id : null,
  };
}
