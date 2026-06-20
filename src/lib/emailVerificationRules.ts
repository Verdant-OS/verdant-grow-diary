// Local-UX cooldown helpers for the "Resend verification email" button.
//
// SAFETY:
//  - This is presentation-only. Server lockout is the source of truth.
//  - We do not claim certainty about server-side rate-limit state.
//  - We do not store cooldown in localStorage by default. Callers may keep
//    it in component state.
//  - These helpers never read or write tokens, sessions, or emails.
export const DEFAULT_VERIFICATION_COOLDOWN_MS = 60_000;

export const VERIFICATION_COOLDOWN_HINT =
  "For safety, wait a moment before requesting another verification email.";

function toFiniteNumber(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n;
}

export function canResendVerification(
  now: unknown,
  lastAttemptAt: unknown,
  cooldownMs: number = DEFAULT_VERIFICATION_COOLDOWN_MS,
): boolean {
  const safeCooldown =
    typeof cooldownMs === "number" && Number.isFinite(cooldownMs) && cooldownMs >= 0
      ? cooldownMs
      : DEFAULT_VERIFICATION_COOLDOWN_MS;
  const last = toFiniteNumber(lastAttemptAt);
  if (last === null) return true;
  const n = toFiniteNumber(now);
  if (n === null) return true;
  return n - last >= safeCooldown;
}

export function verificationCooldownRemainingMs(
  now: unknown,
  lastAttemptAt: unknown,
  cooldownMs: number = DEFAULT_VERIFICATION_COOLDOWN_MS,
): number {
  const safeCooldown =
    typeof cooldownMs === "number" && Number.isFinite(cooldownMs) && cooldownMs >= 0
      ? cooldownMs
      : DEFAULT_VERIFICATION_COOLDOWN_MS;
  const last = toFiniteNumber(lastAttemptAt);
  const n = toFiniteNumber(now);
  if (last === null || n === null) return 0;
  const remaining = safeCooldown - (n - last);
  return remaining > 0 ? remaining : 0;
}

export function formatVerificationCooldown(msRemaining: unknown): string {
  const ms = toFiniteNumber(msRemaining) ?? 0;
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `Resend available in ${seconds}s`;
}

/**
 * Returns true when the given user object exists but appears to have an
 * unverified email. Safe with mocked/partial user shapes. Never throws,
 * never reads tokens/sessions. Fails CLOSED (treats unknown as pending) so
 * UI errs on the side of showing the verification banner rather than
 * exposing private grow data to a not-yet-verified account.
 *
 * Verified signal sources accepted (any one is enough):
 *   user.email_confirmed_at  — Supabase canonical
 *   user.confirmed_at        — legacy
 *   user.user_metadata.email_verified === true
 */
export function isEmailVerificationPending(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const u = user as {
    email?: unknown;
    email_confirmed_at?: unknown;
    confirmed_at?: unknown;
    user_metadata?: { email_verified?: unknown } | null;
  };
  // No email at all → can't be "pending verification of an email".
  if (typeof u.email !== "string" || u.email.length === 0) return false;
  if (typeof u.email_confirmed_at === "string" && u.email_confirmed_at.length > 0) return false;
  if (typeof u.confirmed_at === "string" && u.confirmed_at.length > 0) return false;
  if (u.user_metadata && u.user_metadata.email_verified === true) return false;
  return true;
}

// Banner copy shown on protected pages when the signed-in user still needs
// to verify their email. Generic; never reveals server-side rate-limit state
// or whether the email exists elsewhere.
export const VERIFICATION_PENDING_BANNER_MESSAGE =
  "Verify your email to finish setting up Verdant. Some protected grow-room tools stay limited until verification is complete.";
