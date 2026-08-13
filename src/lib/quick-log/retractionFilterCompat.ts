/**
 * retractionFilterCompat — deploy-order safety for the retracted_at reader
 * filter (issue #786).
 *
 * The client can reach production before migration 20260811090000 adds
 * diary_entries.retracted_at. PostgREST rejects a filter on an unknown
 * column (Postgres 42703), which would turn page-critical diary reads into
 * hard failures. This helper runs the query with the filter and, on exactly
 * that error, retries once without it — pre-migration behavior degrades to
 * the previous "show everything" semantics instead of breaking the page.
 *
 * Pure control flow; no Supabase import. The caller supplies a builder that
 * applies (or omits) the filter, so the literal `.is("retracted_at", null)`
 * stays at the call site where the reader-contract test asserts it.
 */

export interface RetractionCompatError {
  code?: string | null;
  message?: string | null;
}

export interface RetractionCompatResult<T> {
  data: T | null;
  error: RetractionCompatError | null;
  count?: number | null;
}

/** True only for "column diary_entries.retracted_at does not exist". */
export function isMissingRetractedColumnError(
  error: RetractionCompatError | null | undefined,
): boolean {
  if (!error) return false;
  const message = typeof error.message === "string" ? error.message : "";
  return error.code === "42703" && message.includes("retracted_at");
}

/**
 * Run `build(true)` (filtered). If the ONLY failure is the missing
 * retracted_at column, run `build(false)` (unfiltered) once and return that.
 * Any other error is returned unchanged.
 */
export async function selectWithRetractionCompat<R extends RetractionCompatResult<unknown>>(
  build: (withRetractionFilter: boolean) => PromiseLike<R>,
): Promise<R> {
  const filtered = await build(true);
  if (!isMissingRetractedColumnError(filtered.error)) return filtered;
  return await build(false);
}
