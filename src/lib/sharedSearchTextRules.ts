/**
 * Shared deterministic text normalization for Verdant discovery surfaces.
 *
 * Global entity search and the public Strain Reference Library both use this
 * boundary so punctuation, accents, spacing, and case behave consistently.
 */
export function normalizeSharedSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sharedSearchTextIncludes(haystack: string, query: string): boolean {
  const needle = normalizeSharedSearchText(query);
  if (!needle) return true;
  return normalizeSharedSearchText(haystack).includes(needle);
}
