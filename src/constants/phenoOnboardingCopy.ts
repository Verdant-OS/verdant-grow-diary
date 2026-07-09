/**
 * phenoOnboardingCopy — canonical presentation strings for Pheno Tracker
 * onboarding and workspace progress surfaces.
 *
 * Setup complete and Comparison-ready are DIFFERENT states and must never
 * be presented as synonyms. Verdant must never imply a hunt is
 * comparison-ready just because onboarding setup is complete.
 *
 * Guardrails (enforced by src/test/pheno-copy-regression.test.ts):
 *   - No "setup complete" implying "comparison-ready".
 *   - No forbidden marketing phrasings (see the regression test for the list).
 *   - No implication that candidate comparison is valid when evidence is
 *     missing.
 */

export const PHENO_SETUP_COMPLETE_DEFINITION =
  "Setup complete means your hunt has candidates and evidence goals.";

export const PHENO_COMPARISON_READY_DEFINITION =
  "Comparison-ready means each candidate has enough evidence to compare honestly.";

/**
 * Canonical status labels. Presenters MUST render these strings verbatim
 * so the copy regression tests can pin them.
 */
export const PHENO_STATUS_LABELS = {
  setupComplete: "Setup complete",
  readyForTracking: "Ready for tracking",
  notComparisonReadyYet: "Not comparison-ready yet",
  comparisonReady: "Comparison-ready",
  missingEvidence: "Missing evidence",
  pendingUntilHarvest: "Pending until harvest",
  pendingUntilCure: "Pending until cure",
} as const;

export type PhenoStatusLabelKey = keyof typeof PHENO_STATUS_LABELS;
