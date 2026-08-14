/**
 * edgeFunctionError — read the sanitized `{ error: "..." }` discriminator our
 * edge functions return on a non-2xx response.
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

/**
 * Best-effort read of the `error` string from a failed `functions.invoke`
 * error. Returns null when there is no JSON body, no `error` string, or the
 * body has already been consumed.
 */
export async function readEdgeFunctionErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof (ctx as Response).json !== "function") return null;
  try {
    const body = (await (ctx as Response).clone().json()) as { error?: unknown } | null;
    return body && typeof body.error === "string" ? body.error : null;
  } catch {
    // Not a JSON body (HTML gateway page, empty response, already consumed).
    return null;
  }
}
