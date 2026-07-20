/**
 * seoStructuredData — pure JSON-LD builders for public SEO surfaces.
 *
 * No side effects, no DOM writes, no network. Presenters decide when/where
 * to inject the resulting string into <script type="application/ld+json">.
 *
 * Rule: FAQ JSON-LD must only describe FAQ content that is visibly rendered
 * on the same page. Callers should pass the same FaqEntry array that drives
 * the visible accordion/list — do not synthesize hidden questions here.
 */

import type { FaqEntry } from "@/constants/verdantSeoCopy";

export interface FaqPageJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "FAQPage";
  readonly url?: string;
  readonly mainEntity: ReadonlyArray<{
    readonly "@type": "Question";
    readonly name: string;
    readonly acceptedAnswer: {
      readonly "@type": "Answer";
      readonly text: string;
    };
  }>;
}

export interface SoftwareApplicationJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "SoftwareApplication";
  readonly name: string;
  readonly description: string;
  readonly applicationCategory: string;
  readonly operatingSystem: string;
  readonly url?: string;
}

/**
 * Build a schema.org FAQPage JSON-LD document from the visible FAQ entries.
 * Throws on obviously invalid input so callers can catch drift at build time.
 */
export function buildFaqPageJsonLd({
  pageUrl,
  questions,
}: {
  pageUrl?: string;
  questions: ReadonlyArray<FaqEntry>;
}): FaqPageJsonLd {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("buildFaqPageJsonLd: questions must be a non-empty array");
  }
  for (const q of questions) {
    if (!q.question || !q.question.trim()) {
      throw new Error("buildFaqPageJsonLd: every entry must have a question");
    }
    if (!q.answer || !q.answer.trim()) {
      throw new Error(
        `buildFaqPageJsonLd: FAQ answer is empty for question "${q.question}"`,
      );
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(pageUrl ? { url: pageUrl } : {}),
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}

/**
 * Build a minimal SoftwareApplication JSON-LD document. Does not include
 * fake reviews, ratings, or price claims — Verdant intentionally omits
 * aggregateRating / offers here to avoid schema abuse.
 */
export function buildSoftwareApplicationJsonLd({
  name,
  description,
  applicationCategory = "LifestyleApplication",
  operatingSystem = "Web",
  url,
}: {
  name: string;
  description: string;
  applicationCategory?: string;
  operatingSystem?: string;
  url?: string;
}): SoftwareApplicationJsonLd {
  if (!name.trim()) throw new Error("buildSoftwareApplicationJsonLd: name required");
  if (!description.trim())
    throw new Error("buildSoftwareApplicationJsonLd: description required");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    applicationCategory,
    operatingSystem,
    ...(url ? { url } : {}),
  };
}

export interface BreadcrumbListItem {
  readonly name: string;
  /** Absolute production URL for this breadcrumb item. */
  readonly url: string;
}

export interface BreadcrumbListJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "BreadcrumbList";
  readonly itemListElement: ReadonlyArray<{
    readonly "@type": "ListItem";
    readonly position: number;
    readonly name: string;
    readonly item: string;
  }>;
}

/**
 * Build a schema.org BreadcrumbList JSON-LD document from an ordered list of
 * visible breadcrumbs. Positions are 1-indexed and increment. Each item URL
 * must be an absolute production URL — relative paths are rejected so the
 * schema never emits ambiguous crawler hints.
 */
export function buildBreadcrumbListJsonLd({
  items,
}: {
  items: ReadonlyArray<BreadcrumbListItem>;
}): BreadcrumbListJsonLd {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("buildBreadcrumbListJsonLd: items must be a non-empty array");
  }
  for (const it of items) {
    if (!it.name || !it.name.trim()) {
      throw new Error("buildBreadcrumbListJsonLd: every item must have a name");
    }
    if (!it.url || !/^https?:\/\//i.test(it.url)) {
      throw new Error(
        `buildBreadcrumbListJsonLd: item url must be absolute (got "${it.url}")`,
      );
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/**
 * Stringify a JSON-LD payload for embedding in <script type="application/ld+json">.
 * Escapes the "</" sequence so a stray closing tag inside a string cannot break
 * out of the surrounding <script> element.
 */
export function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/<\/(script)/gi, "<\\/$1");
}

export interface ArticleJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "Article";
  readonly headline: string;
  readonly description: string;
  readonly url: string;
  readonly datePublished: string;
  readonly dateModified?: string;
  readonly author: { readonly "@type": "Organization"; readonly name: string; readonly url?: string };
  readonly publisher: { readonly "@type": "Organization"; readonly name: string; readonly url?: string };
  readonly mainEntityOfPage: { readonly "@type": "WebPage"; readonly "@id": string };
}

/**
 * Build a schema.org Article JSON-LD document for editorial pages
 * (grower guides). Author/publisher default to the Verdant organization
 * since these are house-authored evergreen guides.
 */
export function buildArticleJsonLd({
  headline,
  description,
  url,
  datePublished,
  dateModified,
  authorName = "Verdant Grow Diary",
  publisherName = "Verdant Grow Diary",
  siteUrl,
}: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  siteUrl?: string;
}): ArticleJsonLd {
  if (!headline.trim()) throw new Error("buildArticleJsonLd: headline required");
  if (!description.trim()) throw new Error("buildArticleJsonLd: description required");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildArticleJsonLd: url must be absolute (got "${url}")`);
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(datePublished)) {
    throw new Error(`buildArticleJsonLd: datePublished must be ISO-8601 (got "${datePublished}")`);
  }
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    url,
    datePublished,
    ...(dateModified ? { dateModified } : {}),
    author: { "@type": "Organization", name: authorName, ...(siteUrl ? { url: siteUrl } : {}) },
    publisher: { "@type": "Organization", name: publisherName, ...(siteUrl ? { url: siteUrl } : {}) },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

export interface CultivarCollectionJsonLd {
  readonly "@context": "https://schema.org";
  readonly "@type": "CollectionPage";
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly about: {
    readonly "@type": "Thing";
    readonly name: string;
    readonly alternateName?: string;
    readonly additionalProperty: ReadonlyArray<{
      readonly "@type": "PropertyValue";
      readonly name: string;
      readonly value: string;
    }>;
  };
}

/**
 * Build a schema.org CollectionPage JSON-LD document for a cultivar profile.
 * CollectionPage rather than Product because cultivars are not sold here —
 * the page collects horticultural evidence about the strain. Strain traits
 * are encoded as PropertyValue entries under `about`.
 */
export function buildCultivarCollectionJsonLd({
  name,
  alternateName,
  description,
  url,
  properties,
}: {
  name: string;
  alternateName?: string;
  description: string;
  url: string;
  properties: ReadonlyArray<{ name: string; value: string }>;
}): CultivarCollectionJsonLd {
  if (!name.trim()) throw new Error("buildCultivarCollectionJsonLd: name required");
  if (!description.trim()) throw new Error("buildCultivarCollectionJsonLd: description required");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`buildCultivarCollectionJsonLd: url must be absolute (got "${url}")`);
  }
  const additionalProperty = properties
    .filter((p) => p.name.trim() && p.value.trim())
    .map((p) => ({ "@type": "PropertyValue" as const, name: p.name, value: p.value }));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    about: {
      "@type": "Thing",
      name,
      ...(alternateName ? { alternateName } : {}),
      additionalProperty,
    },
  };
}
