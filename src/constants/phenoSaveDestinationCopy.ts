/**
 * Pheno Hunt save labels that name where each save goes (audit 2026-11-03,
 * finding 8; Matthew chose "Draft + account"). Candidate documentation is
 * kept in this browser only; the candidate card's scores and decision save
 * to the Verdant account. Copy only: no storage or sync change.
 */
export const PHENO_SAVE_DESTINATION_COPY = Object.freeze({
  candidateDocumentationTitle: "Candidate documentation (this device only)",
  deviceDraftSave: "Save draft on this device",
  accountSave: "Save to account",
  accountSaving: "Saving…",
} as const);
