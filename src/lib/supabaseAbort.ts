/**
 * Helpers for wiring TanStack Query / caller AbortSignals into Supabase
 * PostgREST builders. Abort must never be mapped to empty success data
 * (e.g. "no plants") — rethrow so React Query treats the attempt as cancelled.
 */

/** True when an error is a local abort (fetch AbortError or PostgREST abort). */
export function isSupabaseAbortError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const e = error as { name?: unknown; code?: unknown; message?: unknown; hint?: unknown };
  if (e.name === "AbortError" || e.code === "ABORT_ERR") return true;
  if (typeof e.message === "string" && /aborted|abort/i.test(e.message)) return true;
  if (typeof e.hint === "string" && /AbortSignal/i.test(e.hint)) return true;
  return false;
}

/**
 * If the builder returned an abort-shaped error object instead of throwing,
 * rethrow a standard AbortError so React Query cancel semantics apply.
 * Non-abort errors are returned unchanged for existing throw/map handling.
 */
export function rethrowIfAbortError(error: unknown): void {
  if (!isSupabaseAbortError(error)) return;
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  if (error instanceof Error && error.name === "AbortError") throw error;
  const abort = new DOMException("The operation was aborted.", "AbortError");
  throw abort;
}
