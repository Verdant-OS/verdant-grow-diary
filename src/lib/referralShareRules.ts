/**
 * referralShareRules — view-model for the rewarded "refer a friend" card.
 *
 * Unlike the three reward-free share view-models (grower invite, founder,
 * subscriber interest), this one is USER-SCOPED: the share URL carries the
 * caller's own opaque referral code, loaded from their profiles row
 * (RLS: select-own). The URL points straight at /auth?mode=signup&ref=<code>
 * — the exact location the signup capture memo reads — so the code survives
 * with no extra navigation plumbing.
 *
 * Pure builders + a thin injectable loader; no reward logic lives here (the
 * give-10/get-10 grant is entirely server-side in convert_referral).
 */

import { sanitizeReferralCode } from "@/lib/referralCaptureRules";

export const REFERRAL_GIVE_CREDITS = 10;
export const REFERRAL_GET_CREDITS = 10;

export interface ReferralShareData {
  title: string;
  text: string;
  url: string;
}

/** Build share data from a loaded code. Null when the code is absent/bad. */
export function buildReferralShareData(code: unknown, origin: string): ReferralShareData | null {
  const sanitized = sanitizeReferralCode(code);
  if (!sanitized || typeof origin !== "string" || origin.length === 0) return null;
  return Object.freeze({
    title: "Verdant Grow Diary",
    text: `Track your grow with me on Verdant — sign up with my link and we both get ${REFERRAL_GET_CREDITS} AI Doctor credits.`,
    url: `${origin}/auth?mode=signup&ref=${sanitized}`,
  });
}

/** Minimal query surface so tests can inject a fake Supabase client. */
export interface ReferralCodeClient {
  from(table: "profiles"): {
    select(columns: "referral_code"): {
      eq(
        column: "user_id",
        value: string,
      ): {
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/**
 * Load the caller's own referral code (RLS select-own row). Returns null on
 * any failure — the card renders a graceful "not ready" state, never throws.
 * (profiles.referral_code lands with the glue migration; until the generated
 * types are refreshed the row is read through a narrow cast.)
 */
export async function loadOwnReferralCode(
  client: ReferralCodeClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await client
      .from("profiles")
      .select("referral_code")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return sanitizeReferralCode((data as { referral_code?: unknown } | null)?.referral_code);
  } catch {
    return null;
  }
}
