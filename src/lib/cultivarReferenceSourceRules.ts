/**
 * Strain Reference Library V1.1 — explicit reference-source state.
 *
 * Pure. Decides which catalog the public cultivar pages render and says why.
 * The bundled library is always the visible fallback; a fallback is never
 * silent (`state` + `reason` are exposed to the page and to tests), and a
 * database problem never upgrades sample evidence or invents content.
 */
import {
  VERDANT_CULTIVARS,
  getCultivarGuideSections,
  getCultivarSources,
  type CultivarGuideSection,
  type CultivarSource,
  type VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";
import {
  mapCultivarDatabaseSnapshot,
  type CultivarDatabaseCatalogData,
} from "@/lib/cultivarDatabaseReadModel";
import type { CultivarSnapshotResult } from "@/lib/cultivarReferenceService";

export type CultivarReferenceSourceState = "database" | "bundled_fallback" | "loading" | "error";

export type CultivarReferenceSourceReason =
  | "flag_disabled"
  | "database_pending"
  | "database_error"
  | "database_invalid"
  | "database_empty"
  | "database_incomplete"
  | "database_unapproved";

export interface CultivarReferenceCatalog {
  origin: "database" | "bundled";
  profiles: readonly VerdantCultivarProfile[];
  findBySlug(slug: string | undefined): VerdantCultivarProfile | undefined;
  sectionsFor(profile: VerdantCultivarProfile): readonly CultivarGuideSection[];
  sourcesFor(profile: VerdantCultivarProfile): readonly CultivarSource[];
}

export interface CultivarReferenceSourceResolution {
  state: CultivarReferenceSourceState;
  /** Why the bundled library is showing; null only when the database is the source. */
  reason: CultivarReferenceSourceReason | null;
  catalog: CultivarReferenceCatalog;
  /** Count of database rows refused by the read model (0 unless reason is database_invalid). */
  refusedRowIssues: number;
}

export type CultivarReferenceQueryState =
  | { status: "pending" }
  | { status: "error"; error: string }
  | { status: "success"; result: CultivarSnapshotResult };

const BUNDLED_BY_SLUG = new Map(VERDANT_CULTIVARS.map((profile) => [profile.slug, profile]));

export const BUNDLED_CULTIVAR_CATALOG: CultivarReferenceCatalog = Object.freeze({
  origin: "bundled" as const,
  profiles: VERDANT_CULTIVARS,
  findBySlug: (slug: string | undefined) => (slug ? BUNDLED_BY_SLUG.get(slug) : undefined),
  sectionsFor: getCultivarGuideSections,
  sourcesFor: getCultivarSources,
});

export function buildDatabaseCultivarCatalog(
  data: CultivarDatabaseCatalogData,
): CultivarReferenceCatalog {
  const bySlug = new Map(data.profiles.map((profile) => [profile.slug, profile]));
  return Object.freeze({
    origin: "database" as const,
    profiles: data.profiles,
    findBySlug: (slug: string | undefined) => (slug ? bySlug.get(slug) : undefined),
    // A database profile without stored sections never reaches the catalog,
    // so the empty fallbacks below are unreachable defence, not content.
    sectionsFor: (profile: VerdantCultivarProfile) => data.sectionsBySlug[profile.slug] ?? [],
    sourcesFor: (profile: VerdantCultivarProfile) => data.sourcesBySlug[profile.slug] ?? [],
  });
}

function fallback(
  state: CultivarReferenceSourceState,
  reason: CultivarReferenceSourceReason,
  refusedRowIssues = 0,
): CultivarReferenceSourceResolution {
  return { state, reason, catalog: BUNDLED_CULTIVAR_CATALOG, refusedRowIssues };
}

export function resolveCultivarReferenceSource(input: {
  databaseReadsEnabled: boolean;
  query: CultivarReferenceQueryState;
}): CultivarReferenceSourceResolution {
  if (!input.databaseReadsEnabled) return fallback("bundled_fallback", "flag_disabled");
  const { query } = input;
  if (query.status === "pending") return fallback("loading", "database_pending");
  if (query.status === "error" || !query.result.ok) return fallback("error", "database_error");

  const mapped = mapCultivarDatabaseSnapshot(query.result.snapshot);
  // Fail closed as a whole: a partially valid catalog would silently drop or
  // mix profiles, so any refused row returns the visible bundled library.
  if (mapped.issues.length > 0) {
    return fallback("bundled_fallback", "database_invalid", mapped.issues.length);
  }
  if (mapped.catalog.profiles.length === 0) return fallback("bundled_fallback", "database_empty");
  // V1.1 cutover is parity-gated: the database slug set must EQUAL the approved
  // set. A missing profile would silently drop a public page; an extra one
  // would list on /cultivars while its direct URL redirects during loading.
  const databaseSlugs = new Set(mapped.catalog.profiles.map((profile) => profile.slug));
  if (VERDANT_CULTIVARS.some((profile) => !databaseSlugs.has(profile.slug))) {
    return fallback("bundled_fallback", "database_incomplete");
  }
  if (mapped.catalog.profiles.some((profile) => !BUNDLED_BY_SLUG.has(profile.slug))) {
    return fallback("bundled_fallback", "database_unapproved");
  }
  return {
    state: "database",
    reason: null,
    catalog: buildDatabaseCultivarCatalog(mapped.catalog),
    refusedRowIssues: 0,
  };
}
