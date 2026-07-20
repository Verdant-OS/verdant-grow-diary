/**
 * Pure SEO state for the public /cultivars hub.
 *
 * Faceted filter URLs are useful deep links in the UI, not distinct search
 * documents. Query-bearing variants therefore retain the clean hub canonical
 * and og:url while emitting noindex, follow.
 */
import type { PageSeo } from "@/hooks/usePageSeo";

export const CULTIVARS_INDEX_PATH = "/cultivars" as const;

const INDEX_TITLE =
  "Cannabis Cultivar Guides: Oreoz, Do-Si-Dos & More | Verdant";

const INDEX_DESCRIPTION =
  "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.";

/**
 * Treat every normalized query parameter as a UI-only filter state, including
 * empty values and unknown keys. A bare `/cultivars?` normalizes to the clean
 * hub because it carries no parameter.
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
 * Build a canonical, evergreen descriptor for both the clean hub and its
 * filter variants. `usePageSeo` maps `path` to canonical and og:url.
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
