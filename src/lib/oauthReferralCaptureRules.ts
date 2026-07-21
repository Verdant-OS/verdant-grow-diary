/**
 * oauthReferralCaptureRules — sessionStorage bridge for `?ref=` through OAuth.
 *
 * Managed OAuth does not carry signUp options.data into auth.users, so the
 * referral code cannot ride raw_user_meta_data for Google signups. Mirror of
 * oauthSignupAcquisitionRules: persist the sanitized code to a namespaced,
 * versioned, TTL-bounded sessionStorage key before redirecting, and let the
 * post-session flush (referralRedeem) hand it to the redeem-referral edge
 * function, which re-verifies everything server-side.
 */

import { sanitizeReferralCode } from "@/lib/referralCaptureRules";

export const OAUTH_REFERRAL_STORAGE_KEY = "verdant:oauth-referral:v1" as const;
export const OAUTH_REFERRAL_TTL_MS = 30 * 60 * 1_000;

interface PendingOAuthReferral {
  code: string;
  startedAt: number;
}

function removePending(storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(OAUTH_REFERRAL_STORAGE_KEY);
  } catch {
    // Blocked browser storage must never break authentication.
  }
}

export function resolveOAuthReferralSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function savePendingOAuthReferral(
  code: unknown,
  storage: Storage | null = resolveOAuthReferralSessionStorage(),
  now = Date.now(),
): boolean {
  const sanitized = sanitizeReferralCode(code);
  if (!sanitized || !storage || !Number.isFinite(now) || now < 0) return false;
  try {
    const value: PendingOAuthReferral = { code: sanitized, startedAt: Math.floor(now) };
    storage.setItem(OAUTH_REFERRAL_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingOAuthReferral(
  storage: Storage | null = resolveOAuthReferralSessionStorage(),
): void {
  removePending(storage);
}

export function readPendingOAuthReferral(
  storage: Storage | null = resolveOAuthReferralSessionStorage(),
  now = Date.now(),
): string | null {
  if (!storage || !Number.isFinite(now) || now < 0) return null;
  try {
    const raw = storage.getItem(OAUTH_REFERRAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingOAuthReferral>;
    const code = sanitizeReferralCode(parsed.code);
    const valid =
      code !== null &&
      typeof parsed.startedAt === "number" &&
      Number.isFinite(parsed.startedAt) &&
      parsed.startedAt >= 0 &&
      now >= parsed.startedAt &&
      now - parsed.startedAt <= OAUTH_REFERRAL_TTL_MS;
    if (!valid) {
      removePending(storage);
      return null;
    }
    return code;
  } catch {
    removePending(storage);
    return null;
  }
}
