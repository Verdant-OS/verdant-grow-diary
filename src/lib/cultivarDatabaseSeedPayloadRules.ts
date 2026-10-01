/**
 * Strain Reference Library V1.1 — database seed payload.
 *
 * The approved bundled profiles (PR #418) are the content source of truth. This
 * module turns them into the single JSON payload the V1.1 parity migration
 * normalizes into the reference tables, and turns that payload back into the
 * row snapshot those tables hold afterwards, so the parity audit can run fully
 * offline against the checked-in migration.
 *
 * Pure and deterministic: stable identifiers derive from list positions, never
 * from a clock or randomness.
 */
import type {
  CultivarGuideSection,
  CultivarGuideSectionKey,
  CultivarSource,
  VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";
import {
  CULTIVAR_DATA_ORIGIN_DATABASE_VALUES,
  CULTIVAR_DIFFICULTY_DATABASE_VALUES,
  CULTIVAR_TERPENE_TRAIT,
  normalizeCultivarAliasForDatabase,
  type CultivarDatabaseRow,
  type CultivarDatabaseSnapshot,
} from "@/lib/cultivarDatabaseReadModel";
import { normalizeSharedSearchText } from "@/lib/sharedSearchTextRules";

export const CULTIVAR_SEED_PAYLOAD_VERSION = 1;
/** Dollar-quote tag that wraps the payload inside the migration file. */
export const CULTIVAR_SEED_PAYLOAD_TAG = "verdant_cultivar_payload";
/**
 * The migration that currently carries the approved payload. Shared by the
 * audit script, the RLS harness and the drift guard. When approved content
 * changes, ship a new additive migration with a fresh payload and move this
 * constant to it; published migrations are never edited.
 */
export const CULTIVAR_PARITY_MIGRATION_PATH =
  "supabase/migrations/20261001160000_strain_reference_library_v1_1_parity.sql";

/** Context strings the V1 seed wrote for its stored-but-not-rendered claims. */
const CHEMOTYPE_CLAIM_CONTEXT = {
  classification_basis:
    "Source-reviewed named-cultivar prior; not a batch-specific laboratory panel.",
  variability_note:
    "Chemotype is a stronger prior than market indica/sativa labelling but remains source- and sample-dependent.",
} as const;
const DOMINANT_TERPENES_CLAIM_CONTEXT = {
  analytical_method: "not_reported",
  sample_scope: "Public named-cultivar summary; not a batch-specific laboratory result.",
  variability_note:
    "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method.",
} as const;
/** The V1 seed's overview support note, kept verbatim so the upsert is a no-op there. */
const OVERVIEW_SUPPORT_NOTE =
  "Supports the reported cultivar tendency in this overview; does not convert the public profile into universal plant-specific advice.";
const SECTION_SUPPORT_NOTE =
  "Supports the reported tendencies in this section; does not convert the public profile into universal plant-specific advice.";

const CANNABINOID_TRAIT_KEYS: Readonly<Record<string, string>> = {
  reported_thc: "reported_thc_pct",
  reported_cbd: "reported_cbd_pct",
};

// ---------------------------------------------------------------------------
// Payload shape (snake_case, mirrors the SQL columns it feeds)
// ---------------------------------------------------------------------------

export interface CultivarSeedPayloadSource {
  id: string;
  source_key: string;
  title: string;
  publisher: string;
  url: string;
  source_type: string;
  retrieved_at: string;
  license_or_usage_notes: string;
}

export interface CultivarSeedPayloadBreeder {
  name: string;
  normalized_name: string;
  slug: string;
}

export interface CultivarSeedPayloadClaim {
  id: string;
  trait_key: string;
  value_min: number | null;
  value_max: number | null;
  value_text: string | null;
  value_jsonb: unknown;
  unit: string | null;
  context: Record<string, unknown>;
  source_key: string;
  confidence: string;
  verified_at: string;
}

export interface CultivarSeedPayloadSection {
  section_key: CultivarGuideSectionKey;
  sort_order: number;
  confidence: string;
  content_schema_version: number;
  last_verified_at: string;
  content: {
    title: string;
    summary: string;
    reported_tendencies: { text: string; confidence: string; evidence_keys: string[] }[];
    guidance: { text: string; risk: string }[];
    cautions: string[];
    missing_information: string[];
    sample_reference_data: true;
  };
  sources: { source_key: string; support_note: string }[];
}

export interface CultivarSeedPayloadCultivar {
  id: string;
  slug: string;
  canonical_name: string;
  normalized_name: string;
  breeder_normalized_name: string | null;
  life_cycle: string;
  seed_expression: string;
  market_classification: string;
  lineage_text: string;
  description: string;
  difficulty: string;
  height_category: string;
  chemotype: string;
  flowering_days_min: number | null;
  flowering_days_max: number | null;
  flowering_window_label: string;
  stretch_min: number | null;
  stretch_max: number | null;
  yield_indoor_g_per_m2_min: number | null;
  yield_indoor_g_per_m2_max: number | null;
  thc_pct_min: number | null;
  thc_pct_max: number | null;
  cbd_pct_min: number | null;
  cbd_pct_max: number | null;
  dominant_terpenes: string[];
  pheno_hunt_focus: string[];
  sample_phenos: {
    label: string;
    structure: string;
    aroma: string;
    resin: string;
    yield_note: string;
    finish_note: string;
  }[];
  publication_status: string;
  verification_status: string;
  data_origin: string;
  last_verified_at: string;
  aliases: { alias: string; normalized_alias: string; sort_order: number; source_key: string }[];
  profile_sources: { source_key: string; sort_order: number }[];
  claims: CultivarSeedPayloadClaim[];
  guide: {
    id: string;
    version: number;
    title: string;
    base_template_key: string;
    publication_status: string;
    confidence: string;
    content_schema_version: number;
    last_verified_at: string;
    published_at: string;
  };
  sections: CultivarSeedPayloadSection[];
}

export interface CultivarSeedPayload {
  payload_version: typeof CULTIVAR_SEED_PAYLOAD_VERSION;
  sources: CultivarSeedPayloadSource[];
  breeders: CultivarSeedPayloadBreeder[];
  cultivars: CultivarSeedPayloadCultivar[];
}

export interface CultivarSeedPayloadInput {
  profiles: readonly VerdantCultivarProfile[];
  sources: readonly CultivarSource[];
  sectionsFor: (profile: VerdantCultivarProfile) => readonly CultivarGuideSection[];
}

// ---------------------------------------------------------------------------
// Stable identifiers
// ---------------------------------------------------------------------------

function stableUuid(prefix: string, ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error(`invalid ordinal ${ordinal}`);
  return `${prefix}-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
}

/** V1 seed numbering: shared literature 1–4, profile sources 101+. */
function sourceOrdinal(index: number): number {
  return index < 4 ? index + 1 : 100 + (index - 3);
}

function slugifyNormalized(normalized: string): string {
  return normalized.replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Section → source links
// ---------------------------------------------------------------------------

/**
 * The exact cultivar_guide_section_sources keys a section must carry: every
 * tendency's evidence key, plus the profile's own source on the overview (the
 * V1 seed's link). Sorted, de-duplicated. Shared by the payload builder and the
 * parity audit so they cannot drift apart.
 */
export function expectedSectionSourceKeys(
  profile: VerdantCultivarProfile,
  section: CultivarGuideSection,
): string[] {
  const keys = new Set(section.reportedTendencies.flatMap((tendency) => tendency.evidenceKeys));
  const profileSourceKey = profile.sourceKeys[0];
  if (section.key === "overview" && profileSourceKey) keys.add(profileSourceKey);
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The source an alias cites: the profile's own source. Shared by the payload
 * builder and the parity audit so alias provenance cannot drift.
 */
export function expectedAliasSourceKey(profile: VerdantCultivarProfile): string | null {
  return profile.sourceKeys[0] ?? null;
}

// ---------------------------------------------------------------------------
// Bundled → payload
// ---------------------------------------------------------------------------

export function buildCultivarDatabaseSeedPayload(
  input: CultivarSeedPayloadInput,
): CultivarSeedPayload {
  const sources: CultivarSeedPayloadSource[] = input.sources.map((source, index) => ({
    id: stableUuid("51000000", sourceOrdinal(index)),
    source_key: source.key,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    source_type: source.sourceType,
    retrieved_at: source.retrievedAt,
    license_or_usage_notes: source.licenseNotes,
  }));

  const breederNames = [
    ...new Set(input.profiles.map((profile) => profile.breeder).filter((b) => b !== null)),
  ] as string[];
  const breeders = breederNames
    .map((name) => {
      const normalized = normalizeSharedSearchText(name);
      return { name, normalized_name: normalized, slug: slugifyNormalized(normalized) };
    })
    .sort((a, b) => (a.normalized_name < b.normalized_name ? -1 : 1));

  // The V1 seed numbered guides by slug order.
  const slugsInOrder = input.profiles.map((profile) => profile.slug).sort();

  const cultivars = input.profiles.map((profile, index): CultivarSeedPayloadCultivar => {
    const ordinal = index + 1;
    const profileSourceKey = profile.sourceKeys[0];
    if (!profileSourceKey) throw new Error(`${profile.slug} has no profile source`);

    const claims: CultivarSeedPayloadClaim[] = [];
    for (const claim of profile.cannabinoidClaims) {
      const traitKey = CANNABINOID_TRAIT_KEYS[claim.cannabinoid];
      if (!traitKey) throw new Error(`${profile.slug}: unsupported ${claim.cannabinoid} claim`);
      const context: Record<string, unknown> = {
        measurement_basis: claim.context.measurementBasis,
        analytical_method: claim.context.analyticalMethod,
        sample_scope: claim.context.sampleScope,
        variability_note: claim.context.variabilityNote,
      };
      if (claim.context.decarboxylationFactor !== null) {
        context.decarboxylation_factor = claim.context.decarboxylationFactor;
      }
      claims.push({
        id: stableUuid("57000000", ordinal * 100 + (traitKey === "reported_thc_pct" ? 1 : 2)),
        trait_key: traitKey,
        value_min: claim.valueMinPct,
        value_max: claim.valueMaxPct,
        value_text: null,
        value_jsonb: null,
        unit: "%",
        context,
        source_key: claim.sourceKey,
        confidence: claim.confidence,
        verified_at: profile.lastVerifiedAt,
      });
    }
    claims.push({
      id: stableUuid("57000000", ordinal * 100 + 3),
      trait_key: "chemotype",
      value_min: null,
      value_max: null,
      value_text: profile.chemotype,
      value_jsonb: null,
      unit: null,
      context: { ...CHEMOTYPE_CLAIM_CONTEXT },
      source_key: profileSourceKey,
      confidence: "community",
      verified_at: profile.lastVerifiedAt,
    });
    claims.push({
      id: stableUuid("57000000", ordinal * 100 + 4),
      trait_key: "reported_dominant_terpenes",
      value_min: null,
      value_max: null,
      value_text: null,
      value_jsonb: [...profile.dominantTerpenes],
      unit: null,
      context: { ...DOMINANT_TERPENES_CLAIM_CONTEXT },
      source_key: profileSourceKey,
      confidence: "medium",
      verified_at: profile.lastVerifiedAt,
    });
    for (const terpene of profile.terpeneClaims) {
      if (terpene.rank === null) throw new Error(`${profile.slug}: unranked terpene claim`);
      const hasValue = terpene.valueMinPct !== null || terpene.valueMaxPct !== null;
      claims.push({
        id: stableUuid("56000000", ordinal * 100 + terpene.rank),
        trait_key: CULTIVAR_TERPENE_TRAIT,
        value_min: terpene.valueMinPct,
        value_max: terpene.valueMaxPct,
        value_text: terpene.terpene,
        value_jsonb: { rank: terpene.rank, aroma_descriptors: [...terpene.aromaDescriptors] },
        unit: hasValue ? "%" : null,
        context: {
          analytical_method: terpene.context.analyticalMethod,
          sample_scope: terpene.context.sampleScope,
          variability_note: terpene.context.variabilityNote,
        },
        source_key: terpene.sourceKey,
        confidence: terpene.confidence,
        verified_at: profile.lastVerifiedAt,
      });
    }

    const sections = input.sectionsFor(profile).map((section, sectionIndex) => {
      const sourceLinks = expectedSectionSourceKeys(profile, section).map((key) => ({
        source_key: key,
        support_note:
          section.key === "overview" && key === profileSourceKey
            ? OVERVIEW_SUPPORT_NOTE
            : SECTION_SUPPORT_NOTE,
      }));
      return {
        section_key: section.key,
        sort_order: (sectionIndex + 1) * 10,
        confidence: section.confidence,
        content_schema_version: profile.contentSchemaVersion,
        last_verified_at: profile.lastVerifiedAt,
        content: {
          title: section.title,
          summary: section.summary,
          reported_tendencies: section.reportedTendencies.map((tendency) => ({
            text: tendency.text,
            confidence: tendency.confidence,
            evidence_keys: [...tendency.evidenceKeys],
          })),
          guidance: section.guidance.map((item) => {
            if (item.appliesWhen) {
              throw new Error(`${profile.slug}/${section.key}: scoped guidance is not supported`);
            }
            return { text: item.text, risk: item.risk };
          }),
          cautions: [...section.cautions],
          missing_information: [...section.missingInformation],
          sample_reference_data: true as const,
        },
        sources: sourceLinks.sort((a, b) => (a.source_key < b.source_key ? -1 : 1)),
      };
    });

    return {
      id: stableUuid("54000000", ordinal),
      slug: profile.slug,
      canonical_name: profile.name,
      normalized_name: normalizeSharedSearchText(profile.name),
      breeder_normalized_name: profile.breeder ? normalizeSharedSearchText(profile.breeder) : null,
      life_cycle: profile.lifeCycle,
      seed_expression: profile.seedExpression,
      market_classification: profile.marketClassification,
      lineage_text: profile.lineage,
      description: profile.intro,
      difficulty: CULTIVAR_DIFFICULTY_DATABASE_VALUES[profile.difficulty],
      height_category: profile.heightCategory,
      chemotype: profile.chemotype,
      flowering_days_min: profile.floweringDaysMin,
      flowering_days_max: profile.floweringDaysMax,
      flowering_window_label: profile.flowerWeeks,
      stretch_min: profile.stretchMin,
      stretch_max: profile.stretchMax,
      yield_indoor_g_per_m2_min: profile.yieldIndoorGPerM2Min,
      yield_indoor_g_per_m2_max: profile.yieldIndoorGPerM2Max,
      thc_pct_min: profile.thcPctMin,
      thc_pct_max: profile.thcPctMax,
      cbd_pct_min: profile.cbdPctMin,
      cbd_pct_max: profile.cbdPctMax,
      dominant_terpenes: [...profile.dominantTerpenes],
      pheno_hunt_focus: [...profile.phenoHuntFocus],
      sample_phenos: profile.samplePhenos.map((pheno) => ({
        label: pheno.label,
        structure: pheno.structure,
        aroma: pheno.aroma,
        resin: pheno.resin,
        yield_note: pheno.yieldNote,
        finish_note: pheno.finishNote,
      })),
      publication_status: profile.publicationStatus,
      verification_status: profile.verificationStatus,
      data_origin: CULTIVAR_DATA_ORIGIN_DATABASE_VALUES[profile.dataOrigin],
      last_verified_at: profile.lastVerifiedAt,
      aliases: profile.aliases.map((alias, aliasIndex) => ({
        alias,
        normalized_alias: normalizeCultivarAliasForDatabase(alias),
        sort_order: aliasIndex,
        source_key: expectedAliasSourceKey(profile) ?? profileSourceKey,
      })),
      profile_sources: profile.sourceKeys.map((key, sourceIndex) => ({
        source_key: key,
        sort_order: sourceIndex,
      })),
      claims,
      guide: {
        id: stableUuid("55000000", slugsInOrder.indexOf(profile.slug) + 1),
        version: profile.guideVersion,
        title: `${profile.name} sample reference guide`,
        base_template_key:
          profile.lifeCycle === "autoflower" ? "autoflower_general" : "photoperiod_general",
        publication_status: "published",
        confidence: "medium",
        content_schema_version: profile.contentSchemaVersion,
        last_verified_at: profile.lastVerifiedAt,
        published_at: profile.lastVerifiedAt,
      },
      sections,
    };
  });

  return { payload_version: CULTIVAR_SEED_PAYLOAD_VERSION, sources, breeders, cultivars };
}

// ---------------------------------------------------------------------------
// Payload → post-migration row snapshot
// ---------------------------------------------------------------------------

/**
 * The rows the V1.1 migration leaves in the published read surface for the
 * payload's cultivars. Identifiers the database generates (breeder and section
 * ids) are replaced by deterministic placeholders; the read model only uses
 * them as join keys.
 */
export function cultivarSeedPayloadToSnapshot(
  payload: CultivarSeedPayload,
): CultivarDatabaseSnapshot {
  const sourceIdByKey = new Map(payload.sources.map((source) => [source.source_key, source.id]));
  const sourceId = (key: string): string => sourceIdByKey.get(key) ?? `missing-source:${key}`;
  const breederId = (normalized: string) => `breeder:${normalized}`;

  const snapshot: Record<keyof CultivarDatabaseSnapshot, CultivarDatabaseRow[]> = {
    breeders: payload.breeders.map((breeder) => ({
      id: breederId(breeder.normalized_name),
      name: breeder.name,
      normalized_name: breeder.normalized_name,
      slug: breeder.slug,
    })),
    cultivars: [],
    cultivar_aliases: [],
    cultivar_sources: payload.sources.map((source) => ({ ...source })),
    cultivar_profile_sources: [],
    cultivar_claims: [],
    cultivar_guides: [],
    cultivar_guide_sections: [],
    cultivar_guide_section_sources: [],
  };

  for (const cultivar of payload.cultivars) {
    const { aliases, profile_sources, claims, guide, sections, breeder_normalized_name, ...row } =
      cultivar;
    snapshot.cultivars.push({
      ...row,
      breeder_id: breeder_normalized_name ? breederId(breeder_normalized_name) : null,
    });
    for (const alias of aliases) {
      snapshot.cultivar_aliases.push({
        cultivar_id: cultivar.id,
        alias: alias.alias,
        normalized_alias: alias.normalized_alias,
        source_id: sourceId(alias.source_key),
        sort_order: alias.sort_order,
      });
    }
    for (const link of profile_sources) {
      snapshot.cultivar_profile_sources.push({
        cultivar_id: cultivar.id,
        source_id: sourceId(link.source_key),
        sort_order: link.sort_order,
      });
    }
    for (const claim of claims) {
      const { source_key, context, ...claimRow } = claim;
      snapshot.cultivar_claims.push({
        ...claimRow,
        cultivar_id: cultivar.id,
        context_jsonb: context,
        source_id: sourceId(source_key),
      });
    }
    const { base_template_key: _template, ...guideRow } = guide;
    snapshot.cultivar_guides.push({ ...guideRow, cultivar_id: cultivar.id });
    for (const section of sections) {
      const sectionId = `section:${cultivar.slug}:${section.section_key}`;
      const { sources: links, ...sectionRow } = section;
      snapshot.cultivar_guide_sections.push({ ...sectionRow, id: sectionId, guide_id: guide.id });
      for (const link of links) {
        snapshot.cultivar_guide_section_sources.push({
          guide_section_id: sectionId,
          source_id: sourceId(link.source_key),
          support_note: link.support_note,
        });
      }
    }
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Migration file → payload
// ---------------------------------------------------------------------------

export type CultivarSeedPayloadExtraction =
  { ok: true; payload: CultivarSeedPayload } | { ok: false; error: string };

/** Read the dollar-quoted payload out of the migration SQL without executing it. */
export function extractCultivarSeedPayloadFromMigration(
  sql: string,
): CultivarSeedPayloadExtraction {
  const tag = `$${CULTIVAR_SEED_PAYLOAD_TAG}$`;
  const start = sql.indexOf(tag);
  const end = start === -1 ? -1 : sql.indexOf(tag, start + tag.length);
  if (start === -1 || end === -1) {
    return { ok: false, error: `payload delimited by ${tag} not found` };
  }
  if (sql.indexOf(tag, end + tag.length) !== -1) {
    return { ok: false, error: `more than one ${tag} payload found` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sql.slice(start + tag.length, end));
  } catch (error) {
    return { ok: false, error: `payload is not valid JSON: ${(error as Error).message}` };
  }
  const shapeError = describeSeedPayloadShapeError(parsed);
  return shapeError
    ? { ok: false, error: shapeError }
    : { ok: true, payload: parsed as CultivarSeedPayload };
}

function describeSeedPayloadShapeError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "payload must be an object";
  }
  const payload = value as Record<string, unknown>;
  if (payload.payload_version !== CULTIVAR_SEED_PAYLOAD_VERSION) {
    return `unsupported payload_version ${JSON.stringify(payload.payload_version)}`;
  }
  for (const key of ["sources", "breeders", "cultivars"] as const) {
    if (!Array.isArray(payload[key])) return `payload.${key} must be an array`;
  }
  for (const [index, cultivar] of (payload.cultivars as unknown[]).entries()) {
    if (typeof cultivar !== "object" || cultivar === null) return `cultivars[${index}] malformed`;
    const record = cultivar as Record<string, unknown>;
    for (const key of ["aliases", "profile_sources", "claims", "sections"] as const) {
      if (!Array.isArray(record[key])) return `cultivars[${index}].${key} must be an array`;
    }
    if (typeof record.guide !== "object" || record.guide === null) {
      return `cultivars[${index}].guide must be an object`;
    }
  }
  return null;
}

/** Canonical serialization used for the migration body (stable key order). */
export function serializeCultivarSeedPayload(payload: CultivarSeedPayload): string {
  return JSON.stringify(payload, null, 2);
}
