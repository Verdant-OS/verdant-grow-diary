import {
  VERDANT_CULTIVARS,
  type VerdantCultivarProfile,
} from "../../constants/verdantCultivars";
import {
  buildCultivarSeo,
  buildCultivarsIndexSeo,
  buildLegacyStrainSeo,
  CULTIVAR_SITE_ORIGIN,
  type CultivarSeoDescriptor,
} from "../cultivarSeoRules";
import type { StaticSocialRouteMetadata } from "./staticSocialRouteHtml";

export interface CultivarStaticRouteDocument {
  routePath: string;
  fileName: string;
  metadata: StaticSocialRouteMetadata;
  legacyRedirect: boolean;
}

function toStaticMetadata(seo: CultivarSeoDescriptor): StaticSocialRouteMetadata {
  return {
    title: seo.title,
    description: seo.description,
    url: `${CULTIVAR_SITE_ORIGIN}${seo.path}`,
    image: seo.ogImage,
    imageAlt: seo.ogImageAlt,
    robots: seo.noindex ? "noindex, follow" : "index, follow",
    ogType: seo.ogType,
    imageWidth: seo.ogImageWidth,
    imageHeight: seo.ogImageHeight,
    imageType: seo.ogImageType,
  };
}

export function buildCultivarStaticRouteManifest(
  cultivars: readonly VerdantCultivarProfile[] = VERDANT_CULTIVARS,
): readonly CultivarStaticRouteDocument[] {
  const docs: CultivarStaticRouteDocument[] = [
    {
      routePath: "/cultivars",
      fileName: "cultivars.html",
      metadata: toStaticMetadata(buildCultivarsIndexSeo()),
      legacyRedirect: false,
    },
    {
      routePath: "/strains",
      fileName: "strains.html",
      metadata: toStaticMetadata(buildLegacyStrainSeo()),
      legacyRedirect: true,
    },
  ];

  for (const cultivar of cultivars) {
    docs.push(
      {
        routePath: `/cultivars/${cultivar.slug}`,
        fileName: `cultivars/${cultivar.slug}.html`,
        metadata: toStaticMetadata(buildCultivarSeo(cultivar)),
        legacyRedirect: false,
      },
      {
        routePath: `/strains/${cultivar.slug}`,
        fileName: `strains/${cultivar.slug}.html`,
        metadata: toStaticMetadata(buildLegacyStrainSeo(cultivar)),
        legacyRedirect: true,
      },
    );
  }

  return docs;
}
