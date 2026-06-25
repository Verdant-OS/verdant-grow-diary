/**
 * aiDoctorEvidenceSearchRules — pure search/filter helper for the
 * Evidence details modal search box.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch.
 *  - Filters in-memory over an already-redacted view of evidence.
 *  - Never echoes raw payloads, tokens, JWTs, UUIDs.
 */

export interface EvidenceSearchItem {
  /** Stable safe id (slug or kind-key). Not a raw internal DB id. */
  id: string;
  label: string;
  metricKey: string | null;
  status: string | null;
  sourceLabel: string | null;
  reason: string | null;
  citationKind: string;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/**
 * Match an item if any searchable field contains the query (case-insensitive).
 * An empty query returns all items unchanged.
 */
export function filterEvidenceSearchItems(
  items: readonly EvidenceSearchItem[],
  query: string,
): EvidenceSearchItem[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((it) => {
    return (
      norm(it.label).includes(q) ||
      norm(it.metricKey).includes(q) ||
      norm(it.status).includes(q) ||
      norm(it.sourceLabel).includes(q) ||
      norm(it.reason).includes(q) ||
      norm(it.citationKind).includes(q)
    );
  });
}

export const EVIDENCE_SEARCH_EMPTY_COPY = "No matching evidence items.";
export const EVIDENCE_SEARCH_INPUT_LABEL = "Search Evidence Used items";
