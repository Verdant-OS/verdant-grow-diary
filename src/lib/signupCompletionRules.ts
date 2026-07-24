export type SignupCompletionDisposition = "authenticated" | "verification_required";

/**
 * Supabase returns a session for immediately authenticated signups and a
 * user-without-session when email verification is required. Missing or
 * malformed data fails closed to the verification state instead of sending
 * the grower into a protected-route bounce.
 */
export function resolveSignupCompletionDisposition(
  data: { session?: unknown | null } | null | undefined,
): SignupCompletionDisposition {
  return data?.session ? "authenticated" : "verification_required";
}
