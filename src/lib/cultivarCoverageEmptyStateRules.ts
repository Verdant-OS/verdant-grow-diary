/**
 * Pure view models for cultivar coverage gaps.
 *
 * Unknown cultivar slugs are not content documents. They must fail honestly,
 * canonicalize to the published library, and offer useful next steps without
 * inventing a profile or structured data. Filtered-zero states use the same
 * presenter so public crawl paths stay explicit and consistent.
 */
import { CULTIVARS_INDEX_PATH } from "@/lib/cultivarIndexSeoRules";

export type CultivarCoverageEmptyStateKind = "missing_profile" | "filtered_empty";

export interface CultivarCoverageEmptyStateLink {
  id: "browse" | "guide" | "diary";
  label: string;
  to: string;
  emphasis: "primary" | "secondary";
}

export interface CultivarCoverageEmptyStateView {
  kind: CultivarCoverageEmptyStateKind;
  eyebrow: string;
  title: string;
  description: string;
  links: readonly CultivarCoverageEmptyStateLink[];
  offersClearFilters: boolean;
}

const SHARED_LINKS: readonly CultivarCoverageEmptyStateLink[] = Object.freeze([
  {
    id: "browse",
    label: "Browse published cultivar references",
    to: CULTIVARS_INDEX_PATH,
    emphasis: "primary",
  },
  {
    id: "guide",
    label: "Read the grow-stage care guide",
    to: "/guides/grow-stage-care-guide",
    emphasis: "secondary",
  },
  {
    id: "diary",
    label: "Open your grow diary",
    to: "/timeline",
    emphasis: "secondary",
  },
]);

/**
 * Turn an unknown URL slug into restrained display copy.
 *
 * Only the same lowercase ASCII slug shape used by published profiles is
 * reflected. Encoded separators, control characters, overlong input, and
 * malformed percent-encoding fail closed to a neutral label.
 */
export function formatMissingCultivarName(slug: unknown): string | null {
  if (typeof slug !== "string") return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }

  const normalized = decoded.trim().toLowerCase();
  if (
    normalized.length < 2 ||
    normalized.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
  ) {
    return null;
  }

  return normalized
    .split("-")
    .map((word) =>
      /\d/.test(word) && word.length <= 5
        ? word.toUpperCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

export function buildMissingCultivarCoverageState(slug: unknown): CultivarCoverageEmptyStateView {
  const requestedName = formatMissingCultivarName(slug);
  return {
    kind: "missing_profile",
    eyebrow: "Cultivar coverage",
    title: requestedName
      ? `${requestedName} is not in Verdant’s published library yet`
      : "This cultivar is not in Verdant’s published library yet",
    description:
      "Verdant only publishes a cultivar profile when it can show sources, confidence, and missing information. Browse the current references or keep recording what your plant actually does.",
    links: SHARED_LINKS,
    offersClearFilters: false,
  };
}

export function buildFilteredCultivarCoverageState(): CultivarCoverageEmptyStateView {
  return {
    kind: "filtered_empty",
    eyebrow: "No matching coverage",
    title: "No published cultivar profiles match this view",
    description:
      "Try a broader search, clear the filters, or use the grow-stage guide while Verdant’s source-backed cultivar library grows.",
    links: SHARED_LINKS,
    offersClearFilters: true,
  };
}
