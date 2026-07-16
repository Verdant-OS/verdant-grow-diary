import type { VerdantCultivarProfile } from "../constants/verdantCultivars";

export const CULTIVAR_SITE_ORIGIN = "https://verdantgrowdiary.com";
export const CULTIVARS_INDEX_PATH = "/cultivars";
export const CULTIVAR_OG_IMAGE_WIDTH = 1200;
export const CULTIVAR_OG_IMAGE_HEIGHT = 630;

const INDEX_TITLE =
  "Cannabis Cultivar Guides — Oreoz, Do-Si-Dos, Blue Cookies Strain Info | Verdant";
const INDEX_DESCRIPTION =
  "Evergreen cultivar profiles for serious home growers: environment ranges, flower windows, common issues, and what to compare when pheno-hunting.";

export interface CultivarSeoDescriptor {
  title: string;
  description: string;
  /** Canonical path. Query-string filter variants intentionally collapse here. */
  path: string;
  ogImage: string;
  ogImageAlt: string;
  ogImageWidth: number;
  ogImageHeight: number;
  ogImageType: "image/png";
  ogType: "website" | "article";
  noindex: boolean;
}

function normalizeSearch(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/**
 * Faceted cultivar views are useful UI states, not distinct search documents.
 * Any query string therefore keeps the hub canonical and adds noindex/follow.
 */
export function hasCultivarQueryVariant(search: string | URLSearchParams): boolean {
  return normalizeSearch(search).toString().length > 0;
}

export function buildCultivarsIndexSeo(
  search: string | URLSearchParams = "",
): CultivarSeoDescriptor {
  return {
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    path: CULTIVARS_INDEX_PATH,
    ogImage: `${CULTIVAR_SITE_ORIGIN}/og/cultivars/index.png`,
    ogImageAlt: "Verdant cannabis cultivar guide library",
    ogImageWidth: CULTIVAR_OG_IMAGE_WIDTH,
    ogImageHeight: CULTIVAR_OG_IMAGE_HEIGHT,
    ogImageType: "image/png",
    ogType: "website",
    noindex: hasCultivarQueryVariant(search),
  };
}

export function buildCultivarSeo(cultivar: VerdantCultivarProfile): CultivarSeoDescriptor {
  return {
    title: `${cultivar.name} Cultivator Guide (${cultivar.searchAlias} info) | Verdant`,
    description: `${cultivar.name} grow guide: lineage (${cultivar.lineage}), ${cultivar.flowerWeeks} flower, environment ranges by stage, and common issues home growers report.`,
    path: `${CULTIVARS_INDEX_PATH}/${cultivar.slug}`,
    ogImage: `${CULTIVAR_SITE_ORIGIN}/og/cultivars/${cultivar.slug}.png`,
    ogImageAlt: `${cultivar.name} cultivar guide by Verdant Grow Diary`,
    ogImageWidth: CULTIVAR_OG_IMAGE_WIDTH,
    ogImageHeight: CULTIVAR_OG_IMAGE_HEIGHT,
    ogImageType: "image/png",
    ogType: "article",
    noindex: false,
  };
}

export function buildUnknownCultivarSeo(): CultivarSeoDescriptor {
  return { ...buildCultivarsIndexSeo(), noindex: true };
}

/** Legacy /strains aliases must never compete with their /cultivars target. */
export function buildLegacyStrainSeo(cultivar?: VerdantCultivarProfile): CultivarSeoDescriptor {
  const target = cultivar ? buildCultivarSeo(cultivar) : buildCultivarsIndexSeo();
  return { ...target, noindex: true };
}
