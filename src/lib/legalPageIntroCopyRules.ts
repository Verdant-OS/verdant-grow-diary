/** Closing line of the shared legal-page intro. Terms keeps its line; policies get policy wording. */
export const LEGAL_PAGE_TERMS_INTRO_CLOSING = "Please review these terms carefully." as const;
export const LEGAL_PAGE_DEFAULT_INTRO_CLOSING = "Please read this policy carefully." as const;

const INTRO_CLOSING_BY_PATH: Record<string, typeof LEGAL_PAGE_TERMS_INTRO_CLOSING> = {
  "/terms": LEGAL_PAGE_TERMS_INTRO_CLOSING,
};

export function resolveLegalPageIntroClosing(path: string): string {
  return INTRO_CLOSING_BY_PATH[path] ?? LEGAL_PAGE_DEFAULT_INTRO_CLOSING;
}
