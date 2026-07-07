/**
 * PHENOHUNT documentation defaults.
 *
 * Structured default documentation sections + fields shown on PHENOHUNT
 * candidate / breeding program records so the grower documents progress
 * consistently. Presenter-only defaults: no AI, no Action Queue, no
 * automation, no device control, no sensor ingest, no schema changes.
 *
 * Section + field labels are exact and must not drift — tests assert them.
 */

export interface PhenoDocField {
  /** Stable key used for persisted values; NEVER change once shipped. */
  readonly key: string;
  /** Exact human label shown in the UI. */
  readonly label: string;
  /** true → multi-line textarea, else single-line input. */
  readonly multiline?: boolean;
}

export interface PhenoDocSection {
  readonly key: string;
  readonly title: string;
  readonly fields: readonly PhenoDocField[];
}

export const PHENO_DOCUMENTATION_DEFAULTS: readonly PhenoDocSection[] = [
  {
    key: "receiver_cultivar",
    title: "Receiver cultivar information",
    fields: [
      { key: "receiver_cultivar_name", label: "Receiver cultivar name" },
      { key: "breeder", label: "Breeder" },
      { key: "genetics", label: "Genetics" },
      { key: "growth_characteristics", label: "Growth characteristics", multiline: true },
      { key: "flowering_time", label: "Flowering time" },
      { key: "yield", label: "Yield" },
      { key: "flavor_profile", label: "Flavor profile", multiline: true },
      { key: "other_relevant_information", label: "Other relevant information", multiline: true },
    ],
  },
  {
    key: "breeding",
    title: "Breeding information",
    fields: [
      { key: "date_of_pollination", label: "Date of pollination" },
      { key: "date_of_seed_harvest", label: "Date of seed harvest" },
      { key: "total_number_of_seeds", label: "Total number of seeds" },
    ],
  },
  {
    key: "seedling",
    title: "Seedling information",
    fields: [
      { key: "growth_rate", label: "Growth rate" },
      { key: "observable_traits", label: "Observable traits", multiline: true },
      { key: "abnormalities", label: "Abnormalities", multiline: true },
    ],
  },
  {
    key: "phenotype",
    title: "Phenotype characteristics",
    fields: [
      { key: "phenotype_performance_notes", label: "Phenotype performance notes", multiline: true },
      { key: "growth_characteristics", label: "Growth characteristics", multiline: true },
      { key: "unique_traits", label: "Unique traits", multiline: true },
    ],
  },
  {
    key: "harvest",
    title: "Harvest information",
    fields: [
      { key: "yield", label: "Yield" },
      { key: "flowering_time", label: "Flowering time" },
      { key: "trichome_development", label: "Trichome development", multiline: true },
      { key: "flavor", label: "Flavor", multiline: true },
      { key: "effect", label: "Effect", multiline: true },
    ],
  },
  {
    key: "cloning",
    title: "Cloning and further generational growth",
    fields: [
      { key: "clone_viability", label: "Clone viability" },
      { key: "number_of_clones_taken", label: "Number of clones taken" },
      { key: "number_of_clones_rooted", label: "Number of clones rooted" },
      { key: "growth_characteristics", label: "Growth characteristics", multiline: true },
      {
        key: "phenotypic_variation_across_generations",
        label: "Phenotypic variation across generations",
        multiline: true,
      },
      {
        key: "stability_across_generations",
        label: "Stability across generations",
        multiline: true,
      },
    ],
  },
];

/**
 * Per-record saved shape:
 *   { [sectionKey]: { fields: { [fieldKey]: string }, diaryEntryId?: string | null } }
 * Defaults never overwrite existing saved values; missing keys read as "".
 */
export type PhenoDocumentationValues = Record<
  string,
  { fields: Record<string, string>; diaryEntryId?: string | null }
>;

export function buildEmptyDocumentationValues(): PhenoDocumentationValues {
  const out: PhenoDocumentationValues = {};
  for (const section of PHENO_DOCUMENTATION_DEFAULTS) {
    out[section.key] = { fields: {}, diaryEntryId: null };
    for (const f of section.fields) out[section.key].fields[f.key] = "";
  }
  return out;
}

/** Merge saved values over defaults without overwriting anything already set. */
export function mergeDocumentationValues(
  saved: PhenoDocumentationValues | null | undefined,
): PhenoDocumentationValues {
  const base = buildEmptyDocumentationValues();
  if (!saved) return base;
  for (const section of PHENO_DOCUMENTATION_DEFAULTS) {
    const s = saved[section.key];
    if (!s) continue;
    if (s.diaryEntryId != null) base[section.key].diaryEntryId = s.diaryEntryId;
    for (const f of section.fields) {
      const v = s.fields?.[f.key];
      if (typeof v === "string" && v.length > 0) base[section.key].fields[f.key] = v;
    }
  }
  return base;
}
