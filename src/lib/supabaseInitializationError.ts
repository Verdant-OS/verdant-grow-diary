export const SUPABASE_INITIALIZATION_ERROR_CODE = "SUPABASE_INIT_FAILED" as const;

/**
 * Stable classification boundary for failures that occur while constructing
 * the shared Supabase client. The public message is intentionally generic;
 * the original cause stays available to server logs only.
 */
export class SupabaseInitializationError extends Error {
  readonly code = SUPABASE_INITIALIZATION_ERROR_CODE;

  constructor(cause: unknown) {
    super("Supabase client initialization failed.", { cause });
    this.name = "SupabaseInitializationError";
  }
}

export function isSupabaseInitializationError(
  error: unknown,
): error is SupabaseInitializationError {
  if (error instanceof SupabaseInitializationError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.code === SUPABASE_INITIALIZATION_ERROR_CODE ||
    candidate.name === "SupabaseInitializationError"
  );
}
