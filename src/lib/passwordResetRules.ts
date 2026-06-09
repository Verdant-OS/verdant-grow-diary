// Pure rules for the Verdant password reset flow.
// No I/O, no Supabase, no logging — safe to import from tests and UI.
//
// Safety:
//  - never echoes secrets, tokens, recovery URLs, or passwords
//  - never reveals account existence (callers use the generic success copy)
//  - all checks here run locally in the browser; we never claim server
//    certainty, breach-database lookups, or "strong password" guarantees.

export const MIN_PASSWORD_LENGTH = 8;

export const GENERIC_RESET_REQUEST_SUCCESS =
  "If an account exists for that email, we'll send a password reset link.";

// Friendly, non-enumerating error copy. UI should prefer these over raw
// Supabase error messages so we never leak whether a given email is
// registered, banned, throttled-by-user, etc.
export const SIGN_IN_FRIENDLY_ERROR =
  "We couldn't sign you in. Check your email and password, then try again.";

export const SIGN_UP_FRIENDLY_ERROR =
  "We couldn't create that account. Check the email and password, then try again.";

export const FORGOT_RATE_LIMIT_ERROR =
  "We couldn't send the reset email right now. Try again in a few minutes.";

export const RESET_FAILED_ERROR =
  "We couldn't update your password. The link may be expired, or you may need to request a new reset email.";

export const PASSWORD_REQUIREMENTS_HELPER_COPY =
  "Password requirements are checked locally before submit.";

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
  | { ok: false; reason: "too_short" | "mismatch" | "empty" | "missing_letter" | "missing_number"; message: string };

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
  if (!/[A-Za-z]/.test(p)) {
    return { ok: false, reason: "missing_letter", message: "Password must include a letter." };
  }
  if (!/[0-9]/.test(p)) {
    return { ok: false, reason: "missing_number", message: "Password must include a number." };
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

// Local-only password requirement statuses. We deliberately do NOT claim
// "strong", "secure", "server approved", "guaranteed", or "breached password
// checked" anywhere in this module — those checks do not exist here.
export type PasswordRequirementKey =
  | "minLength"
  | "hasLetter"
  | "hasNumber"
  | "matchesConfirm";

export interface PasswordRequirement {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
}

export interface PasswordRequirementStatus {
  requirements: PasswordRequirement[];
  allMet: boolean;
}

export function getPasswordRequirementStatus(
  password: string | null | undefined,
  confirmPassword: string | null | undefined,
): PasswordRequirementStatus {
  const p = password ?? "";
  const c = confirmPassword ?? "";
  const requirements: PasswordRequirement[] = [
    {
      key: "minLength",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: p.length >= MIN_PASSWORD_LENGTH,
    },
    { key: "hasLetter", label: "Includes a letter", met: /[A-Za-z]/.test(p) },
    { key: "hasNumber", label: "Includes a number", met: /[0-9]/.test(p) },
    {
      key: "matchesConfirm",
      label: "Passwords match",
      met: p.length > 0 && p === c,
    },
  ];
  return { requirements, allMet: requirements.every((r) => r.met) };
}
