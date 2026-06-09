// Single sanitization layer for all auth/Supabase errors that may be
// surfaced to the user on /auth and /reset-password.
//
// SAFETY:
//  - never returns raw error.message
//  - never reveals account existence, rate-limit hints, JWT/session/token
//    state, recovery URLs, or "email not confirmed" hints
//  - never logs the original error
//  - callers must NOT log error themselves; they should only display the
//    return value of sanitizeAuthError(...)
import {
  SIGN_IN_FRIENDLY_ERROR,
  SIGN_UP_FRIENDLY_ERROR,
  FORGOT_RATE_LIMIT_ERROR,
  RESET_FAILED_ERROR,
} from "@/lib/passwordResetRules";

export type AuthErrorContext =
  | "signIn"
  | "signUp"
  | "forgotPassword"
  | "resetPassword"
  | "unknown";

export const UNKNOWN_AUTH_ERROR = "Something went wrong. Try again in a moment.";

// Friendly verification-required copy. Surfaced only after a sign-in attempt
// — never on its own — so it does not enumerate account existence outside
// the attempted-login context.
export const EMAIL_VERIFICATION_REQUIRED_MESSAGE =
  "Please verify your email before signing in. Check your inbox for the verification link.";
export const RESEND_VERIFICATION_GENERIC_SUCCESS =
  "If that email is eligible, we'll send a new verification link.";
export const RESEND_VERIFICATION_GENERIC_FAILURE =
  "We couldn't send the verification email right now. Try again in a few minutes.";

const COPY: Record<AuthErrorContext, string> = {
  signIn: SIGN_IN_FRIENDLY_ERROR,
  signUp: SIGN_UP_FRIENDLY_ERROR,
  forgotPassword: FORGOT_RATE_LIMIT_ERROR,
  resetPassword: RESET_FAILED_ERROR,
  unknown: UNKNOWN_AUTH_ERROR,
};

// Phrases that must never leak through, even by accident. Kept here so the
// sanitization tests can import and assert against the same list.
export const FORBIDDEN_AUTH_ERROR_FRAGMENTS: RegExp[] = [
  /invalid login credentials/i,
  /user not found/i,
  /user already registered/i,
  /already registered/i,
  /email not confirmed/i,
  /rate limit/i,
  /\btoken\b/i,
  /\bsession\b/i,
  /\bjwt\b/i,
  /recovery/i,
  /auth ?hash/i,
  /AuthApiError/i,
];

export type AuthErrorClass = "emailNotConfirmed" | "unknown";

/**
 * Internal classifier for auth errors. Looks at the underlying error
 * shape/strings to decide which friendly UI branch to render. The classifier
 * itself never returns the raw string — only an opaque tag. UI must still
 * source all visible copy from sanitizeAuthError / approved constants.
 */
export function classifyAuthError(error: unknown): AuthErrorClass {
  if (!error || typeof error !== "object") return "unknown";
  const anyErr = error as { message?: unknown; code?: unknown; error_description?: unknown; name?: unknown };
  const parts: string[] = [];
  for (const v of [anyErr.message, anyErr.code, anyErr.error_description, anyErr.name]) {
    if (typeof v === "string") parts.push(v);
  }
  const blob = parts.join(" | ").toLowerCase();
  if (!blob) return "unknown";
  if (
    blob.includes("email not confirmed") ||
    blob.includes("email_not_confirmed") ||
    blob.includes("not confirmed") ||
    blob.includes("email-not-confirmed")
  ) {
    return "emailNotConfirmed";
  }
  return "unknown";
}


/**
 * Map any error (Supabase AuthError, generic Error, unknown object, null) to
 * an approved friendly copy string for the given UI context. Never returns
 * raw error fields.
 */
export function sanitizeAuthError(
  context: AuthErrorContext,
  _error: unknown,
): string {
  // We deliberately ignore _error's shape. The whole point is that no
  // attacker-controlled or server-controlled string flows to the UI.
  const ctx: AuthErrorContext =
    context === "signIn" ||
    context === "signUp" ||
    context === "forgotPassword" ||
    context === "resetPassword"
      ? context
      : "unknown";
  return COPY[ctx];
}
