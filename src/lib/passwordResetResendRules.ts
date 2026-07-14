// Local-UX cooldown helpers for the "Resend reset email" button on the
// forgot-password success screen.
//
// SAFETY:
//  - This is presentation-only. Server lockout is the source of truth.
//  - We do not claim certainty about server-side rate-limit state.
//  - We do not store cooldown in localStorage. Callers keep it in component
//    state so it resets when the page reloads.
//  - These helpers never read or write tokens, sessions, or emails.

import {
  canResendVerification,
  verificationCooldownRemainingMs,
  formatVerificationCooldown,
  DEFAULT_VERIFICATION_COOLDOWN_MS,
  VERIFICATION_COOLDOWN_HINT,
} from "@/lib/emailVerificationRules";

export const DEFAULT_RESET_EMAIL_COOLDOWN_MS = DEFAULT_VERIFICATION_COOLDOWN_MS;

export const RESET_RESEND_COOLDOWN_HINT = VERIFICATION_COOLDOWN_HINT;

export const RESET_RESEND_SUCCESS_MESSAGE =
  "If an account exists for that email, we'll send another password reset link.";

export const RESET_RESEND_FAILURE_MESSAGE =
  "We couldn't resend the reset email right now. Try again in a few minutes.";

export const canResendResetEmail = canResendVerification;
export const resetEmailCooldownRemainingMs = verificationCooldownRemainingMs;
export const formatResetEmailCooldown = formatVerificationCooldown;

export function buildResetResendLabel(
  isBusy: boolean,
  cooldownRemainingMs: number,
): string {
  if (isBusy) return "Sending reset email…";
  if (cooldownRemainingMs > 0) return formatResetEmailCooldown(cooldownRemainingMs);
  return "Resend reset email";
}
