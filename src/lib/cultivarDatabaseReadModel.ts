/**
 * Strain Reference Library V1.1 — database read model.
 *
 * Pure, deterministic, null-safe conversion of the published, RLS-filtered
 * reference tables into the existing public `VerdantCultivarProfile` view model.
 * No React, no Supabase client, no clock, no randomness.
 *
 * Rows arrive from the network and are treated as untrusted: every column is
 * validated at runtime. A cultivar whose rows cannot be represented exactly is
 * excluded and reported as an issue — it never renders as verified content.
 * Callers decide what an issue means (the parity audit reports `invalid`; the
 * public source resolver falls back, visibly, to the bundled sample library).
 */
import {
  CULTIVAR_GUIDE_SECTION_KEYS,
  buildCultivarSearchAlias,
  type CultivarAnalyticalMethod,
  type CultivarCannabinoidClaim,
  type CultivarChemotype,
  type CultivarConfidence,
  type CultivarDataOrigin,
  type CultivarDifficulty,
  type CultivarGuidanceItem,
  type CultivarGuideSection,
  type CultivarGuideSectionKey,
  type CultivarHeightCategory,
  type CultivarLifeCycle,
  type CultivarMarketClassification,
  type CultivarReportedTendency,
  type CultivarRisk,
  type CultivarSamplePheno,
  type CultivarSeedExpression,
  type CultivarSource,
  type CultivarTerpeneClaim,
  type CultivarVerificationStatus,
  type VerdantCultivarProfile,
} from "@/constants/strainReferenceLibrary";

// ---------------------------------------------------------------------------
// Read surface: the exact tables and columns the public read path may select.
// The service and the runtime harness both import this list, so a column the
// mapper does not understand can never be requested silently.
// ---------------------------------------------------------------------------

export const CULTIVAR_DATABASE_READ_SURFACE = {
  breeders: "id,name,normalized_name,slug",
  cultivars:
    "id,breeder_id,canonical_name,normalized_name,slug,life_cycle,seed_expression," +
    "market_classification,lineage_text,description,difficulty,height_category,chemotype," +
    "flowering_days_min,flowering_days_max,flowering_window_label,stretch_min,stretch_max," +
    "yield_indoor_g_per_m2_min,yield_indoor_g_per_m2_max,thc_pct_min,thc_pct_max," +
    "cbd_pct_min,cbd_pct_max,dominant_terpenes,pheno_hunt_focus,sample_phenos," +
    "publication_status,verification_status,data_origin,last_verified_at",
  cultivar_aliases: "cultivar_id,alias,normalized_alias,source_id,sort_order",
  cultivar_sources:
    "id,source_key,title,publisher,url,source_type,retrieved_at,license_or_usage_notes",
  cultivar_profile_sources: "cultivar_id,source_id,sort_order",
  cultivar_claims:
    "id,cultivar_id,trait_key,value_min,value_max,value_text,value_jsonb,unit,context_jsonb," +
    "source_id,confidence,verified_at",
  cultivar_guides:
    "id,cultivar_id,base_template_id,version,title,publication_status,confidence," +
    "content_schema_version,last_verified_at,published_at",
  cultivar_guide_templates: "id,template_key,version,publication_status",
  cultivar_guide_sections:
    "id,guide_id,section_key,sort_order,content,content_schema_version,confidence,last_verified_at",
  cultivar_guide_section_sources: "guide_section_id,source_id,support_note",
} as const;

export type CultivarDatabaseTable = keyof typeof CULTIVAR_DATABASE_READ_SURFACE;
export const CULTIVAR_DATABASE_TABLES = Object.keys(
  CULTIVAR_DATABASE_READ_SURFACE,
) as readonly CultivarDatabaseTable[];

/** One untyped PostgREST row. Every field is validated before use. */
export type CultivarDatabaseRow = Readonly<Record<string, unknown>>;

/** The published read surface, one array of rows per table. */
export type CultivarDatabaseSnapshot = Readonly<
  Record<CultivarDatabaseTable, readonly CultivarDatabaseRow[]>
>;

