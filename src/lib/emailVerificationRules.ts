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
