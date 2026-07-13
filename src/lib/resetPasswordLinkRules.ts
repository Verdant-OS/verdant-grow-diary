/**
 * Reset-password link diagnosis rules.
 *
 * Pure classifier for the state the /reset-password page lands in. Turns the
 * raw URL (hash + query) and a boolean "session present?" flag into a discrete
 * status so the presenter can show a specific, actionable message and a way to
 * restart the flow. No I/O. No auth calls. No routing.
 *
 * Supabase surfaces recovery-link errors two ways:
 *   1. Legacy hash flow: `#error=...&error_code=otp_expired&error_description=...`
 *   2. PKCE / newer flow: `?error=...&error_code=...&error_description=...`
 * We inspect both so a user forwarded through either path sees the same copy.
 */

export type ResetLinkStatus =
  | "ready" // Recovery session established — user can set a new password.
  | "expired" // Link was valid but the OTP/code expired.
  | "invalid" // Link was tampered with, already used, or otherwise unusable.
  | "missing"; // User navigated to /reset-password directly with no link.

export interface ResetLinkDiagnosis {
  status: ResetLinkStatus;
  /** User-facing title for the state (short). */
  title: string;
  /** User-facing explanation (one sentence). */
  message: string;
  /** Call-to-action label for restarting the flow. */
  ctaLabel: string;
}

const EXPIRED_CODES = new Set(["otp_expired", "token_expired"]);

export const RESTART_FLOW_HREF = "/auth?mode=forgot";

interface ParsedParams {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

function parseFragment(hash: string | undefined | null): ParsedParams {
  const out: ParsedParams = { error: null, errorCode: null, errorDescription: null };
  if (!hash) return out;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return out;
  const params = new URLSearchParams(raw);
  out.error = params.get("error");
  out.errorCode = params.get("error_code");
  out.errorDescription = params.get("error_description");
  return out;
}

function parseQuery(search: string | undefined | null): ParsedParams {
  const out: ParsedParams = { error: null, errorCode: null, errorDescription: null };
  if (!search) return out;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  out.error = params.get("error");
  out.errorCode = params.get("error_code");
  out.errorDescription = params.get("error_description");
  return out;
}

function mergeParams(a: ParsedParams, b: ParsedParams): ParsedParams {
  return {
    error: a.error ?? b.error,
    errorCode: a.errorCode ?? b.errorCode,
    errorDescription: a.errorDescription ?? b.errorDescription,
  };
}

/**
 * Diagnose the reset-password landing state.
 *
 * @param input.hash    `window.location.hash` (may include leading `#`).
 * @param input.search  `window.location.search` (may include leading `?`).
 * @param input.hasSession Whether Supabase has an active session on this page.
 */
export function diagnoseResetLink(input: {
  hash?: string | null;
  search?: string | null;
  hasSession: boolean;
}): ResetLinkDiagnosis {
  const params = mergeParams(parseFragment(input.hash), parseQuery(input.search));

  const hasErrorSignal =
    !!params.error || !!params.errorCode || !!params.errorDescription;

  if (hasErrorSignal) {
    const code = (params.errorCode ?? "").toLowerCase();
    const desc = (params.errorDescription ?? "").toLowerCase();
    const looksExpired =
      EXPIRED_CODES.has(code) || desc.includes("expired");
    if (looksExpired) {
      return {
        status: "expired",
        title: "This reset link has expired",
        message:
          "Password reset links expire after a short time for your security. Request a new one to continue.",
        ctaLabel: "Send a new reset email",
      };
    }
    return {
      status: "invalid",
      title: "This reset link is not valid",
      message:
        "The link may have already been used or was copied incorrectly. Request a new reset email to try again.",
      ctaLabel: "Send a new reset email",
    };
  }

  if (input.hasSession) {
    return {
      status: "ready",
      title: "Reset password",
      message: "Choose a new password for your Verdant account.",
      ctaLabel: "Send a new reset email",
    };
  }

  return {
    status: "missing",
    title: "No reset link detected",
    message:
      "Open /reset-password from the email we sent you, or request a new reset email to start over.",
    ctaLabel: "Send a reset email",
  };
}
