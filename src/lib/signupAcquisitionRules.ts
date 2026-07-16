import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";
import {
  PAID_ACQUISITION_ATTRIBUTIONS,
  resolvePaidAcquisitionSource,
  type PaidAcquisitionSource,
} from "@/lib/paidAcquisitionAttributionRules";

export const SIGNUP_ACQUISITION_METADATA_KEY = "verdant_signup_source" as const;

function asSearchParams(input: string | URLSearchParams | null | undefined): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input !== "string") return new URLSearchParams();
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

/**
 * Builds a first-party signup handoff. Only fixed attribution tuples and a
 * sanitized same-origin return path are allowed into the URL.
 */
export function buildAttributedSignupPath(input: {
  source: PaidAcquisitionSource;
  redirectTo?: string | null;
}): string {
  const config = PAID_ACQUISITION_ATTRIBUTIONS[input.source];
  const params = new URLSearchParams();
  params.set("mode", "signup");

  if (input.redirectTo) {
    const safeRedirect = sanitizeAuthRedirect(input.redirectTo);
    if (safeRedirect === input.redirectTo) params.set("redirectTo", safeRedirect);
  }

  params.set("utm_source", config.source);
  params.set("utm_medium", config.medium);
  params.set("utm_campaign", config.campaign);
  return `/auth?${params.toString()}`;
}

/**
 * Resolves signup source from either the auth URL itself or its already-
 * sanitized internal redirect. Unknown/raw campaign values fail closed.
 */
export function resolveSignupAcquisitionSource(
  input: string | URLSearchParams | null | undefined,
): PaidAcquisitionSource | null {
  const params = asSearchParams(input);
  const direct = resolvePaidAcquisitionSource(params);
  if (direct) return direct;

  const rawRedirect = params.get("redirectTo");
  if (!rawRedirect) return null;
  const safeRedirect = sanitizeAuthRedirect(rawRedirect);
  if (safeRedirect !== rawRedirect) return null;

  const queryIndex = safeRedirect.indexOf("?");
  if (queryIndex < 0) return null;
  return resolvePaidAcquisitionSource(safeRedirect.slice(queryIndex + 1));
}

/**
 * Supabase stores this in user-editable metadata, so it is analytics-only.
 * It must never grant billing, roles, AI credits, or any other capability.
 */
export function buildSignupUserMetadata(
  input: string | URLSearchParams | null | undefined,
): Readonly<Record<typeof SIGNUP_ACQUISITION_METADATA_KEY, PaidAcquisitionSource>> | undefined {
  const source = resolveSignupAcquisitionSource(input);
  return source ? Object.freeze({ [SIGNUP_ACQUISITION_METADATA_KEY]: source }) : undefined;
}

/** Keep email-confirmation return targets on-origin and useful. */
export function buildSignupEmailRedirectUrl(origin: string, redirectTo?: string | null): string {
  const safeTarget = redirectTo ? sanitizeAuthRedirect(redirectTo, "/onboarding") : "/onboarding";
  return `${origin}${safeTarget}`;
}
