/**
 * Pheno Hunt index empty-state CTA. Soft-couple to an explicit growId already
 * on the location. Fail closed: never invent a grow.
 *
 * Pure. No React, no network, no clock.
 */
import { growDetailPath } from "@/lib/routes";

export const PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF = "/grows";
export const PHENO_HUNTS_EMPTY_CTA_UNSCOPED_LABEL = "Go to My Grows";
export const PHENO_HUNTS_EMPTY_CTA_SCOPED_LABEL = "Go to this grow";

export const PHENO_HUNTS_EMPTY_UNSCOPED_BODY =
  "A pheno hunt starts from a grow. Open a grow and use “Start Pheno Hunt” on its timeline to begin tracking candidates.";

export const PHENO_HUNTS_EMPTY_SCOPED_BODY =
  "A pheno hunt starts from this grow. Open it and use “Start Pheno Hunt” on its timeline to begin tracking candidates.";

export function resolvePhenoHuntsEmptyCta(growId: string | null): {
  href: string;
  label: string;
  body: string;
} {
  if (!growId) {
    return {
      href: PHENO_HUNTS_EMPTY_CTA_UNSCOPED_HREF,
      label: PHENO_HUNTS_EMPTY_CTA_UNSCOPED_LABEL,
      body: PHENO_HUNTS_EMPTY_UNSCOPED_BODY,
    };
  }
  return {
    href: growDetailPath(growId),
    label: PHENO_HUNTS_EMPTY_CTA_SCOPED_LABEL,
    body: PHENO_HUNTS_EMPTY_SCOPED_BODY,
  };
}
