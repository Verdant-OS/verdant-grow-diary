/**
 * cultivarIndexSeoRules — pure SEO state for the public /cultivars hub.
 *
 * Faceted filter views (?q=, ?difficulty=, unknown keys, empty values) are
 * useful UI deep-links, not distinct search documents. Any query-bearing URL
 * therefore keeps the clean hub canonical/og:url and emits noindex, follow
 * so thin/duplicate filter URLs do not enter the index.
 *
 * Pure: no DOM, no network, no ambient state. Deterministic for a given
 * search-params input.
 */

import type { PageSeo } from "@/hooks/usePageSeo";

export const CULTIVARS_INDEX_PATH = "/cultivars" as const;

const INDEX_TITLE =
  "Cannabis Cultivar Guides — Oreoz, Do-Si-Dos, Blue Cookies Strain Info | Verdant";

const INDEX_DESCRIPTION =
  "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.";

/**
 * True when the URL carries any query string that survives URLSearchParams
 * normalization. Covers:
 * - ?q=oreoz
 * - ?difficulty=Advanced
 * - combined filters
 * - empty values (?q=)
 * - difficulty=all (even though the UI normally strips it)
 * - unknown keys / utm / encoded values
 */
export function hasCultivarIndexQueryVariant(
  search: string | URLSearchParams | null | undefined,
): boolean {
  if (search == null) return false;
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.toString().length > 0;
}

/**
 * Derive the public index SEO descriptor from URL search parameters.
 *
 * - Unfiltered hub: index, follow; clean /cultivars canonical + og:url
 * - Any query-bearing variant: noindex, follow; same clean canonical + og:url
 *
 * Query parameters never leak into path/canonical/og:url.
 */
export function buildCultivarsIndexSeo(
  search: string | URLSearchParams | null | undefined = "",
): PageSeo {
  return {
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    path: CULTIVARS_INDEX_PATH,
    noindex: hasCultivarIndexQueryVariant(search),
  };
}