// ---------------------------------------------------------------------------
// Enum mapping. Database vocabularies are wider than the public view model;
// any value the view model cannot represent fails closed.
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS: Readonly<Record<string, CultivarDifficulty>> = {
  beginner: "Beginner-friendly",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** Inverse of the public difficulty label, used when writing the seed payload. */
export const CULTIVAR_DIFFICULTY_DATABASE_VALUES: Readonly<Record<CultivarDifficulty, string>> = {
  "Beginner-friendly": "beginner",
  Intermediate: "intermediate",
  Advanced: "advanced",
};

const DATA_ORIGINS: Readonly<Record<string, CultivarDataOrigin>> = {
  // The database's seed origin is what the public model calls sample data.
  seed: "sample",
  editorial: "editorial",
  import: "import",
  // `community` and `ai_draft` are deliberately absent: neither may render as
  // reference content through the public read path.
};

export const CULTIVAR_DATA_ORIGIN_DATABASE_VALUES: Readonly<Record<CultivarDataOrigin, string>> = {
  sample: "seed",
  editorial: "editorial",
  import: "import",
};

const LIFE_CYCLES: readonly CultivarLifeCycle[] = ["photoperiod", "autoflower"];
const SEED_EXPRESSIONS: readonly CultivarSeedExpression[] = [
  "regular",
  "feminized",
  "clone_only",
  "unknown",
];
const MARKET_CLASSIFICATIONS: readonly CultivarMarketClassification[] = [
  "indica",
  "sativa",
  "hybrid",
  "unknown",
];
const HEIGHT_CATEGORIES: readonly CultivarHeightCategory[] = [
  "short",
  "medium",
  "tall",
  "variable",
];
const CHEMOTYPES: readonly CultivarChemotype[] = [
  "type_i",
  "type_ii",
  "type_iii",
  "type_iv",
  "type_v",
  "unknown",
];
/**
 * V1.1 serves sample reference data only: the source notice promises the
 * transport never upgrades the evidence state, so any other verification
 * status is refused rather than rendered as "Source-backed".
 */
const VERIFICATION_STATUSES: readonly CultivarVerificationStatus[] = ["sample"];
const CONFIDENCES: readonly CultivarConfidence[] = ["high", "medium", "community"];
const RISKS: readonly CultivarRisk[] = ["low", "medium", "high"];
const SOURCE_TYPES: readonly CultivarSource["sourceType"][] = [
  "breeder",
  "laboratory",
  "horticultural_reference",
  "grower_report",
  "community",
  "verdant_editorial",
];
const ANALYTICAL_METHODS: readonly CultivarAnalyticalMethod[] = [
  "hplc",
  "uhplc",
  "gc_ms",
  "gc_fid",
  "coa_unspecified",
  "not_reported",
];
const MEASUREMENT_BASES: readonly CultivarCannabinoidClaim["context"]["measurementBasis"][] = [
  "source_reported_summary",
  "acidic",
  "neutral",
  "calculated_total",
];

/** Claim traits projected into the public profile. */
export const CULTIVAR_CANNABINOID_TRAITS: Readonly<
  Record<string, { cannabinoid: CultivarCannabinoidClaim["cannabinoid"]; label: string }>
> = {
  reported_thc_pct: { cannabinoid: "reported_thc", label: "Source-reported THC summary" },
  reported_cbd_pct: { cannabinoid: "reported_cbd", label: "Source-reported CBD summary" },
};
export const CULTIVAR_TERPENE_TRAIT = "terpene";
/** The only claim unit the percentage fields of the public view model accept. */
const PERCENT_UNIT = "%";
/** Claim traits that are stored for provenance and cross-checked, not rendered. */
export const CULTIVAR_AUXILIARY_TRAITS = ["chemotype", "reported_dominant_terpenes"] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CultivarDatabaseIssue {
  /** Cultivar slug when the issue belongs to one profile; null for table-level issues. */
  slug: string | null;
  path: string;
  message: string;
}

export interface CultivarDatabaseAliasRecord {
  alias: string;
  normalizedAlias: string;
  /** Key of the source the alias cites, or null when the row cites none. */
  sourceKey: string | null;
}

export interface CultivarDatabaseAuxiliaryClaim {
  traitKey: string;
  valueText: string | null;
  valueJsonb: unknown;
  sourceKey: string | null;
  /** Stored provenance metadata, kept so the audit can require exact claim parity. */
  confidence: CultivarConfidence | null;
  verifiedAt: string | null;
  unit: string | null;
  context: unknown;
}

export interface CultivarDatabaseCatalogData {
  /** Published profiles, sorted by name then slug. */
  profiles: readonly VerdantCultivarProfile[];
  sectionsBySlug: Readonly<Record<string, readonly CultivarGuideSection[]>>;
  sourcesBySlug: Readonly<Record<string, readonly CultivarSource[]>>;
  /** Every readable source row, sorted by key. */
  sources: readonly CultivarSource[];
}

/** Stored guide row metadata (not rendered; audited for exact parity). */
export interface CultivarDatabaseGuideMetadata {
  version: number;
  /** `template_key` of the guide's base template, or null when the guide cites none. */
  baseTemplateKey: string | null;
  title: string;
  confidence: CultivarConfidence;
  contentSchemaVersion: number;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
}

/** Stored section row metadata plus each source link's support note, keyed by source. */
export interface CultivarDatabaseSectionMetadata {
  sortOrder: number;
  contentSchemaVersion: number;
  lastVerifiedAt: string | null;
  sourceNotes: Readonly<Record<string, string>>;
}

export interface CultivarDatabaseMapResult {
  catalog: CultivarDatabaseCatalogData;
  /** Latest published guide's stored metadata, per slug. */
  guideMetadataBySlug: Readonly<Record<string, CultivarDatabaseGuideMetadata>>;
  /** Stored section metadata and link support notes, per slug and section. */
  sectionMetadataBySlug: Readonly<
    Record<
      string,
      Readonly<Partial<Record<CultivarGuideSectionKey, CultivarDatabaseSectionMetadata>>>
    >
  >;
  /** Alias rows as stored, including the database normalization, per slug. */
  aliasRecordsBySlug: Readonly<Record<string, readonly CultivarDatabaseAliasRecord[]>>;
  /** Stored-but-not-rendered claims (chemotype, dominant terpenes, unknown traits). */
  auxiliaryClaimsBySlug: Readonly<Record<string, readonly CultivarDatabaseAuxiliaryClaim[]>>;
  /** verified_at of every rendered (terpene/cannabinoid) claim, per slug, keyed by renderedClaimKey(). */
  renderedClaimVerifiedAtBySlug: Readonly<Record<string, Readonly<Record<string, string | null>>>>;
  /** Normalized section→source links (`cultivar_guide_section_sources`), per slug. */
  sectionSourceKeysBySlug: Readonly<
    Record<string, Readonly<Partial<Record<CultivarGuideSectionKey, readonly string[]>>>>
  >;
  issues: readonly CultivarDatabaseIssue[];
}

// ---------------------------------------------------------------------------
// Primitive readers. Each returns `undefined` for an invalid value so callers
// can distinguish "valid null" from "malformed".
// ---------------------------------------------------------------------------

class RowReader {
  constructor(
    private readonly row: CultivarDatabaseRow,
    private readonly slug: string | null,
    private readonly table: string,
    private readonly issues: CultivarDatabaseIssue[],
  ) {}

  fail(column: string, message: string): undefined {
    this.issues.push({ slug: this.slug, path: `${this.table}.${column}`, message });
    return undefined;
  }

  text(column: string): string | undefined {
    const value = this.row[column];
    if (typeof value !== "string" || value.trim().length === 0) {
      return this.fail(column, "expected a non-empty string");
    }
    return value;
  }

  nullableText(column: string): string | null | undefined {
    const value = this.row[column];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return this.fail(column, "expected a string or null");
    return value;
  }

  oneOf<T extends string>(column: string, allowed: readonly T[]): T | undefined {
    const value = this.row[column];
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      return this.fail(column, `unsupported value ${JSON.stringify(value)}`);
    }
    return value as T;
  }

  /** PostgREST returns `numeric` as a JSON number; numeric strings are accepted too. */
  nullableNumber(column: string): number | null | undefined {
    return toNullableNumber(this.row[column], () => this.fail(column, "expected a number or null"));
  }

  integer(column: string): number | undefined {
    const value = this.row[column];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return this.fail(column, "expected an integer");
    }
    return value;
  }

  nullableInteger(column: string): number | null | undefined {
    const value = this.row[column];
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return this.fail(column, "expected an integer or null");
    }
    return value;
  }

  timestamp(column: string): string | undefined {
    const iso = toIsoTimestamp(this.row[column]);
    return iso ?? this.fail(column, "expected an ISO timestamp");
  }

  nullableTimestamp(column: string): string | null | undefined {
    const value = this.row[column];
    if (value === null || value === undefined) return null;
    return this.timestamp(column);
  }

  stringArray(column: string): string[] | undefined {
    const values = toStringArray(this.row[column]);
    return values ?? this.fail(column, "expected an array of non-empty strings");
  }

  json(column: string): unknown {
    return this.row[column];
  }
}

