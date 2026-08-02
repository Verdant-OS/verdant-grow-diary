/**
 * Helpers for wiring TanStack Query / caller AbortSignals into Supabase
 * PostgREST builders. Abort must never be mapped to empty success data
 * (e.g. "no plants") — rethrow so React Query treats the attempt as cancelled.
 *
 * Classification is intentionally narrow: do not treat generic Postgres
 * messages like "current transaction is aborted" as client cancellation.
 */

type AbortableBuilder<T> = T & {
  abortSignal?: (signal: AbortSignal) => T;
};

/**
 * Attach an AbortSignal to a PostgREST builder when the method exists.
 * Real @supabase/postgrest-js always provides .abortSignal().
 * Incomplete vitest fluent doubles may omit it — in that case the chain
 * continues without transport abort (cache cancel still applies). Production
 * never hits the missing-method path.
 */
export function applyPostgrestAbortSignal<T>(builder: T, signal: AbortSignal | undefined): T {
  if (!signal) return builder;
  const b = builder as AbortableBuilder<T>;
  if (typeof b.abortSignal === "function") {
    return b.abortSignal(signal);
  }
  return builder;
}

function readStringField(error: object, key: string): string | null {
  if (!(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** True when an error is a local abort (fetch AbortError or PostgREST abort). */
export function isSupabaseAbortError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;

  const name = readStringField(error, "name");
  if (name === "AbortError" || name === "TimeoutError") return true;

  const code = readStringField(error, "code");
  if (code === "ABORT_ERR") return true;
  // Postgres SQLSTATE for aborted transaction — NOT client cancellation.
  if (code === "25P02") return false;

  const hint = readStringField(error, "hint");
  if (hint && /aborted locally via the provided AbortSignal/i.test(hint)) {
    return true;
  }

  const message = readStringField(error, "message");
  if (message) {
    // Fetch / DOMException style only — avoid "transaction is aborted" etc.
    if (/^The (operation|user) was aborted/i.test(message)) return true;
    if (/aborted due to timeout/i.test(message)) return true;
    if (/The request was aborted/i.test(message)) return true;
  }

  // status 0 + explicit abort wording (PostgREST abort payload examples)
  const status = (error as { status?: unknown }).status;
  if (status === 0 && message && /abort/i.test(message)) {
    if (/transaction is aborted/i.test(message)) return false;
    return /request was aborted|operation was aborted|user aborted/i.test(message);
  }

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
  if (error instanceof DOMException && error.name === "TimeoutError") throw error;
  if (error instanceof Error && error.name === "AbortError") throw error;
  if (error instanceof Error && error.name === "TimeoutError") throw error;
  const abort = new DOMException("The operation was aborted.", "AbortError");
  throw abort;
}
