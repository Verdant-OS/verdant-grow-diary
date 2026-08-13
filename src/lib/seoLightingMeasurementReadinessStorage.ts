/**
 * localStorage persistence for owner "Verified" audit stamps (GA4 / GSC).
 * Client-only. Never stores credentials.
 */

export const GA4_VERIFIED_AT_KEY = "verdant.seo.lighting.ga4_verified_at";
export const GSC_VERIFIED_AT_KEY = "verdant.seo.lighting.gsc_verified_at";

export function readVerifiedAt(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeVerifiedAt(key: string, iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, iso);
}

export function clearVerifiedAt(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
