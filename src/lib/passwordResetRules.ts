// Pure rules for the Verdant password reset flow.
// No I/O, no Supabase, no logging — safe to import from tests and UI.
//
// Safety:
//  - never echoes secrets, tokens, recovery URLs, or passwords
//  - never reveals account existence (callers use the generic success copy)

export const MIN_PASSWORD_LENGTH = 8;

export const GENERIC_RESET_REQUEST_SUCCESS =
  "If an account exists for that email, we'll send a password reset link.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidation =
  | { ok: true; email: string }
  | { ok: false; reason: "empty" | "invalid"; message: string };

export function validateResetEmail(raw: string | null | undefined): EmailValidation {
  const email = (raw ?? "").trim();
  if (!email) {
    return { ok: false, reason: "empty", message: "Enter the email for your Verdant account." };
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, reason: "invalid", message: "Enter a valid email address." };
  }
  return { ok: true, email };
}

export type NewPasswordValidation =
  | { ok: true; password: string }
  | { ok: false; reason: "too_short" | "mismatch" | "empty"; message: string };

export function validateNewPassword(
  password: string | null | undefined,
  confirm: string | null | undefined,
): NewPasswordValidation {
  const p = password ?? "";
  const c = confirm ?? "";
  if (!p) {
    return { ok: false, reason: "empty", message: "Enter a new password." };
  }
  if (p.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: "too_short",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (p !== c) {
    return { ok: false, reason: "mismatch", message: "Passwords do not match." };
  }
  return { ok: true, password: p };
}

export function buildResetRedirectUrl(origin: string): string {
  // Always send users to the in-app reset page on the same origin.
  // Never embed tokens here — Supabase appends the recovery params itself.
  const trimmed = origin.replace(/\/+$/, "");
  return `${trimmed}/reset-password`;
}
