/**
 * Layout-only offset for the analytics consent banner.
 *
 * The banner is position:fixed, so it covers content unless the document
 * reserves its measured height. Consent storage and analytics loading do
 * not live here.
 */
export const ANALYTICS_CONSENT_BANNER_OFFSET_PROPERTY = "--analytics-consent-banner-offset";

/** CSS length for the reserved strip, or null when there is nothing to reserve. */
export function analyticsConsentBannerOffsetValue(heightPx: number): string | null {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return null;
  return `${Math.ceil(heightPx)}px`;
}
