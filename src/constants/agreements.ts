/**
 * Agreement version registry.
 *
 * Bump `version` and `effectiveDate` whenever you materially change
 * /terms or /privacy. Any signed-in user whose latest acceptance is not
 * present at the current version will be blocked by the re-consent modal
 * until they accept the new version.
 *
 * `version` MUST be a stable, sortable string (ISO date recommended).
 * `effectiveDate` is displayed to the user in the re-consent modal.
 */

export type AgreementType = "terms" | "privacy";

export interface AgreementVersion {
  type: AgreementType;
  version: string;
  effectiveDate: string; // ISO YYYY-MM-DD, shown to the user
  label: string;
  href: string;
}

export const CURRENT_AGREEMENTS: Readonly<Record<AgreementType, AgreementVersion>> = Object.freeze({
  terms: {
    type: "terms",
    version: "2026-07-13",
    effectiveDate: "2026-07-13",
    label: "Terms of Service",
    href: "/terms",
  },
  privacy: {
    type: "privacy",
    version: "2026-07-13",
    effectiveDate: "2026-07-13",
    label: "Privacy Policy",
    href: "/privacy",
  },
});

export const CURRENT_AGREEMENT_LIST: readonly AgreementVersion[] = Object.freeze([
  CURRENT_AGREEMENTS.terms,
  CURRENT_AGREEMENTS.privacy,
]);

const AGREEMENT_CALENDAR_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Long US date for a YYYY-MM-DD agreement effective date, independent of the host timezone. */
export function formatAgreementEffectiveDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Agreement effective date must be YYYY-MM-DD, received ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return AGREEMENT_CALENDAR_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Page "Last updated" labels. Derived from consent effective dates so the pages cannot drift. */
export const TERMS_PAGE_LAST_UPDATED = formatAgreementEffectiveDate(
  CURRENT_AGREEMENTS.terms.effectiveDate,
);
export const PRIVACY_PAGE_LAST_UPDATED = formatAgreementEffectiveDate(
  CURRENT_AGREEMENTS.privacy.effectiveDate,
);
/** Refund has no consent version. It uses the Terms effective date (owner default for #1995). */
export const REFUND_PAGE_LAST_UPDATED = TERMS_PAGE_LAST_UPDATED;
