/**
 * referralCaptureRules — capture a `?ref=<code>` referral slug at signup.
 *
 * Mirrors signupAcquisitionRules: the code rides supabase.auth.signUp
 * options.data into raw_user_meta_data, where the SECURITY DEFINER
 * handle_new_user trigger uses it as a LOOKUP KEY ONLY (resolving it against
 * the trusted profiles.referral_code column) to record a pending referral.
 *
 * TRUST: raw_user_meta_data is user-editable. The code is a claim, never an
 * authority — referrer identity, anti-self-referral, one-referral-per-referee
 * and the actual credit grant all live server-side (convert_referral +
 * redeem-referral). Unlike verdant_signup_source there is no fixed allowlist
 * (a slug is arbitrary), so validation is charset/length only.
 */

export const REFERRAL_METADATA_KEY = "verdant_ref_code" as const;

/** Server slugs are 10 chars of unambiguous base31; accept a small range so
 * hand-typed variants (case, padding) survive without widening abuse room. */
const REFERRAL_CODE_PATTERN = /^[a-z0-9]{6,16}$/;

/** Lowercased, trimmed code — or null when absent/malformed. */
export function sanitizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

function asSearchParams(input: string | URLSearchParams | null | undefined): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input !== "string") return new URLSearchParams();
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

/** Read + sanitize `?ref=` from the auth page's search params. */
export function resolveReferralCode(
  input: string | URLSearchParams | null | undefined,
): string | null {
  return sanitizeReferralCode(asSearchParams(input).get("ref"));
}

/**
 * Metadata fragment spread into signUp options.data (analytics/attribution
 * claim only — never grants anything by itself).
 */
export function buildSignupReferralMetadata(
  input: string | URLSearchParams | null | undefined,
): Readonly<Record<typeof REFERRAL_METADATA_KEY, string>> | undefined {
  const code = resolveReferralCode(input);
  return code ? Object.freeze({ [REFERRAL_METADATA_KEY]: code }) : undefined;
}
