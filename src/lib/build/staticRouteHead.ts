/**
 * Per-route <head> for the public acquisition routes.
 *
 * Single source of truth: `STATIC_PUBLIC_OUTPUT_DOCUMENTS`. The Classic build
 * turned those documents into filesystem-first `index.html` files; under SSR
 * the same metadata is emitted by each route's TanStack `head()`, so crawlers
 * (JS or not) receive it in the first response. `scripts/generate-seo-artifacts.ts`
 * builds `dist/seo-manifest.json` from the exact same resolver, and the
 * postbuild head-fidelity gate compares real SSR responses against it — so
 * manifest and route head cannot drift apart.
 */
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
  type StaticPublicSeoDocument,
} from "./staticPublicSeoDocuments";
import { ogImageSlugForPath } from "./ogImageCard";
import type { StaticSocialRouteMetadata } from "./staticSocialRouteHtml";

export type ResolvedStaticRouteMetadata = Omit<StaticSocialRouteMetadata, "bodyFallbackHtml">;

/**
 * Apply the build-time OG card override. Each document advertises the
 * deterministic per-route PNG emitted next to the manifest, not the brand
 * fallback baked into the document definition.
 */
export function resolveStaticDocumentMetadata(
  document: StaticPublicSeoDocument,
): ResolvedStaticRouteMetadata {
  const canonicalPath = new URL(document.metadata.url).pathname;
  const { bodyFallbackHtml: _bodyFallbackHtml, ...metadata } = document.metadata;
  return {
    ...metadata,
    image: `${VERDANT_SITE_ORIGIN}/og/${ogImageSlugForPath(canonicalPath)}.png`,
  };
}

const METADATA_BY_PATH = new Map<string, ResolvedStaticRouteMetadata>(
  STATIC_PUBLIC_OUTPUT_DOCUMENTS.map((document) => [
    document.path,
    resolveStaticDocumentMetadata(document),
  ]),
);

export interface StaticRouteHead {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
  scripts: Array<{
    type: "application/ld+json";
    children: string;
  }>;
}

/**
 * Build the TanStack `head()` payload for a public route. Returns an empty
 * head for unknown paths so a route file can never fabricate metadata that the
 * manifest does not also publish.
 */
export function staticRouteHead(path: string): StaticRouteHead {
  const metadata = METADATA_BY_PATH.get(path);
  if (!metadata) return { meta: [], links: [], scripts: [] };

  const meta: Array<Record<string, string>> = [
    { title: metadata.title },
    { name: "description", content: metadata.description },
    { name: "robots", content: metadata.robots ?? "index, follow" },
    { property: "og:url", content: metadata.url },
    { property: "og:title", content: metadata.title },
    { property: "og:description", content: metadata.description },
    { property: "og:image", content: metadata.image },
    { property: "og:image:alt", content: metadata.imageAlt },
    { name: "twitter:title", content: metadata.title },
    { name: "twitter:description", content: metadata.description },
    { name: "twitter:image", content: metadata.image },
  ];

  const scripts = (metadata.jsonLd ?? []).map((node) => ({
    type: "application/ld+json" as const,
    children: JSON.stringify(node),
  }));

  return { meta, links: [{ rel: "canonical", href: metadata.url }], scripts };
}

/** Public paths that own a static metadata document. */
export const STATIC_HEAD_ROUTE_PATHS: ReadonlyArray<string> = [...METADATA_BY_PATH.keys()];
