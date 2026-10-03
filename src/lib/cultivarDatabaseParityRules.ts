/**
 * Strain Reference Library V1.1 — deterministic database parity audit.
 *
 * Compares the approved bundled read model (PR #418) with what the published
 * database read surface yields through the SAME read model the public pages
 * use. Pure: no I/O, no clock, no randomness; identical inputs always produce
 * an identical report.
 *
 * Status:
 *   ready   — exact approved parity, every field, claim, source and section;
 *   blocked — measurable missing, unexpected, or changed content;
 *   invalid — malformed rows the read model refuses to represent.
 */
import {
  CULTIVAR_GUIDE_SECTION_KEYS,
  type CultivarGuideSection,
  type CultivarSource,
  type VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";
import {
  CULTIVAR_AUXILIARY_TRAITS,
  mapCultivarDatabaseSnapshot,
  CULTIVAR_DATABASE_READ_SURFACE,
  CULTIVAR_DATABASE_TABLES,
  normalizeCultivarAliasForDatabase,
  renderedClaimKey,
  type CultivarDatabaseRow,
  type CultivarDatabaseAuxiliaryClaim,
  type CultivarDatabaseSnapshot,
} from "@/lib/cultivarDatabaseReadModel";
import {
  buildCultivarDatabaseSeedPayload,
  cultivarSeedPayloadToSnapshot,
  expectedAliasSourceKey,
  expectedSectionSourceKeys,
  type CultivarSeedPayloadCultivar,
} from "@/lib/cultivarDatabaseSeedPayloadRules";

const isoOrNull = (value: string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

// ---------------------------------------------------------------------------
// Row-level parity: every selected column of every published row
// ---------------------------------------------------------------------------

const TIMESTAMP_COLUMNS = new Set([
  "last_verified_at",
  "retrieved_at",
  "verified_at",
  "published_at",
]);

function normalizeCell(column: string, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (TIMESTAMP_COLUMNS.has(column) && typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : value;
  }
  // PostgREST may return numeric columns as strings; compare them as numbers.
  if (typeof value === "string" && /^-?\d+\.\d+$/.test(value.trim()) && column !== "url") {
    return Number(value.trim());
  }
  return value;
}

/**
 * Canonical form of the published read surface: per table, rows keyed by
 * their natural identity, with database-generated ids dropped and foreign
 * keys replaced by the natural key they point at. Two snapshots holding the
 * same content compare equal regardless of generated ids or row order.
 */
function canonicalRows(
  snapshot: CultivarDatabaseSnapshot,
): Record<string, Record<string, Record<string, unknown>>> {
  const rows = (table: keyof CultivarDatabaseSnapshot): readonly CultivarDatabaseRow[] =>
    Array.isArray(snapshot[table]) ? snapshot[table] : [];
  const index = (
    table: keyof CultivarDatabaseSnapshot,
    label: (row: CultivarDatabaseRow) => string,
  ) => new Map(rows(table).map((row) => [String(row.id), label(row)]));
  const breeders = index("breeders", (row) => String(row.normalized_name));
  const cultivars = index("cultivars", (row) => String(row.slug));
  const sources = index("cultivar_sources", (row) => String(row.source_key));
  const templates = index(
    "cultivar_guide_templates",
    (row) => `${String(row.template_key)}@${String(row.version)}`,
  );
  const ref = (map: Map<string, string>, value: unknown): string | null =>
    value === null || value === undefined
      ? null
      : (map.get(String(value)) ?? `unresolved:${String(value)}`);
  const guides = index(
    "cultivar_guides",
    (row) => `${ref(cultivars, row.cultivar_id)}@${String(row.version)}`,
  );
  const sections = index(
    "cultivar_guide_sections",
    (row) => `${ref(guides, row.guide_id)}/${String(row.section_key)}`,
  );
  const foreignKeys: Record<string, Map<string, string>> = {
    breeder_id: breeders,
    cultivar_id: cultivars,
    source_id: sources,
    base_template_id: templates,
    guide_id: guides,
    guide_section_id: sections,
  };
  const rowKey: Record<string, (row: CultivarDatabaseRow) => string> = {
    breeders: (row) => String(row.normalized_name),
    cultivars: (row) => String(row.slug),
    cultivar_aliases: (row) => `${ref(cultivars, row.cultivar_id)}|${String(row.normalized_alias)}`,
    cultivar_sources: (row) => String(row.source_key),
    cultivar_profile_sources: (row) =>
      `${ref(cultivars, row.cultivar_id)}|${ref(sources, row.source_id)}`,
    cultivar_claims: (row) =>
      `${ref(cultivars, row.cultivar_id)}|${String(row.trait_key)}|${
        row.trait_key === "terpene" ? String(row.value_text) : ""
      }`,
    cultivar_guides: (row) => `${ref(cultivars, row.cultivar_id)}@${String(row.version)}`,
    cultivar_guide_templates: (row) => `${String(row.template_key)}@${String(row.version)}`,
    cultivar_guide_sections: (row) => `${ref(guides, row.guide_id)}/${String(row.section_key)}`,
    cultivar_guide_section_sources: (row) =>
      `${ref(sections, row.guide_section_id)}|${ref(sources, row.source_id)}`,
  };

  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const table of CULTIVAR_DATABASE_TABLES) {
    const columns = CULTIVAR_DATABASE_READ_SURFACE[table]
      .split(",")
      .filter((column) => column !== "id");
    const groups = new Map<string, Array<{ canonical: Record<string, unknown>; text: string }>>();
    for (const row of rows(table)) {
      const canonical: Record<string, unknown> = {};
      for (const column of columns) {
        const map = foreignKeys[column];
        canonical[column] = map ? ref(map, row[column]) : normalizeCell(column, row[column]);
      }
      const key = rowKey[table](row);
      const group = groups.get(key) ?? [];
      group.push({ canonical, text: JSON.stringify(canonical) });
      groups.set(key, group);
    }
    // Rows sharing a natural key are ordered by their canonical contents
    // before taking #2, #3… suffixes, so findings never depend on the
    // (unspecified) order the rows were read in.
    const byKey: Record<string, Record<string, unknown>> = {};
    for (const [key, group] of groups) {
      group.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
      group.forEach((entry, index) => {
        byKey[index === 0 ? key : `${key}#${index + 1}`] = entry.canonical;
      });
    }
    out[table] = byKey;
  }
  return out;
}

/** Tables whose canonical row key starts with the owning cultivar's slug. */
const CULTIVAR_SCOPED_TABLES = new Set<string>([
  "cultivars",
  "cultivar_aliases",
  "cultivar_profile_sources",
  "cultivar_claims",
  "cultivar_guides",
  "cultivar_guide_sections",
  "cultivar_guide_section_sources",
]);

/**
 * The cultivar a canonical row belongs to, or null for shared rows
 * (breeders, sources, templates) and rows whose cultivar does not resolve.
 */
function canonicalRowSlug(table: string, key: string): string | null {
  if (!CULTIVAR_SCOPED_TABLES.has(table)) return null;
  const slug = key.split(/[|@/#]/)[0];
  return slug === "" || slug === "null" || slug.startsWith("unresolved:") ? null : slug;
}

/** Provenance fields of a stored auxiliary claim, in comparable form. */
function auxiliaryMetadata(claim: CultivarDatabaseAuxiliaryClaim): Record<string, unknown> {
  return {
    confidence: claim.confidence,
    verifiedAt: claim.verifiedAt,
    unit: claim.unit,
    context: claim.context,
  };
}

/** The same fields from the approved payload row, or null when it has none. */
function approvedAuxiliaryMetadata(
  approved: CultivarSeedPayloadCultivar | undefined,
  traitKey: string,
): Record<string, unknown> | null {
  const claim = approved?.claims.find((item) => item.trait_key === traitKey);
  if (!claim) return null;
  return {
    confidence: claim.confidence,
    verifiedAt: isoOrNull(claim.verified_at),
    unit: claim.unit,
    context: claim.context,
  };
}

export const CULTIVAR_PARITY_REPORT_VERSION = 1;

export type CultivarParityStatus = "ready" | "blocked" | "invalid";
export type CultivarParityIssueKind = "missing" | "unexpected" | "changed" | "malformed";

export interface CultivarParityIssue {
  slug: string | null;
  kind: CultivarParityIssueKind;
  path: string;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

export interface CultivarParityReport {
  reportVersion: typeof CULTIVAR_PARITY_REPORT_VERSION;
  status: CultivarParityStatus;
  expectedSlugs: readonly string[];
  matchedSlugs: readonly string[];
  counts: {
    profiles: { expected: number; database: number };
    aliases: { expected: number; database: number };
    terpeneClaims: { expected: number; database: number };
    cannabinoidClaims: { expected: number; database: number };
    profileSources: { expected: number; database: number };
    guideSections: { expected: number; database: number };
    sources: { expected: number; database: number };
  };
  issues: readonly CultivarParityIssue[];
}

export interface CultivarParityInput {
  bundledProfiles: readonly VerdantCultivarProfile[];
  bundledSources: readonly CultivarSource[];
  bundledSectionsFor: (profile: VerdantCultivarProfile) => readonly CultivarGuideSection[];
  bundledSourcesFor: (profile: VerdantCultivarProfile) => readonly CultivarSource[];
  snapshot: CultivarDatabaseSnapshot;
}

// ---------------------------------------------------------------------------
// Structural diff
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(
  slug: string | null,
  path: string,
  expected: unknown,
  actual: unknown,
  out: CultivarParityIssue[],
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      const itemPath = `${path}[${index}]`;
      if (index >= actual.length) {
        out.push({ slug, kind: "missing", path: itemPath, expected: expected[index] });
      } else if (index >= expected.length) {
        out.push({ slug, kind: "unexpected", path: itemPath, actual: actual[index] });
      } else {
        diffValues(slug, itemPath, expected[index], actual[index], out);
      }
    }
    return;
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      const itemPath = `${path}.${key}`;
      const hasExpected = expected[key] !== undefined;
      const hasActual = actual[key] !== undefined;
      if (hasExpected && !hasActual) {
        out.push({ slug, kind: "missing", path: itemPath, expected: expected[key] });
      } else if (!hasExpected && hasActual) {
        out.push({ slug, kind: "unexpected", path: itemPath, actual: actual[key] });
      } else if (hasExpected) {
        diffValues(slug, itemPath, expected[key], actual[key], out);
      }
    }
    return;
  }
  out.push({ slug, kind: "changed", path, expected, actual });
}

/** Every public profile field except the bundled-only overlay mechanism. */
function projectProfile(profile: VerdantCultivarProfile): Record<string, unknown> {
  const { guideOverlays: _overlays, ...fields } = profile;
  return fields;
}

function compareIssues(a: CultivarParityIssue, b: CultivarParityIssue): number {
  const slugA = a.slug ?? "";
  const slugB = b.slug ?? "";
  if (slugA !== slugB) return slugA < slugB ? -1 : 1;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  // Full tie-break on the remaining fields: PostgREST row order is unspecified,
  // so equal (slug, path, kind) issues must not keep insertion order.
  const restA = JSON.stringify([a.message ?? "", a.expected ?? null, a.actual ?? null]);
  const restB = JSON.stringify([b.message ?? "", b.expected ?? null, b.actual ?? null]);
  return restA < restB ? -1 : restA > restB ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function auditCultivarDatabaseParity(input: CultivarParityInput): CultivarParityReport {
  const mapped = mapCultivarDatabaseSnapshot(input.snapshot);
  const issues: CultivarParityIssue[] = mapped.issues.map((issue) => ({
    slug: issue.slug,
    kind: "malformed" as const,
    path: issue.path,
    message: issue.message,
  }));
  const malformedSlugs = new Set(mapped.issues.map((issue) => issue.slug));

  const databaseBySlug = new Map(mapped.catalog.profiles.map((profile) => [profile.slug, profile]));
  // The approved normalized rows: exactly what the migration payload builder
  // produces from the bundled library, so expected metadata is never re-typed.
  const approvedPayload = buildCultivarDatabaseSeedPayload({
    profiles: input.bundledProfiles,
    sources: input.bundledSources,
    sectionsFor: input.bundledSectionsFor,
  });
  const approvedBySlug = new Map(approvedPayload.cultivars.map((row) => [row.slug, row]));
  const expectedSlugs = input.bundledProfiles.map((profile) => profile.slug).sort();

  for (const expected of [...input.bundledProfiles].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  )) {
    const slug = expected.slug;
    const actual = databaseBySlug.get(slug);
    if (!actual) {
      if (!malformedSlugs.has(slug)) {
        issues.push({
          slug,
          kind: "missing",
          path: "profile",
          message: "no published database row",
        });
      }
      continue;
    }

    diffValues(slug, "profile", projectProfile(expected), projectProfile(actual), issues);
    diffValues(
      slug,
      "guideSections",
      input.bundledSectionsFor(expected),
      mapped.catalog.sectionsBySlug[slug] ?? [],
      issues,
    );
    diffValues(
      slug,
      "profileSources",
      input.bundledSourcesFor(expected),
      mapped.catalog.sourcesBySlug[slug] ?? [],
      issues,
    );
    diffValues(
      slug,
      "aliasNormalization",
      expected.aliases.map((alias) => ({
        alias,
        normalizedAlias: normalizeCultivarAliasForDatabase(alias),
        sourceKey: expectedAliasSourceKey(expected),
      })),
      mapped.aliasRecordsBySlug[slug] ?? [],
      issues,
    );

    // Section→source links: the read model refuses an UNLINKED tendency
    // (malformed); here the complete per-section link sets must match the
    // approved ones exactly, so a stale or extra link is reported too.
    const expectedLinks: Record<string, string[]> = {};
    for (const section of input.bundledSectionsFor(expected)) {
      const keys = expectedSectionSourceKeys(expected, section);
      if (keys.length > 0) expectedLinks[section.key] = keys;
    }
    diffValues(
      slug,
      "sectionSourceLinks",
      expectedLinks,
      mapped.sectionSourceKeysBySlug[slug] ?? {},
      issues,
    );

    // Stored guide and section metadata, and each link's support note, must
    // match the approved normalized rows exactly.
    const approved = approvedBySlug.get(slug);
    if (approved) {
      diffValues(
        slug,
        "guideMetadata",
        {
          version: approved.guide.version,
          baseTemplateKey: approved.guide.base_template_key,
          title: approved.guide.title,
          confidence: approved.guide.confidence,
          contentSchemaVersion: approved.guide.content_schema_version,
          lastVerifiedAt: isoOrNull(approved.guide.last_verified_at),
          publishedAt: isoOrNull(approved.guide.published_at),
        },
        mapped.guideMetadataBySlug[slug] ?? null,
        issues,
      );
      diffValues(
        slug,
        "sectionMetadata",
        Object.fromEntries(
          approved.sections.map((section) => [
            section.section_key,
            {
              sortOrder: section.sort_order,
              contentSchemaVersion: section.content_schema_version,
              lastVerifiedAt: isoOrNull(section.last_verified_at),
              sourceNotes: Object.fromEntries(
                section.sources.map((link) => [link.source_key, link.support_note]),
              ),
            },
          ]),
        ),
        mapped.sectionMetadataBySlug[slug] ?? {},
        issues,
      );
    }

    // Every rendered claim's verified_at must match the approved row.
    if (approved) {
      const expectedVerifiedAt: Record<string, string | null> = {};
      for (const claim of approved.claims) {
        if (claim.trait_key === "chemotype" || claim.trait_key === "reported_dominant_terpenes") {
          continue;
        }
        expectedVerifiedAt[renderedClaimKey(claim.trait_key, claim.value_text)] = isoOrNull(
          claim.verified_at,
        );
      }
      diffValues(
        slug,
        "claimVerifiedAt",
        expectedVerifiedAt,
        mapped.renderedClaimVerifiedAtBySlug[slug] ?? {},
        issues,
      );
    }

    // Stored-but-not-rendered claims must agree with the rendered fields.
    const auxiliary = mapped.auxiliaryClaimsBySlug[slug] ?? [];
    const known = new Set<string>(CULTIVAR_AUXILIARY_TRAITS);
    for (const claim of auxiliary) {
      if (!known.has(claim.traitKey)) {
        issues.push({
          slug,
          kind: "unexpected",
          path: `claims.${claim.traitKey}`,
          actual: claim.valueText ?? claim.valueJsonb,
          message: "claim trait is not part of the approved public read model",
        });
      }
    }
    const chemotypeClaims = auxiliary.filter((claim) => claim.traitKey === "chemotype");
    if (chemotypeClaims.length !== 1) {
      issues.push({
        slug,
        kind: chemotypeClaims.length === 0 ? "missing" : "unexpected",
        path: "claims.chemotype",
        expected: 1,
        actual: chemotypeClaims.length,
      });
    } else {
      diffValues(
        slug,
        "claims.chemotype",
        expected.chemotype,
        chemotypeClaims[0].valueText,
        issues,
      );
      diffValues(
        slug,
        "claims.chemotype.sourceKey",
        approved?.claims.find((claim) => claim.trait_key === "chemotype")?.source_key ?? null,
        chemotypeClaims[0].sourceKey,
        issues,
      );
      diffValues(
        slug,
        "claims.chemotype.metadata",
        approvedAuxiliaryMetadata(approved, "chemotype"),
        auxiliaryMetadata(chemotypeClaims[0]),
        issues,
      );
    }
    const dominantClaims = auxiliary.filter(
      (claim) => claim.traitKey === "reported_dominant_terpenes",
    );
    if (dominantClaims.length !== 1) {
      issues.push({
        slug,
        kind: dominantClaims.length === 0 ? "missing" : "unexpected",
        path: "claims.reported_dominant_terpenes",
        expected: 1,
        actual: dominantClaims.length,
      });
    } else {
      diffValues(
        slug,
        "claims.reported_dominant_terpenes",
        [...expected.dominantTerpenes],
        dominantClaims[0].valueJsonb,
        issues,
      );
      diffValues(
        slug,
        "claims.reported_dominant_terpenes.sourceKey",
        approved?.claims.find((claim) => claim.trait_key === "reported_dominant_terpenes")
          ?.source_key ?? null,
        dominantClaims[0].sourceKey,
        issues,
      );
      diffValues(
        slug,
        "claims.reported_dominant_terpenes.metadata",
        approvedAuxiliaryMetadata(approved, "reported_dominant_terpenes"),
        auxiliaryMetadata(dominantClaims[0]),
        issues,
      );
    }
  }

  const expectedSlugSet = new Set(expectedSlugs);
  for (const profile of mapped.catalog.profiles) {
    if (!expectedSlugSet.has(profile.slug)) {
      issues.push({
        slug: profile.slug,
        kind: "unexpected",
        path: "profile",
        message: "published database profile is not in the approved bundled library",
      });
    }
  }

  // Row-level parity: every selected column of every published row must match
  // the rows the approved payload produces, so no column can drift unseen.
  const approvedRows = canonicalRows(cultivarSeedPayloadToSnapshot(approvedPayload));
  const databaseRows = canonicalRows(input.snapshot);
  // Each finding names the cultivar its row belongs to, so a row-level drift
  // can never sit beside that cultivar in matchedSlugs.
  for (const table of CULTIVAR_DATABASE_TABLES) {
    const expectedRows = approvedRows[table];
    const actualRows = databaseRows[table];
    const keys = [...new Set([...Object.keys(expectedRows), ...Object.keys(actualRows)])].sort();
    for (const key of keys) {
      const slug = canonicalRowSlug(table, key);
      const path = `rows.${table}.${key}`;
      if (actualRows[key] === undefined) {
        issues.push({ slug, kind: "missing", path, expected: expectedRows[key] });
      } else if (expectedRows[key] === undefined) {
        issues.push({ slug, kind: "unexpected", path, actual: actualRows[key] });
      } else {
        diffValues(slug, path, expectedRows[key], actualRows[key], issues);
      }
    }
  }

  // Every approved source must exist with identical citation fields.
  const databaseSources = new Map(mapped.catalog.sources.map((source) => [source.key, source]));
  for (const source of [...input.bundledSources].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const actual = databaseSources.get(source.key);
    if (!actual) {
      issues.push({ slug: null, kind: "missing", path: `sources.${source.key}` });
    } else {
      diffValues(null, `sources.${source.key}`, source, actual, issues);
    }
  }
  // …and no source beyond the approved set may be present.
  const bundledSourceKeys = new Set(input.bundledSources.map((source) => source.key));
  for (const source of mapped.catalog.sources) {
    if (!bundledSourceKeys.has(source.key)) {
      issues.push({
        slug: null,
        kind: "unexpected",
        path: `sources.${source.key}`,
        message: "readable source is not in the approved bundled catalog",
      });
    }
  }

  issues.sort(compareIssues);
  // Matched only after EVERY check, row-level parity included.
  const slugsWithIssues = new Set(issues.map((issue) => issue.slug));
  const matchedSlugs = expectedSlugs.filter(
    (slug) => databaseBySlug.has(slug) && !slugsWithIssues.has(slug),
  );
  const status: CultivarParityStatus = issues.some((issue) => issue.kind === "malformed")
    ? "invalid"
    : issues.length > 0
      ? "blocked"
      : "ready";

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const databaseProfiles = mapped.catalog.profiles;
  return {
    reportVersion: CULTIVAR_PARITY_REPORT_VERSION,
    status,
    expectedSlugs,
    matchedSlugs,
    counts: {
      profiles: { expected: input.bundledProfiles.length, database: databaseProfiles.length },
      aliases: {
        expected: sum(input.bundledProfiles.map((profile) => profile.aliases.length)),
        database: sum(databaseProfiles.map((profile) => profile.aliases.length)),
      },
      terpeneClaims: {
        expected: sum(input.bundledProfiles.map((profile) => profile.terpeneClaims.length)),
        database: sum(databaseProfiles.map((profile) => profile.terpeneClaims.length)),
      },
      cannabinoidClaims: {
        expected: sum(input.bundledProfiles.map((profile) => profile.cannabinoidClaims.length)),
        database: sum(databaseProfiles.map((profile) => profile.cannabinoidClaims.length)),
      },
      profileSources: {
        expected: sum(input.bundledProfiles.map((profile) => profile.sourceKeys.length)),
        database: sum(databaseProfiles.map((profile) => profile.sourceKeys.length)),
      },
      guideSections: {
        expected: input.bundledProfiles.length * CULTIVAR_GUIDE_SECTION_KEYS.length,
        database: sum(
          databaseProfiles.map(
            (profile) => mapped.catalog.sectionsBySlug[profile.slug]?.length ?? 0,
          ),
        ),
      },
      sources: { expected: input.bundledSources.length, database: mapped.catalog.sources.length },
    },
    issues,
  };
}

/** Exit code for the CLI: strict mode fails on anything but `ready`. */
export function cultivarParityExitCode(report: CultivarParityReport, strict: boolean): number {
  if (!strict) return 0;
  return report.status === "ready" ? 0 : 1;
}
