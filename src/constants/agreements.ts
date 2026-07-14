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
