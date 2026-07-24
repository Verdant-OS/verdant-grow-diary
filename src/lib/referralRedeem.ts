/**
 * referralRedeem — fire the verified referral conversion once a CONFIRMED
 * authenticated session exists.
 *
 * Mirrors flushPendingOAuthSignupAcquisition: the AuthProvider calls this on
 * session presence. It sends the referee's code claim to the redeem-referral
 * edge function, which re-verifies identity + email confirmation server-side
 * and resolves the credit environment from server secrets. The client NEVER
 * grants anything and NEVER calls convert_referral directly (service-role
 * only).
 *
 * Code sources, in trust order:
 *   1. user_metadata.verdant_ref_code (email signups — server re-reads it
 *      from auth admin anyway; sending it is just a hint)
 *   2. the OAuth sessionStorage bridge (Google signups)
 *
 * Terminal outcomes (converted / self_referral / already_referred /
 * unknown_code / stale_account) clear all pending state — retrying cannot
 * change them. Transient failures retain state for the next session load.
 */

import {
  clearPendingOAuthReferral,
  readPendingOAuthReferral,
  resolveOAuthReferralSessionStorage,
} from "@/lib/oauthReferralCaptureRules";
import { sanitizeReferralCode } from "@/lib/referralCaptureRules";

/** Per-user done-marker so we do not invoke the edge fn on every app load. */
export const REFERRAL_REDEEMED_MARKER_PREFIX = "verdant:referral-redeemed:v1:" as const;

export type ReferralRedeemStatus = "none" | "converted" | "pending" | "terminal" | "retry";

export interface ReferralRedeemUser {
  id: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface ReferralRedeemClient {
  functions: {
    invoke(
      name: "redeem-referral",
      options: { body: { code: string } },
    ): Promise<{ data: unknown; error: unknown }>;
  };
}

function markerStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function hasDoneMarker(userId: string): boolean {
  try {
    return markerStorage()?.getItem(REFERRAL_REDEEMED_MARKER_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

function setDoneMarker(userId: string): void {
  try {
    markerStorage()?.setItem(REFERRAL_REDEEMED_MARKER_PREFIX + userId, "1");
  } catch {
    // Marker is an optimization only; the server stays idempotent without it.
  }
}

export async function flushPendingReferralRedeem(
  client: ReferralRedeemClient,
  user: ReferralRedeemUser | null | undefined,
  storage: Storage | null = resolveOAuthReferralSessionStorage(),
  now = Date.now(),
): Promise<ReferralRedeemStatus> {
  if (!user?.id) return "none";
  // Unconfirmed sessions cannot convert; wait for the post-confirm session.
  if (!user.email_confirmed_at) return "none";
  if (hasDoneMarker(user.id)) return "none";

  const metadataCode = sanitizeReferralCode(user.user_metadata?.["verdant_ref_code"]);
  const bridgeCode = readPendingOAuthReferral(storage, now);
  const code = metadataCode ?? bridgeCode;
  if (!code) {
    // No code visible in THIS tab. Do NOT set the done-marker: the OAuth
    // bridge is per-tab sessionStorage, and a sibling tab may still hold it.
    return "none";
  }

  try {
    const { data, error } = await client.functions.invoke("redeem-referral", {
      body: { code },
    });
    if (error) return "retry";
    const payload = (data ?? {}) as { ok?: boolean; status?: string; terminal?: boolean };
    if (payload.status === "converted" || payload.status === "idempotent") {
      clearPendingOAuthReferral(storage);
      setDoneMarker(user.id);
      return "converted";
    }
    if (payload.terminal === true) {
      // self_referral / already_referred / unknown_code / stale_account —
      // a retry can never change these.
      clearPendingOAuthReferral(storage);
      setDoneMarker(user.id);
      return "terminal";
    }
    if (payload.status === "pending") return "pending";
    return "retry";
  } catch {
    return "retry";
  }
}
