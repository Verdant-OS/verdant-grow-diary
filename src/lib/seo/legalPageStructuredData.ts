/**
 * legalPageStructuredData — pure JSON-LD builder for Verdant's public legal
 * pages (/privacy, /terms, /refund).
 *
 * Deterministic, null-safe, no side effects, no secrets. UI callers stringify
 * with `safeJsonLdStringify` from `@/lib/seoStructuredData` and inject the
 * result into a single `<script type="application/ld+json">` per page.
 *
 * Rules:
 *  - path must be an absolute route (starts with "/") that we control.
 *  - name/description must be non-empty trimmed strings.
 *  - @id is derived as `${canonicalUrl}#webpage` so it is stable per route.
 */

export const VERDANT_SITE_ORIGIN = "https://verdantgrowdiary.com";
export const VERDANT_SITE_NAME = "Verdant";
export const VERDANT_LEGAL_PAGE_JSON_LD_SELECTOR = "legal-page-json-ld";

export interface LegalPageJsonLdInput {
  /** Route path, e.g. "/privacy". Must start with "/". */
  path: string;
  /** Page-specific display name, e.g. "Privacy Policy". */
  name: string;
  /** Aligned with the page meta description. */
  description: string;
  /** Optional about topic; defaults to `name`. */
  about?: string;
}

export interface LegalPageJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "WebPage";
  readonly "@id": string;
  readonly url: string;
  readonly name: string;
  readonly description: string;
  readonly inLanguage: "en-US";
  readonly isPartOf: {
    readonly "@type": "WebSite";
    readonly name: string;
    readonly url: string;
  };
  readonly publisher: {
    readonly "@type": "Organization";
    readonly name: string;
    readonly url: string;
  };
  readonly about: {
    readonly "@type": "Thing";
    readonly name: string;
  };
}

function requireNonEmpty(field: string, value: string): string {
  const trimmed = value?.trim?.() ?? "";
  if (!trimmed) throw new Error(`buildLegalPageJsonLd: ${field} required`);
  return trimmed;
}

export function buildLegalPageCanonicalUrl(path: string): string {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error(`buildLegalPageJsonLd: path must start with "/" (got "${path}")`);
  }
  return `${VERDANT_SITE_ORIGIN}${path}`;
}

export function buildLegalPageJsonLd(input: LegalPageJsonLdInput): LegalPageJsonLd {
  const url = buildLegalPageCanonicalUrl(input.path);
  const name = requireNonEmpty("name", input.name);
  const description = requireNonEmpty("description", input.description);
  const about = requireNonEmpty("about", input.about ?? name);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: VERDANT_SITE_NAME,
      url: VERDANT_SITE_ORIGIN,
    },
    publisher: {
      "@type": "Organization",
      name: VERDANT_SITE_NAME,
      url: VERDANT_SITE_ORIGIN,
    },
    about: {
      "@type": "Thing",
      name: about,
    },
  };
}