function toNullableNumber(value: unknown, onInvalid: () => undefined): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : onInvalid();
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return onInvalid();
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((item) => typeof item === "string" && item.trim().length > 0)) return undefined;
  return [...(value as string[])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A stored percentage must be null or within 0–100 inclusive. */
function percentInRange(value: number | null): boolean {
  return value === null || (value >= 0 && value <= 100);
}

function rangeIsOrdered(min: number | null, max: number | null): boolean {
  return min === null || max === null || min <= max;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Section content
// ---------------------------------------------------------------------------

function readSectionContent(
  content: unknown,
  key: CultivarGuideSectionKey,
  confidence: CultivarConfidence,
  slug: string,
  issues: CultivarDatabaseIssue[],
): CultivarGuideSection | undefined {
  const path = `cultivar_guide_sections[${key}].content`;
  const fail = (detail: string): undefined => {
    issues.push({ slug, path, message: detail });
    return undefined;
  };
  if (!isRecord(content)) return fail("expected an object");

  const title = content.title;
  const summary = content.summary;
  if (typeof title !== "string" || title.trim() === "") return fail("title must be non-empty");
  if (typeof summary !== "string" || summary.trim() === "") {
    return fail("summary must be non-empty");
  }

  const rawTendencies = content.reported_tendencies;
  if (!Array.isArray(rawTendencies)) return fail("reported_tendencies must be an array");
  const reportedTendencies: CultivarReportedTendency[] = [];
  for (const item of rawTendencies) {
    if (!isRecord(item) || typeof item.text !== "string" || item.text.trim() === "") {
      return fail("each reported tendency needs non-empty text");
    }
    if (!(CONFIDENCES as readonly unknown[]).includes(item.confidence)) {
      return fail("reported tendency confidence is unsupported");
    }
    const evidenceKeys = toStringArray(item.evidence_keys);
    if (!evidenceKeys || evidenceKeys.length === 0) {
      return fail("each reported tendency needs at least one evidence key");
    }
    reportedTendencies.push({
      text: item.text,
      confidence: item.confidence as CultivarConfidence,
      evidenceKeys,
    });
  }

  const rawGuidance = content.guidance;
  if (!Array.isArray(rawGuidance) || rawGuidance.length === 0) {
    return fail("guidance must be a non-empty array");
  }
  const guidance: CultivarGuidanceItem[] = [];
  for (const item of rawGuidance) {
    if (!isRecord(item) || typeof item.text !== "string" || item.text.trim() === "") {
      return fail("each guidance item needs non-empty text");
    }
    if (!(RISKS as readonly unknown[]).includes(item.risk)) {
      return fail("guidance risk is unsupported");
    }
    if (item.applies_when !== undefined && item.applies_when !== null) {
      // The approved V1 content never scopes guidance; reject rather than drop it.
      return fail("guidance applies_when is not supported by the public view model");
    }
    guidance.push({ text: item.text, risk: item.risk as CultivarRisk });
  }

  const cautions = toStringArray(content.cautions);
  if (!cautions || cautions.length === 0) return fail("cautions must be a non-empty string array");
  const missingInformation = toStringArray(content.missing_information);
  if (!missingInformation) return fail("missing_information must be a string array");
  if (content.sample_reference_data !== true) {
    return fail("sample_reference_data must stay true for V1 reference content");
  }

  return {
    key,
    title,
    summary,
    confidence,
    reportedTendencies,
    guidance,
    cautions,
    missingInformation,
  };
}

// ---------------------------------------------------------------------------
// Sample phenos
// ---------------------------------------------------------------------------

function readSamplePhenos(value: unknown): CultivarSamplePheno[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CultivarSamplePheno[] = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const fields = [
      item.label,
      item.structure,
      item.aroma,
      item.resin,
      item.yield_note,
      item.finish_note,
    ];
    if (!fields.every((field) => typeof field === "string" && field.trim().length > 0)) {
      return undefined;
    }
    result.push({
      label: item.label as string,
      structure: item.structure as string,
      aroma: item.aroma as string,
      resin: item.resin as string,
      yieldNote: item.yield_note as string,
      finishNote: item.finish_note as string,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

function groupBy(
  rows: readonly CultivarDatabaseRow[],
  column: string,
): Map<string, CultivarDatabaseRow[]> {
  const groups = new Map<string, CultivarDatabaseRow[]>();
  for (const row of rows) {
    const key = row[column];
    if (typeof key !== "string") continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function mapSources(
  rows: readonly CultivarDatabaseRow[],
  issues: CultivarDatabaseIssue[],
): Map<string, CultivarSource> {
  const byId = new Map<string, CultivarSource>();
  const seenKeys = new Set<string>();
  for (const row of rows) {
    const read = new RowReader(row, null, "cultivar_sources", issues);
    const id = read.text("id");
    const key = read.text("source_key");
    const title = read.text("title");
    const publisher = read.text("publisher");
    const url = read.text("url");
    const sourceType = read.oneOf("source_type", SOURCE_TYPES);
    const retrievedAt = read.timestamp("retrieved_at");
    const licenseNotes = read.text("license_or_usage_notes");
    if (url !== undefined && !url.startsWith("https://")) read.fail("url", "must be https");
    if (
      id === undefined ||
      key === undefined ||
      title === undefined ||
      publisher === undefined ||
      url === undefined ||
      !url.startsWith("https://") ||
      sourceType === undefined ||
      retrievedAt === undefined ||
      licenseNotes === undefined
    ) {
      continue;
    }
    if (seenKeys.has(key)) {
      issues.push({ slug: null, path: "cultivar_sources.source_key", message: `duplicate ${key}` });
      continue;
    }
    seenKeys.add(key);
    byId.set(id, { key, title, publisher, url, sourceType, retrievedAt, licenseNotes });
  }
  return byId;
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

interface MappedClaims {
  terpeneClaims: CultivarTerpeneClaim[];
  cannabinoidClaims: CultivarCannabinoidClaim[];
  auxiliary: CultivarDatabaseAuxiliaryClaim[];
  /** verified_at of every rendered claim, keyed by renderedClaimKey(). */
  renderedVerifiedAt: Record<string, string | null>;
}

/** Stable key for a rendered claim: terpene claims by name, cannabinoid claims by trait. */
export function renderedClaimKey(traitKey: string, valueText: string | null): string {
  return traitKey === CULTIVAR_TERPENE_TRAIT ? `terpene:${valueText ?? ""}` : traitKey;
}

function mapClaims(
  rows: readonly CultivarDatabaseRow[],
  slug: string,
  sourcesById: ReadonlyMap<string, CultivarSource>,
  issues: CultivarDatabaseIssue[],
): MappedClaims | undefined {
  const before = issues.length;
  const terpenes: CultivarTerpeneClaim[] = [];
  const cannabinoids: CultivarCannabinoidClaim[] = [];
  const auxiliary: CultivarDatabaseAuxiliaryClaim[] = [];
  const seenCannabinoidTraits = new Set<string>();
  const renderedVerifiedAt: Record<string, string | null> = {};

  for (const row of rows) {
    const read = new RowReader(row, slug, "cultivar_claims", issues);
    const traitKey = read.text("trait_key");
    const sourceId = read.text("source_id");
    if (traitKey === undefined || sourceId === undefined) continue;
    const source = sourcesById.get(sourceId);
    if (!source) {
      read.fail("source_id", `claim ${traitKey} cites an unreadable source`);
      continue;
    }
    const context = read.json("context_jsonb");
    const confidence = read.oneOf("confidence", CONFIDENCES);

    if (traitKey === CULTIVAR_TERPENE_TRAIT) {
      const terpene = read.text("value_text");
      const detail = read.json("value_jsonb");
      const min = read.nullableNumber("value_min");
      const max = read.nullableNumber("value_max");
      if (!isRecord(detail) || typeof detail.rank !== "number" || !Number.isInteger(detail.rank)) {
        read.fail("value_jsonb", "terpene claim needs an integer rank");
        continue;
      }
      const aromas = toStringArray(detail.aroma_descriptors);
      if (!aromas) {
        read.fail("value_jsonb", "terpene claim needs aroma_descriptors");
        continue;
      }
      if (
        !isRecord(context) ||
        !(ANALYTICAL_METHODS as readonly unknown[]).includes(context.analytical_method) ||
        typeof context.sample_scope !== "string" ||
        typeof context.variability_note !== "string"
      ) {
        read.fail("context_jsonb", "terpene claim context is incomplete");
        continue;
      }
      if (
        terpene === undefined ||
        confidence === undefined ||
        min === undefined ||
        max === undefined
      ) {
        continue;
      }
      if (!rangeIsOrdered(min, max)) {
        read.fail("value_min", "terpene range is inverted");
        continue;
      }
      if (!percentInRange(min) || !percentInRange(max)) {
        read.fail("value_min", "terpene percentage is outside 0–100");
        continue;
      }
      // The view model renders terpene values as percentages: a value needs a
      // "%" unit; a value-less (rank-only) claim may carry "%" or no unit.
      const unit = row.unit ?? null;
      const hasValue = min !== null || max !== null;
      if (hasValue ? unit !== PERCENT_UNIT : unit !== null && unit !== PERCENT_UNIT) {
        read.fail("unit", `terpene claim unit ${JSON.stringify(unit)} is not "%"`);
        continue;
      }
      const terpeneVerifiedAt = read.nullableTimestamp("verified_at");
      if (terpeneVerifiedAt === undefined) continue;
      renderedVerifiedAt[renderedClaimKey(traitKey, terpene)] = terpeneVerifiedAt;
      terpenes.push({
        terpene,
        rank: detail.rank,
        valueMinPct: min,
        valueMaxPct: max,
        aromaDescriptors: aromas,
        confidence,
        sourceKey: source.key,
        context: {
          analyticalMethod: context.analytical_method as CultivarAnalyticalMethod,
          sampleScope: context.sample_scope,
          variabilityNote: context.variability_note,
        },
      });
      continue;
    }

    const cannabinoidTrait = CULTIVAR_CANNABINOID_TRAITS[traitKey];
    if (cannabinoidTrait) {
      // `reported_*_pct` values render as percentages; any other unit (mg/g,
      // missing) would be shown mis-unit, so the claim fails closed.
      if ((row.unit ?? null) !== PERCENT_UNIT) {
        read.fail("unit", `${traitKey} unit ${JSON.stringify(row.unit ?? null)} is not "%"`);
        continue;
      }
      const min = read.nullableNumber("value_min");
      const max = read.nullableNumber("value_max");
      if (
        !isRecord(context) ||
        !(ANALYTICAL_METHODS as readonly unknown[]).includes(context.analytical_method) ||
        !(MEASUREMENT_BASES as readonly unknown[]).includes(context.measurement_basis) ||
        typeof context.sample_scope !== "string" ||
        typeof context.variability_note !== "string"
      ) {
        read.fail("context_jsonb", `${traitKey} context is incomplete`);
        continue;
      }
      const decarb = toNullableNumber(context.decarboxylation_factor, () => undefined);
      if (decarb === undefined) {
        read.fail("context_jsonb", "decarboxylation_factor must be a number or absent");
        continue;
      }
      if (confidence === undefined || min === undefined || max === undefined) continue;
      if (min === null && max === null) {
        read.fail("value_min", `${traitKey} carries no value`);
        continue;
      }
      if (!rangeIsOrdered(min, max)) {
        read.fail("value_min", `${traitKey} range is inverted`);
        continue;
      }
      if (!percentInRange(min) || !percentInRange(max)) {
        read.fail("value_min", `${traitKey} percentage is outside 0–100`);
        continue;
      }
      if (seenCannabinoidTraits.has(traitKey)) {
        // Two competing summaries cannot be rendered as one approved value.
        read.fail("trait_key", `duplicate ${traitKey} claim`);
        continue;
      }
      seenCannabinoidTraits.add(traitKey);
      const cannabinoidVerifiedAt = read.nullableTimestamp("verified_at");
      if (cannabinoidVerifiedAt === undefined) continue;
      renderedVerifiedAt[renderedClaimKey(traitKey, null)] = cannabinoidVerifiedAt;
      cannabinoids.push({
        cannabinoid: cannabinoidTrait.cannabinoid,
        label: cannabinoidTrait.label,
        valueMinPct: min,
        valueMaxPct: max,
        confidence,
        sourceKey: source.key,
        context: {
          analyticalMethod: context.analytical_method as CultivarAnalyticalMethod,
          measurementBasis:
            context.measurement_basis as CultivarCannabinoidClaim["context"]["measurementBasis"],
          sampleScope: context.sample_scope,
          decarboxylationFactor: decarb,
          variabilityNote: context.variability_note,
        },
      });
      continue;
    }

    const verifiedAt = read.nullableTimestamp("verified_at");
    if (confidence === undefined || verifiedAt === undefined) continue;
    auxiliary.push({
      traitKey,
      valueText: typeof row.value_text === "string" ? row.value_text : null,
      valueJsonb: row.value_jsonb ?? null,
      sourceKey: source.key,
      confidence,
      verifiedAt,
      unit: typeof row.unit === "string" ? row.unit : null,
      context: context ?? null,
    });
  }

  if (issues.length > before) return undefined;

  terpenes.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || compareText(a.terpene, b.terpene));
  const ranks = terpenes.map((claim) => claim.rank);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    issues.push({
      slug,
      path: "cultivar_claims.terpene",
      message: `terpene ranks must run 1..n without gaps or duplicates (got ${ranks.join(",")})`,
    });
    return undefined;
  }
  const terpeneNames = terpenes.map((claim) => claim.terpene);
  const repeated = terpeneNames.filter((name, index) => terpeneNames.indexOf(name) !== index);
  if (repeated.length > 0) {
    issues.push({
      slug,
      path: "cultivar_claims.terpene",
      message: `each terpene may appear once (repeated: ${[...new Set(repeated)].sort(compareText).join(",")})`,
    });
    return undefined;
  }
  cannabinoids.sort((a, b) => compareText(a.cannabinoid, b.cannabinoid));
  auxiliary.sort(
    (a, b) =>
      compareText(a.traitKey, b.traitKey) || compareText(a.valueText ?? "", b.valueText ?? ""),
  );
  return {
    terpeneClaims: terpenes,
    cannabinoidClaims: cannabinoids,
    auxiliary,
    renderedVerifiedAt,
  };
}

// ---------------------------------------------------------------------------
// Snapshot → catalog
// ---------------------------------------------------------------------------

/**
 * Map the published read surface to the public view model.
 *
 * Deterministic: the same snapshot always yields the same result, regardless of
 * row order. Every malformed cultivar is excluded and reported in `issues`.
 */
export function mapCultivarDatabaseSnapshot(
  snapshot: CultivarDatabaseSnapshot,
): CultivarDatabaseMapResult {
  const issues: CultivarDatabaseIssue[] = [];

  for (const table of CULTIVAR_DATABASE_TABLES) {
    if (!Array.isArray(snapshot[table])) {
      issues.push({ slug: null, path: table, message: "table rows missing from snapshot" });
    }
  }
  const rows = (table: CultivarDatabaseTable): readonly CultivarDatabaseRow[] =>
    Array.isArray(snapshot[table]) ? snapshot[table] : [];

  const sourcesById = mapSources(rows("cultivar_sources"), issues);
  const breedersById = new Map<string, string>();
  for (const row of rows("breeders")) {
    const read = new RowReader(row, null, "breeders", issues);
    const id = read.text("id");
    const name = read.text("name");
    if (id !== undefined && name !== undefined) breedersById.set(id, name);
  }
  const templateKeysById = new Map<string, string>();
  for (const row of rows("cultivar_guide_templates")) {
    const read = new RowReader(row, null, "cultivar_guide_templates", issues);
    const id = read.text("id");
    const key = read.text("template_key");
    if (id !== undefined && key !== undefined) templateKeysById.set(id, key);
  }

  const aliasesByCultivar = groupBy(rows("cultivar_aliases"), "cultivar_id");
  const profileSourcesByCultivar = groupBy(rows("cultivar_profile_sources"), "cultivar_id");
  const claimsByCultivar = groupBy(rows("cultivar_claims"), "cultivar_id");
  const guidesByCultivar = groupBy(rows("cultivar_guides"), "cultivar_id");
  const sectionsByGuide = groupBy(rows("cultivar_guide_sections"), "guide_id");
  const sectionSourcesBySection = groupBy(
    rows("cultivar_guide_section_sources"),
    "guide_section_id",
  );

  const profiles: VerdantCultivarProfile[] = [];
  const sectionsBySlug: Record<string, readonly CultivarGuideSection[]> = {};
  const sourcesBySlug: Record<string, readonly CultivarSource[]> = {};
  const aliasRecordsBySlug: Record<string, readonly CultivarDatabaseAliasRecord[]> = {};
  const auxiliaryClaimsBySlug: Record<string, readonly CultivarDatabaseAuxiliaryClaim[]> = {};
  const renderedClaimVerifiedAtBySlug: Record<string, Record<string, string | null>> = {};
  const guideMetadataBySlug: Record<string, CultivarDatabaseGuideMetadata> = {};
  const sectionMetadataBySlug: Record<
    string,
    Partial<Record<CultivarGuideSectionKey, CultivarDatabaseSectionMetadata>>
  > = {};
  const sectionSourceKeysBySlug: Record<
    string,
    Partial<Record<CultivarGuideSectionKey, readonly string[]>>
  > = {};
  const seenSlugs = new Set<string>();

  for (const row of rows("cultivars")) {
    const rawSlug = typeof row.slug === "string" ? row.slug : null;
    const before = issues.length;
    const read = new RowReader(row, rawSlug, "cultivars", issues);

    const id = read.text("id");
    const slug = read.text("slug");
    if (slug !== undefined && !SLUG_PATTERN.test(slug)) read.fail("slug", "invalid slug");
    if (slug !== undefined && seenSlugs.has(slug)) read.fail("slug", "duplicate slug");
    const publicationStatus = read.oneOf("publication_status", ["published"] as const);
    const name = read.text("canonical_name");
    const lineage = read.text("lineage_text");
    const intro = read.text("description");
    const lifeCycle = read.oneOf("life_cycle", LIFE_CYCLES);
    const seedExpression = read.oneOf("seed_expression", SEED_EXPRESSIONS);
    const marketClassification = read.oneOf("market_classification", MARKET_CLASSIFICATIONS);
    const difficultyRaw = read.oneOf("difficulty", Object.keys(DIFFICULTY_LABELS));
    const heightCategory = read.oneOf("height_category", HEIGHT_CATEGORIES);
    const chemotype = read.oneOf("chemotype", CHEMOTYPES);
    const verificationStatus = read.oneOf("verification_status", VERIFICATION_STATUSES);
    const dataOriginRaw = read.oneOf("data_origin", Object.keys(DATA_ORIGINS));
    const lastVerifiedAt = read.timestamp("last_verified_at");
    const flowerWeeks = read.text("flowering_window_label");
    const floweringDaysMin = read.nullableInteger("flowering_days_min");
    const floweringDaysMax = read.nullableInteger("flowering_days_max");
    const stretchMin = read.nullableNumber("stretch_min");
    const stretchMax = read.nullableNumber("stretch_max");
    const yieldMin = read.nullableNumber("yield_indoor_g_per_m2_min");
    const yieldMax = read.nullableNumber("yield_indoor_g_per_m2_max");
    const thcMin = read.nullableNumber("thc_pct_min");
    const thcMax = read.nullableNumber("thc_pct_max");
    const cbdMin = read.nullableNumber("cbd_pct_min");
    const cbdMax = read.nullableNumber("cbd_pct_max");
    const dominantTerpenes = read.stringArray("dominant_terpenes");
    const phenoHuntFocus = read.stringArray("pheno_hunt_focus");
    const samplePhenos = readSamplePhenos(row.sample_phenos);
    if (samplePhenos === undefined) read.fail("sample_phenos", "malformed sample phenos");

    for (const [label, min, max] of [
      ["flowering_days", floweringDaysMin, floweringDaysMax],
      ["stretch", stretchMin, stretchMax],
      ["yield_indoor_g_per_m2", yieldMin, yieldMax],
      ["thc_pct", thcMin, thcMax],
      ["cbd_pct", cbdMin, cbdMax],
    ] as const) {
      if (min !== undefined && max !== undefined && !rangeIsOrdered(min, max)) {
        read.fail(`${label}_min`, "range is inverted");
      }
    }
    // Profile percentages render as "%" values, so each must sit within 0–100,
    // matching the claim-level check (and the V1 table's CHECK constraints).
    for (const [column, value] of [
      ["thc_pct_min", thcMin],
      ["thc_pct_max", thcMax],
      ["cbd_pct_min", cbdMin],
      ["cbd_pct_max", cbdMax],
    ] as const) {
      if (value !== undefined && !percentInRange(value)) {
        read.fail(column, "percentage is outside 0–100");
      }
    }

    let breeder: string | null | undefined = null;
    const breederId = row.breeder_id;
    if (breederId !== null && breederId !== undefined) {
      breeder = typeof breederId === "string" ? breedersById.get(breederId) : undefined;
      if (breeder === undefined) read.fail("breeder_id", "breeder is not readable");
    }

    if (
      issues.length > before ||
      id === undefined ||
      slug === undefined ||
      publicationStatus === undefined ||
      name === undefined ||
      lineage === undefined ||
      intro === undefined ||
      lifeCycle === undefined ||
      seedExpression === undefined ||
      marketClassification === undefined ||
      difficultyRaw === undefined ||
      heightCategory === undefined ||
      chemotype === undefined ||
      verificationStatus === undefined ||
      dataOriginRaw === undefined ||
      lastVerifiedAt === undefined ||
      flowerWeeks === undefined ||
      floweringDaysMin === undefined ||
      floweringDaysMax === undefined ||
      stretchMin === undefined ||
      stretchMax === undefined ||
      yieldMin === undefined ||
      yieldMax === undefined ||
      thcMin === undefined ||
      thcMax === undefined ||
      cbdMin === undefined ||
      cbdMax === undefined ||
      dominantTerpenes === undefined ||
      phenoHuntFocus === undefined ||
      samplePhenos === undefined ||
      breeder === undefined
    ) {
      continue;
    }
    seenSlugs.add(slug);

    // Aliases, ordered by stored sort order then alias text.
    const aliasRows = [...(aliasesByCultivar.get(id) ?? [])];
    const aliasRecords: (CultivarDatabaseAliasRecord & { sortOrder: number | null })[] = [];
    for (const aliasRow of aliasRows) {
      const aliasRead = new RowReader(aliasRow, slug, "cultivar_aliases", issues);
      const alias = aliasRead.text("alias");
      const normalizedAlias = aliasRead.text("normalized_alias");
      const sortOrder = aliasRead.nullableInteger("sort_order");
      const aliasSourceId = aliasRead.nullableText("source_id");
      let sourceKey: string | null | undefined = null;
      if (typeof aliasSourceId === "string") {
        sourceKey = sourcesById.get(aliasSourceId)?.key;
        if (sourceKey === undefined) aliasRead.fail("source_id", "alias source is not readable");
      } else if (aliasSourceId === undefined) {
        sourceKey = undefined;
      }
      if (
        alias !== undefined &&
        normalizedAlias !== undefined &&
        sortOrder !== undefined &&
        sourceKey !== undefined
      ) {
        aliasRecords.push({ alias, normalizedAlias, sourceKey, sortOrder });
      }
    }
    aliasRecords.sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        compareText(a.alias, b.alias),
    );

    // Profile-level sources, ordered by stored sort order then key.
    const profileSources: { source: CultivarSource; sortOrder: number }[] = [];
    for (const linkRow of profileSourcesByCultivar.get(id) ?? []) {
      const linkRead = new RowReader(linkRow, slug, "cultivar_profile_sources", issues);
      const sourceId = linkRead.text("source_id");
      const sortOrder = linkRead.integer("sort_order");
      if (sourceId === undefined || sortOrder === undefined) continue;
      const source = sourcesById.get(sourceId);
      if (!source) {
        linkRead.fail("source_id", "profile source is not readable");
        continue;
      }
      profileSources.push({ source, sortOrder });
    }
    profileSources.sort(
      (a, b) => a.sortOrder - b.sortOrder || compareText(a.source.key, b.source.key),
    );
    if (profileSources.length === 0) {
      issues.push({
        slug,
        path: "cultivar_profile_sources",
        message: "a published profile needs at least one readable source",
      });
    }

    const claims = mapClaims(claimsByCultivar.get(id) ?? [], slug, sourcesById, issues);

    // Latest published guide wins; its sections must be the complete 14.
    const guides = (guidesByCultivar.get(id) ?? []).filter(
      (guide) => guide.publication_status === "published",
    );
    guides.sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0));
    // Two published guides sharing the top version leave no deterministic
    // winner; refuse instead of letting row order pick one.
    const ambiguous =
      guides.length > 1 && Number(guides[0].version ?? 0) === Number(guides[1].version ?? 0);
    if (ambiguous) {
      issues.push({
        slug,
        path: "cultivar_guides",
        message: `ambiguous latest published guide: more than one at version ${String(
          guides[0].version,
        )}`,
      });
    }
    const guideRow = ambiguous ? undefined : guides[0];
    let guideVersion: number | undefined;
    let contentSchemaVersion: number | undefined;
    let sections: CultivarGuideSection[] | undefined;
    const sectionSourceKeys: Partial<Record<CultivarGuideSectionKey, string[]>> = {};
    const sectionMetadata: Partial<
      Record<CultivarGuideSectionKey, CultivarDatabaseSectionMetadata>
    > = {};
    let guideMetadata: CultivarDatabaseGuideMetadata | undefined;
    if (!guideRow) {
      if (!ambiguous) {
        issues.push({ slug, path: "cultivar_guides", message: "no published guide" });
      }
    } else {
      const guideRead = new RowReader(guideRow, slug, "cultivar_guides", issues);
      const guideId = guideRead.text("id");
      guideVersion = guideRead.integer("version");
      contentSchemaVersion = guideRead.integer("content_schema_version");
      const guideTitle = guideRead.text("title");
      const guideConfidence = guideRead.oneOf("confidence", CONFIDENCES);
      const guideLastVerifiedAt = guideRead.nullableTimestamp("last_verified_at");
      const guidePublishedAt = guideRead.nullableTimestamp("published_at");
      const templateId = guideRead.nullableText("base_template_id");
      let baseTemplateKey: string | null | undefined = null;
      if (typeof templateId === "string") {
        baseTemplateKey = templateKeysById.get(templateId);
        if (baseTemplateKey === undefined) {
          guideRead.fail("base_template_id", "base template is not readable");
        }
      } else if (templateId === undefined) {
        baseTemplateKey = undefined;
      }
      if (
        baseTemplateKey !== undefined &&
        guideVersion !== undefined &&
        contentSchemaVersion !== undefined &&
        guideTitle !== undefined &&
        guideConfidence !== undefined &&
        guideLastVerifiedAt !== undefined &&
        guidePublishedAt !== undefined
      ) {
        guideMetadata = {
          version: guideVersion,
          baseTemplateKey,
          title: guideTitle,
          confidence: guideConfidence,
          contentSchemaVersion,
          lastVerifiedAt: guideLastVerifiedAt,
          publishedAt: guidePublishedAt,
        };
      }
      const sectionRows = [...(guideId ? (sectionsByGuide.get(guideId) ?? []) : [])];
      sectionRows.sort(
        (a, b) =>
          Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
          compareText(String(a.section_key ?? ""), String(b.section_key ?? "")),
      );
      const mapped: CultivarGuideSection[] = [];
      for (const sectionRow of sectionRows) {
        const sectionRead = new RowReader(sectionRow, slug, "cultivar_guide_sections", issues);
        const key = sectionRead.oneOf("section_key", CULTIVAR_GUIDE_SECTION_KEYS);
        const confidence = sectionRead.oneOf("confidence", CONFIDENCES);
        if (key === undefined || confidence === undefined) continue;
        const section = readSectionContent(sectionRow.content, key, confidence, slug, issues);
        if (section) mapped.push(section);
        const sectionId = typeof sectionRow.id === "string" ? sectionRow.id : null;
        const keys: string[] = [];
        const sourceNotes: Record<string, string> = {};
        for (const link of sectionId ? (sectionSourcesBySection.get(sectionId) ?? []) : []) {
          const source =
            typeof link.source_id === "string" ? sourcesById.get(link.source_id) : undefined;
          if (!source) continue;
          keys.push(source.key);
          const note = new RowReader(link, slug, "cultivar_guide_section_sources", issues).text(
            "support_note",
          );
          if (note !== undefined) sourceNotes[source.key] = note;
        }
        if (keys.length > 0) sectionSourceKeys[key] = keys.sort(compareText);
        const sortOrder = sectionRead.integer("sort_order");
        const sectionSchemaVersion = sectionRead.integer("content_schema_version");
        const sectionLastVerifiedAt = sectionRead.nullableTimestamp("last_verified_at");
        if (
          sortOrder !== undefined &&
          sectionSchemaVersion !== undefined &&
          sectionLastVerifiedAt !== undefined
        ) {
          sectionMetadata[key] = {
            sortOrder,
            contentSchemaVersion: sectionSchemaVersion,
            lastVerifiedAt: sectionLastVerifiedAt,
            sourceNotes,
          };
        }
      }
      const keys = mapped.map((section) => section.key);
      const complete =
        keys.length === CULTIVAR_GUIDE_SECTION_KEYS.length &&
        CULTIVAR_GUIDE_SECTION_KEYS.every((key, index) => keys[index] === key);
      if (complete) {
        sections = mapped;
      } else {
        issues.push({
          slug,
          path: "cultivar_guide_sections",
          message: `expected the ${CULTIVAR_GUIDE_SECTION_KEYS.length} guide sections in order; got ${
            keys.join(",") || "none"
          }`,
        });
      }
    }

    // Every tendency's evidence key must resolve to a readable source AND be
    // backed by that section's normalized cultivar_guide_section_sources row;
    // a dropped link is drift, so it falls back rather than rendering.
    if (sections) {
      const readableKeys = new Set([...sourcesById.values()].map((source) => source.key));
      for (const section of sections) {
        const linked = new Set(sectionSourceKeys[section.key] ?? []);
        for (const tendency of section.reportedTendencies) {
          for (const key of tendency.evidenceKeys) {
            if (!readableKeys.has(key)) {
              issues.push({
                slug,
                path: `cultivar_guide_sections[${section.key}].content.reported_tendencies`,
                message: `evidence key ${key} does not resolve to a readable source`,
              });
            } else if (!linked.has(key)) {
              issues.push({
                slug,
                path: `cultivar_guide_section_sources[${section.key}]`,
                message: `evidence key ${key} has no cultivar_guide_section_sources row`,
              });
            }
          }
        }
      }
    }

    if (
      issues.length > before ||
      !claims ||
      !sections ||
      guideVersion === undefined ||
      contentSchemaVersion === undefined
    ) {
      continue;
    }

    profiles.push({
      slug,
      name,
      searchAlias: buildCultivarSearchAlias(name, lifeCycle),
      aliases: aliasRecords.map((record) => record.alias),
      breeder,
      lineage,
      intro,
      lifeCycle,
      seedExpression,
      marketClassification,
      difficulty: DIFFICULTY_LABELS[difficultyRaw],
      heightCategory,
      flowerWeeks,
      floweringDaysMin,
      floweringDaysMax,
      stretchMin,
      stretchMax,
      yieldIndoorGPerM2Min: yieldMin,
      yieldIndoorGPerM2Max: yieldMax,
      thcPctMin: thcMin,
      thcPctMax: thcMax,
      cbdPctMin: cbdMin,
      cbdPctMax: cbdMax,
      chemotype,
      dominantTerpenes,
      terpeneClaims: claims.terpeneClaims,
      cannabinoidClaims: claims.cannabinoidClaims,
      publicationStatus,
      verificationStatus,
      dataOrigin: DATA_ORIGINS[dataOriginRaw],
      lastVerifiedAt,
      guideVersion,
      contentSchemaVersion,
      sourceKeys: profileSources.map((item) => item.source.key),
      // Database guides are stored fully resolved; there is nothing to overlay.
      guideOverlays: {},
      phenoHuntFocus,
      samplePhenos,
    });
    sectionsBySlug[slug] = sections;
    sourcesBySlug[slug] = profileSources.map((item) => item.source);
    aliasRecordsBySlug[slug] = aliasRecords.map(({ alias, normalizedAlias, sourceKey }) => ({
      alias,
      normalizedAlias,
      sourceKey,
    }));
    auxiliaryClaimsBySlug[slug] = claims.auxiliary;
    renderedClaimVerifiedAtBySlug[slug] = claims.renderedVerifiedAt;
    sectionSourceKeysBySlug[slug] = sectionSourceKeys;
    if (guideMetadata) guideMetadataBySlug[slug] = guideMetadata;
    sectionMetadataBySlug[slug] = sectionMetadata;
  }

  profiles.sort((a, b) => compareText(a.name, b.name) || compareText(a.slug, b.slug));

  return {
    catalog: {
      profiles,
      sectionsBySlug,
      sourcesBySlug,
      sources: [...sourcesById.values()].sort((a, b) => compareText(a.key, b.key)),
    },
    aliasRecordsBySlug,
    auxiliaryClaimsBySlug,
    renderedClaimVerifiedAtBySlug,
    sectionSourceKeysBySlug,
    guideMetadataBySlug,
    sectionMetadataBySlug,
    issues,
  };
}

/**
 * Database alias normalization, mirroring the V1 seed expression
 * `lower(regexp_replace(trim(alias), '[^a-z0-9]+', ' ', 'gi'))` exactly so the
 * `(cultivar_id, normalized_alias)` upsert key never forks an existing row.
 */
export function normalizeCultivarAliasForDatabase(alias: string): string {
  return alias
    .trim()
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase();
}
