/**
 * Strain Reference Library V1.
 *
 * Public, read-only sample reference data. Named-cultivar information is a
 * source-backed hypothesis, never a fixed recipe or plant-specific diagnosis.
 * The grower's logs, source-labeled sensors, medium, stage, and observed
 * response supply the truth. Reference pages never create alerts or actions.
 */

export const CULTIVAR_GUIDE_SECTION_KEYS = [
  "overview", "germination", "early_growth", "vegetative", "flowering",
  "environment", "watering", "nutrition", "training", "common_issues",
  "harvest", "post_harvest", "pheno_tips", "missing_information",
] as const;

export type CultivarGuideSectionKey = (typeof CULTIVAR_GUIDE_SECTION_KEYS)[number];
export type CultivarDifficulty = "Beginner-friendly" | "Intermediate" | "Advanced";
export type CultivarLifeCycle = "photoperiod" | "autoflower";
export type CultivarSeedExpression = "regular" | "feminized" | "clone_only" | "unknown";
export type CultivarMarketClassification = "indica" | "sativa" | "hybrid" | "unknown";
export type CultivarVerificationStatus = "sample" | "community" | "reviewed" | "verified";
export type CultivarPublicationStatus = "draft" | "published" | "archived";
export type CultivarConfidence = "high" | "medium" | "community";
export type CultivarRisk = "low" | "medium" | "high";
export type CultivarHeightCategory = "short" | "medium" | "tall" | "variable";
export type CultivarDataOrigin = "sample" | "editorial" | "import";
export type CultivarChemotype = "type_i" | "type_ii" | "type_iii" | "type_iv" | "type_v" | "unknown";
export type CultivarAnalyticalMethod = "hplc" | "uhplc" | "gc_ms" | "gc_fid" | "coa_unspecified" | "not_reported";

export interface CultivarSource {
  key: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: "breeder" | "laboratory" | "horticultural_reference" | "grower_report" | "community" | "verdant_editorial";
  retrievedAt: string;
  licenseNotes: string;
}

export interface CultivarReportedTendency {
  text: string;
  confidence: CultivarConfidence;
  evidenceKeys: readonly string[];
}

export interface CultivarGuidanceItem {
  text: string;
  risk: CultivarRisk;
  appliesWhen?: Readonly<Record<string, readonly string[]>>;
}

export interface CultivarGuideSection {
  key: CultivarGuideSectionKey;
  title: string;
  summary: string;
  confidence: CultivarConfidence;
  reportedTendencies: readonly CultivarReportedTendency[];
  guidance: readonly CultivarGuidanceItem[];
  cautions: readonly string[];
  missingInformation: readonly string[];
}

export interface CultivarTerpeneClaim {
  terpene: string;
  rank: number | null;
  valueMinPct: number | null;
  valueMaxPct: number | null;
  aromaDescriptors: readonly string[];
  confidence: CultivarConfidence;
  sourceKey: string;
  context: {
    analyticalMethod: CultivarAnalyticalMethod;
    sampleScope: string;
    variabilityNote: string;
  };
}

export interface CultivarCannabinoidClaim {
  cannabinoid: "reported_thc" | "reported_cbd" | "total_thc" | "total_cbd" | "thca" | "cbda" | "cbg" | "cbga" | "cbc" | "cbn" | "thcv";
  label: string;
  valueMinPct: number | null;
  valueMaxPct: number | null;
  confidence: CultivarConfidence;
  sourceKey: string;
  context: {
    analyticalMethod: CultivarAnalyticalMethod;
    measurementBasis: "source_reported_summary" | "acidic" | "neutral" | "calculated_total";
    sampleScope: string;
    decarboxylationFactor: number | null;
    variabilityNote: string;
  };
}

export interface CultivarSamplePheno {
  label: string;
  structure: string;
  aroma: string;
  resin: string;
  yieldNote: string;
  finishNote: string;
}

interface CultivarGuideSectionOverlay {
  summary?: string;
  confidence?: CultivarConfidence;
  reportedTendencies?: readonly CultivarReportedTendency[];
  guidance?: readonly CultivarGuidanceItem[];
  cautions?: readonly string[];
  missingInformation?: readonly string[];
}

export interface VerdantCultivarProfile {
  slug: string;
  name: string;
  searchAlias: string;
  aliases: readonly string[];
  breeder: string | null;
  lineage: string;
  intro: string;
  lifeCycle: CultivarLifeCycle;
  seedExpression: CultivarSeedExpression;
  marketClassification: CultivarMarketClassification;
  difficulty: CultivarDifficulty;
  heightCategory: CultivarHeightCategory;
  flowerWeeks: string;
  floweringDaysMin: number | null;
  floweringDaysMax: number | null;
  stretchMin: number | null;
  stretchMax: number | null;
  yieldIndoorGPerM2Min: number | null;
  yieldIndoorGPerM2Max: number | null;
  thcPctMin: number | null;
  thcPctMax: number | null;
  cbdPctMin: number | null;
  cbdPctMax: number | null;
  chemotype: CultivarChemotype;
  dominantTerpenes: readonly string[];
  terpeneClaims: readonly CultivarTerpeneClaim[];
  cannabinoidClaims: readonly CultivarCannabinoidClaim[];
  publicationStatus: CultivarPublicationStatus;
  verificationStatus: CultivarVerificationStatus;
  dataOrigin: CultivarDataOrigin;
  lastVerifiedAt: string;
  guideVersion: number;
  contentSchemaVersion: number;
  sourceKeys: readonly string[];
  guideOverlays: Partial<Record<CultivarGuideSectionKey, CultivarGuideSectionOverlay>>;
  phenoHuntFocus: readonly string[];
  samplePhenos: readonly CultivarSamplePheno[];
}

const RETRIEVED_AT = "2026-07-22T00:00:00.000Z";
const LAST_VERIFIED_AT = "2026-07-22T00:00:00.000Z";
const COMMON_SOURCE_KEYS = [
  "watts-2021-terpene-genetics",
  "cannabinoid-method-context-2019",
  "cannabinoid-spatial-variability-2025",
  "chemotype-genomics-2021",
] as const;
const CHEMISTRY_VARIABILITY = "Expression varies by phenotype, batch, sample position, environment, harvest, post-harvest handling, storage, and laboratory method.";
const TERPENE_VARIABILITY = "Terpene rankings vary by phenotype, grower, batch, harvest timing, cure, storage, and analytical method.";

const source = (
  key: string,
  title: string,
  publisher: string,
  url: string,
  sourceType: CultivarSource["sourceType"],
  licenseNotes: string,
): CultivarSource => ({ key, title, publisher, url, sourceType, retrievedAt: RETRIEVED_AT, licenseNotes });

export const CULTIVAR_SOURCES: readonly CultivarSource[] = [
  source("watts-2021-terpene-genetics", "Cannabis labelling is associated with genetic variation in terpene synthase genes", "Nature Plants", "https://www.nature.com/articles/s41477-021-01003-y", "horticultural_reference", "Citation and high-level paraphrase only; no article text is reproduced."),
  source("cannabinoid-method-context-2019", "Analytical considerations for cannabinoid measurement in cannabis", "PubMed-indexed literature", "https://pubmed.ncbi.nlm.nih.gov/31849137/", "laboratory", "Citation and method context only; no publication text is reproduced."),
  source("cannabinoid-spatial-variability-2025", "Cannabinoid variability across cannabis plant material", "PubMed-indexed literature", "https://pubmed.ncbi.nlm.nih.gov/40651988/", "laboratory", "Citation and variability context only; no publication text is reproduced."),
  source("chemotype-genomics-2021", "Cannabinoid oxidocyclase copy number and chemotype variation", "Genome Biology and Evolution", "https://academic.oup.com/gbe/article/13/8/evab130/6294932", "horticultural_reference", "Citation and high-level genetic context only; no publication text is reproduced."),
  source("sour-diesel-public-profile", "Sour Diesel cultivar information", "Leafly", "https://www.leafly.com/strains/sour-diesel", "community", "Directional public source; Verdant copy is original and cautious."),
  source("og-kush-public-profile", "OG Kush cultivar information", "Leafly", "https://www.leafly.com/strains/og-kush", "community", "Directional public source; Verdant copy is original and cautious."),
  source("blue-dream-public-profile", "Blue Dream cultivar information", "Leafly", "https://www.leafly.com/strains/blue-dream", "community", "Directional public source; Verdant copy is original and cautious."),
  source("gg4-public-profile", "Original Glue cultivar information", "Leafly", "https://www.leafly.com/strains/original-glue", "community", "Directional public source; Verdant copy is original and cautious."),
  source("lemon-cherry-gelato-public-profile", "Lemon Cherry Gelato cultivar information", "Leafly", "https://www.leafly.com/strains/lemon-cherry-gelato", "community", "Directional public source; Verdant copy is original and cautious."),
  source("oreoz-public-profile", "Oreoz cultivar information", "Leafly", "https://www.leafly.com/strains/oreoz", "community", "Directional public source; Verdant copy is original and cautious."),
  source("do-si-dos-public-profile", "Do-Si-Dos cultivar information", "Leafly", "https://www.leafly.com/strains/do-si-dos", "community", "Directional public source; Verdant copy is original and cautious."),
  source("blue-cookies-public-profile", "Blue Cookies cultivar information", "Leafly", "https://www.leafly.com/strains/blue-cookies", "community", "Directional public source; Verdant copy is original and cautious."),
  source("jack-herer-public-profile", "Jack Herer cultivar information", "Leafly", "https://www.leafly.com/strains/jack-herer", "community", "Directional public source; Verdant copy is original and cautious."),
  source("sour-stomper-product-info", "Sour Stomper product information", "Mephisto Genetics", "https://eu.mephistogenetics.com/products/sour-stomper", "breeder", "Used for breeder-reported identity and timing context; copy is not reproduced."),
];

const SECTION_TITLES: Readonly<Record<CultivarGuideSectionKey, string>> = {
  overview: "Overview", germination: "Germination", early_growth: "Early growth",
  vegetative: "Vegetative growth", flowering: "Flowering", environment: "Environment",
  watering: "Watering", nutrition: "Nutrition", training: "Training",
  common_issues: "Common issues", harvest: "Harvest", post_harvest: "Post-harvest",
  pheno_tips: "Pheno tips", missing_information: "Missing information",
};

const BASE_COPY: Readonly<Record<CultivarGuideSectionKey, readonly [string, string, string, string]>> = {
  overview: ["Use this profile as reference context, then verify every tendency against the plant in front of you.", "Start with the actual stage, medium, pot size, logs, photos, and source-labeled sensor history.", "Do not convert a named-cultivar profile into a universal recipe.", "Breeder release, phenotype, and batch identity may be incomplete or disputed."],
  germination: ["Germination fundamentals are shared and are not a reliable cultivar-selection signal.", "Keep moisture and temperature stable and minimize handling once the seed is placed.", "Do not infer vigor or final quality from germination speed alone.", "Cultivar-specific germination evidence is usually limited."],
  early_growth: ["Evaluate early growth through stability, root-zone correctness, and observation.", "Record emergence, leaf development, watering, and deviations before changing inputs.", "Avoid chasing small early differences with heavy feeding or stress.", "Reliable cultivar-specific early-growth trials are limited."],
  vegetative: ["Vegetative structure can vary among phenotypes carrying the same commercial name.", "Log internode spacing, branching, vigor, and recovery from low-risk handling.", "Do not assume market classification predicts structure or nutrient demand.", "Matched-environment replication is usually missing."],
  flowering: ["Reported timing is directional and should be checked against observed maturity.", "Track first flower, stretch, resin, aroma, and finish cues in the timeline.", "Do not harvest on a catalog day number alone.", "Sources may not define flowering day one or maturity criteria."],
  environment: ["Environmental stability matters more than a copied cultivar-name target.", "Derive VPD only from validated temperature and humidity, then compare it with stage and response.", "Never present stale, invalid, demo, or mis-unit telemetry as healthy.", "Controlled cultivar response curves are rarely available."],
  watering: ["Watering depends on medium, root mass, container, environment, and dryback.", "Log volume, timing, substrate response, and plant response before changing cadence.", "Do not use uncalibrated soil-moisture percentages as absolute instructions.", "Cultivar-specific root-zone calibration is generally unavailable."],
  nutrition: ["Feeding descriptions are weak evidence without medium, water, EC, and response context.", "Begin moderately and adjust from measured input and plant response.", "Do not copy an exact nutrient dose from a reference profile.", "Comparable nutrient-response trials are usually missing."],
  training: ["Training response depends on vigor, health, timing, phenotype, and lifecycle.", "Use low-stress structure management and record recovery before increasing intensity.", "Avoid high-stress work when health or environmental stability is uncertain.", "Controlled cultivar-specific training trials are limited."],
  common_issues: ["Issue lists are hypotheses; symptoms still require plant and environment context.", "Document symptoms, recent actions, photos, root-zone context, and telemetry.", "Do not diagnose a deficiency or prescribe feed from cultivar identity alone.", "Frequency and causal evidence for cultivar-specific problems is limited."],
  harvest: ["Harvest timing should reflect observed maturity and intended use.", "Record trichomes, aroma, fade, irrigation history, and the harvest rationale.", "Do not treat reported potency or flowering time as a guaranteed endpoint.", "Sources may not define sample position or maturity criteria."],
  post_harvest: ["Drying, curing, and storage can change aroma retention and measured chemistry.", "Record dry conditions, duration, cure observations, and final quality notes.", "Do not close a keeper decision before post-cure evidence exists.", "Comparable post-harvest protocols and laboratory methods are often absent."],
  pheno_tips: ["Named cultivars can express different structure, aroma, chemistry, and finish.", "Compare matched timepoints and record structure, vigor, resistance, aroma, resin, and post-cure notes.", "A single attractive specimen is not proof of stability.", "Replication count and environment matching may be unknown."],
  missing_information: ["Uncertainty stays visible so a thin record never reads like certainty.", "Use missing-information notes to decide what to observe, measure, photograph, or source next.", "Do not fill missing evidence with invented values or AI-generated certainty.", "Batch COAs, methods, phenotype identity, and matched trials are commonly absent."],
};

const tendency = (text: string, sourceKey: string): CultivarReportedTendency => ({ text, confidence: "medium", evidenceKeys: [sourceKey] });

function makeGuideOverlays(sourceKey: string, values: Partial<Record<CultivarGuideSectionKey, readonly string[]>>): Partial<Record<CultivarGuideSectionKey, CultivarGuideSectionOverlay>> {
  return Object.fromEntries(Object.entries(values).map(([key, texts]) => [key, {
    reportedTendencies: (texts ?? []).map((text) => tendency(text, sourceKey)),
    missingInformation: ["This directional tendency must be checked against the specific release, phenotype, and run."],
  }])) as Partial<Record<CultivarGuideSectionKey, CultivarGuideSectionOverlay>>;
}

function samplePhenos(name: string, aromas: readonly [string, string]): readonly CultivarSamplePheno[] {
  return aromas.map((aroma, index) => ({
    label: `${name} sample ${index === 0 ? "A" : "B"}`,
    structure: "Illustrative expression only — not a real grower record",
    aroma,
    resin: "Illustrative relative observation only",
    yieldNote: "Sample comparison field — no yield claim",
    finishNote: index === 0 ? "Finish must be recorded from the actual plant" : "Post-cure follow-up remains required",
  }));
}

function terpeneClaim(terpene: string, rank: number, aromaDescriptors: readonly string[], sourceKey: string): CultivarTerpeneClaim {
  return { terpene, rank, valueMinPct: null, valueMaxPct: null, aromaDescriptors, confidence: "medium", sourceKey, context: {
    analyticalMethod: "not_reported", sampleScope: "Public named-cultivar summary; not a batch-specific laboratory result.", variabilityNote: TERPENE_VARIABILITY,
  }};
}

function cannabinoidClaim(min: number | null, max: number | null, sourceKey: string): CultivarCannabinoidClaim[] {
  if (min == null && max == null) return [];
  return [{ cannabinoid: "reported_thc", label: "Source-reported THC summary", valueMinPct: min, valueMaxPct: max, confidence: "medium", sourceKey, context: {
    analyticalMethod: "not_reported", measurementBasis: "source_reported_summary", sampleScope: "Public cultivar profile; not one universal batch or Certificate of Analysis.", decarboxylationFactor: null, variabilityNote: CHEMISTRY_VARIABILITY,
  }}];
}

interface ProfileSeed {
  slug: string; name: string; aliases: readonly string[]; breeder: string | null;
  lineage: string; intro: string; lifeCycle: CultivarLifeCycle;
  seedExpression: CultivarSeedExpression; marketClassification: CultivarMarketClassification;
  difficulty: CultivarDifficulty; heightCategory: CultivarHeightCategory;
  flowerWeeks: string; floweringDays: readonly [number | null, number | null];
  stretch: readonly [number | null, number | null]; thc: readonly [number | null, number | null];
  chemotype: CultivarChemotype; sourceKey: string;
  terpenes: readonly { name: string; aromas: readonly string[] }[];
  tendencies: Partial<Record<CultivarGuideSectionKey, readonly string[]>>;
  phenoHuntFocus: readonly string[]; sampleAromas: readonly [string, string];
}

const PROFILE_SEEDS: readonly ProfileSeed[] = [
  { slug: "sour-diesel", name: "Sour Diesel", aliases: ["Sour D", "Sour Deez"], breeder: null, lineage: "Commonly reported as Chemdog-family genetics; exact origin remains disputed", intro: "A sample reference for the widely circulated Sour Diesel name. Public reports often emphasize vigorous stretch and fuel, citrus, and pine aroma direction, while release and phenotype identity can differ substantially.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "sativa", difficulty: "Advanced", heightCategory: "tall", flowerWeeks: "11–12 weeks reported", floweringDays: [77, 84], stretch: [1.8, 3], thc: [20, 26], chemotype: "type_i", sourceKey: "sour-diesel-public-profile", terpenes: [{ name: "myrcene", aromas: ["earthy", "herbal"] }, { name: "limonene", aromas: ["citrus", "lemon"] }, { name: "beta-caryophyllene", aromas: ["peppery", "woody"] }], tendencies: { overview: ["Fuel, citrus, and pine direction is commonly reported."], vegetative: ["Many reports describe vigorous vertical growth and longer internodes."], flowering: ["A longer directional flower window makes stage observation more useful than a fixed calendar."], training: ["Early low-stress canopy planning may help manage stretch when the plant is healthy."], pheno_tips: ["Compare fuel, citrus, and pine expression separately rather than treating the name as one fixed profile."] }, phenoHuntFocus: ["Stretch ratio", "Fuel/citrus/pine balance", "Finish timing", "Post-cure aroma retention"], sampleAromas: ["Fuel and citrus direction", "Pine and herbal direction"] },
  { slug: "og-kush", name: "OG Kush", aliases: ["OG", "Original Gangster Kush"], breeder: null, lineage: "Widely disputed; commonly associated with Chemdog, Hindu Kush, and regional OG lines", intro: "OG Kush is a broad commercial name with multiple cuts and seed-line interpretations. Earthy, pine, and fuel reports are useful discovery context, not proof of one fixed genotype or chemistry.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Intermediate", heightCategory: "medium", flowerWeeks: "7–8 weeks reported", floweringDays: [49, 56], stretch: [1.4, 2.2], thc: [18, 26], chemotype: "type_i", sourceKey: "og-kush-public-profile", terpenes: [{ name: "myrcene", aromas: ["earthy", "herbal"] }, { name: "limonene", aromas: ["citrus"] }, { name: "beta-caryophyllene", aromas: ["peppery", "woody"] }], tendencies: { overview: ["Earthy, pine, and fuel descriptors are commonly associated with OG Kush-labelled material."], vegetative: ["Structure can vary markedly among cuts and seed-line interpretations."], flowering: ["Maturity checks should lead rather than a fixed short finish claim."], common_issues: ["Dense interior growth may make airflow documentation useful in some expressions."], pheno_tips: ["Record cut or breeder identity because the name alone is ambiguous."] }, phenoHuntFocus: ["Cut/breeder identity", "Pine/fuel aroma", "Branch support", "Post-cure consistency"], sampleAromas: ["Earthy pine and fuel direction", "Citrus and woody direction"] },
  { slug: "blue-dream", name: "Blue Dream", aliases: ["Blueberry Haze"], breeder: null, lineage: "Commonly reported as Blueberry × Haze", intro: "Blue Dream-labelled plants are commonly associated with vigorous growth and berry, herbal, and pine aroma direction. Public chemistry and finish ranges vary, so the profile is intentionally a weak prior.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Beginner-friendly", heightCategory: "tall", flowerWeeks: "9–10 weeks reported", floweringDays: [63, 70], stretch: [1.6, 2.5], thc: [21, 24], chemotype: "type_i", sourceKey: "blue-dream-public-profile", terpenes: [{ name: "myrcene", aromas: ["herbal", "earthy"] }, { name: "alpha-pinene", aromas: ["pine", "resinous"] }, { name: "beta-caryophyllene", aromas: ["peppery"] }], tendencies: { overview: ["Berry, herbal, and pine descriptors are frequently reported."], vegetative: ["Public grow reports often describe vigorous branching and appreciable stretch."], training: ["Healthy plants may respond to early low-stress canopy organization."], flowering: ["A nine-to-ten-week directional window is commonly reported."], pheno_tips: ["Compare berry intensity, pine direction, stretch, and finish under matched conditions."] }, phenoHuntFocus: ["Berry/pine balance", "Stretch", "Branching", "Finish uniformity"], sampleAromas: ["Berry and herbal direction", "Pine and floral direction"] },
  { slug: "gg4", name: "Original Glue (GG4)", aliases: ["GG4", "Gorilla Glue #4", "Original Glue"], breeder: "GG Strains LLC", lineage: "Chem's Sister × Sour Dubb × Chocolate Diesel", intro: "Original Glue, widely searched as GG4 or Gorilla Glue #4, is a clone-associated reference commonly described as vigorous, resinous, earthy, and caryophyllene-forward. A named clone does not make every sample chemically identical.", lifeCycle: "photoperiod", seedExpression: "clone_only", marketClassification: "hybrid", difficulty: "Intermediate", heightCategory: "tall", flowerWeeks: "8–9 weeks reported", floweringDays: [56, 63], stretch: [1.6, 2.5], thc: [27, 30], chemotype: "type_i", sourceKey: "gg4-public-profile", terpenes: [{ name: "beta-caryophyllene", aromas: ["peppery", "spicy", "woody"] }, { name: "myrcene", aromas: ["earthy", "herbal"] }, { name: "limonene", aromas: ["citrus"] }], tendencies: { overview: ["Earthy, pungent, and peppery aroma direction is commonly reported."], vegetative: ["Vigorous branching and stretch are frequently described."], flowering: ["Heavy resin and branch-loading reports make support and airflow observations useful."], training: ["Early support and low-stress canopy organization may help when vigor is strong."], pheno_tips: ["Verify provenance when possible because the clone-associated identity is widely imitated."] }, phenoHuntFocus: ["Provenance", "Caryophyllene/earth aroma", "Resin", "Stem support"], sampleAromas: ["Peppery earth and fuel direction", "Herbal citrus direction"] },
  { slug: "lemon-cherry-gelato", name: "Lemon Cherry Gelato", aliases: ["LCG"], breeder: null, lineage: "Commonly reported as Sunset Sherbet × Girl Scout Cookies, with release identity varying", intro: "Lemon Cherry Gelato is a modern commercial name associated with citrus, sweet fruit, and dessert aroma reports. Verdant stores lineage, potency, and terpene direction as source-specific claims rather than one official signature.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Intermediate", heightCategory: "medium", flowerWeeks: "8–10 weeks reported", floweringDays: [56, 70], stretch: [1.3, 2], thc: [20, 30], chemotype: "type_i", sourceKey: "lemon-cherry-gelato-public-profile", terpenes: [{ name: "limonene", aromas: ["lemon", "citrus"] }, { name: "beta-caryophyllene", aromas: ["peppery", "woody"] }, { name: "linalool", aromas: ["floral"] }], tendencies: { overview: ["Citrus, cherry-like fruit, and dessert descriptors are commonly reported."], flowering: ["Color, resin, and aroma expression should be recorded independently rather than treated as guaranteed."], environment: ["Do not chase color with environmental stress; stability remains the priority."], common_issues: ["Dense flower reports make late-flower airflow and humidity records relevant."], pheno_tips: ["Compare citrus, fruit, dessert, structure, and post-cure retention as separate traits."] }, phenoHuntFocus: ["Citrus/cherry aroma", "Color without stress", "Resin", "Post-cure retention"], sampleAromas: ["Citrus and cherry direction", "Dessert and floral direction"] },
  { slug: "oreoz", name: "Oreoz", aliases: ["Oreos", "Oreo Cookies"], breeder: "3rd Coast Genetics", lineage: "Cookies & Cream × Secret Weapon", intro: "Oreoz is commonly described as compact, resin-forward, and dessert/fuel aromatic. V1 leaves unsupported timing and chemistry summaries blank rather than inventing precision.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Intermediate", heightCategory: "short", flowerWeeks: "Information limited", floweringDays: [null, null], stretch: [null, null], thc: [null, null], chemotype: "unknown", sourceKey: "oreoz-public-profile", terpenes: [{ name: "beta-caryophyllene", aromas: ["peppery", "woody"] }, { name: "limonene", aromas: ["citrus"] }, { name: "myrcene", aromas: ["earthy"] }], tendencies: { overview: ["Dessert, earthy, and fuel descriptors are commonly reported."], vegetative: ["Compact growth and short internodes are frequently reported, but not universal."], flowering: ["Resin-forward descriptions are common while reliable timing context is limited."], common_issues: ["Dense interior growth may warrant careful airflow observation in some expressions."], missing_information: ["V1 intentionally leaves flowering and potency summaries blank where evidence is too thin."] }, phenoHuntFocus: ["Structure", "Fuel/dessert aroma", "Resin", "Evidence completeness"], sampleAromas: ["Fuel and cookie direction", "Earthy dessert direction"] },
  { slug: "do-si-dos", name: "Do-Si-Dos", aliases: ["Dosidos", "Dosi"], breeder: "Archive Seed Bank", lineage: "OGKB (Girl Scout Cookies phenotype) × Face Off OG", intro: "Do-Si-Dos is commonly associated with sweet, earthy, floral, and fuel notes plus notable resin. Actual sensitivity, structure, and chemistry must be learned from the run.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Intermediate", heightCategory: "medium", flowerWeeks: "8–10 weeks reported", floweringDays: [56, 70], stretch: [1.3, 2], thc: [20, 30], chemotype: "type_i", sourceKey: "do-si-dos-public-profile", terpenes: [{ name: "limonene", aromas: ["citrus"] }, { name: "beta-caryophyllene", aromas: ["peppery"] }, { name: "linalool", aromas: ["floral", "lavender"] }], tendencies: { overview: ["Sweet, earthy, floral, and fuel directions are commonly reported."], flowering: ["Resin development is frequently emphasized in public reports."], nutrition: ["Some grow reports describe sensitivity; measured response should lead instead of prophylactic supplements."], watering: ["Overwatering concerns should be evaluated from medium, dryback, and plant response."], pheno_tips: ["Compare floral versus earthy/fuel expression after cure, not only during flower."] }, phenoHuntFocus: ["Floral/earth aroma", "Resin", "Stretch", "Post-cure expression"], sampleAromas: ["Floral and sweet direction", "Earthy and fuel direction"] },
  { slug: "blue-cookies", name: "Blue Cookies", aliases: ["Blue GSC"], breeder: null, lineage: "Commonly reported as Girl Scout Cookies × Blueberry", intro: "Blue Cookies-labelled material is often associated with fruit, berry, earth, and dessert notes. Identity and release provenance can vary, so color, aroma, and potency are observations to verify rather than promises.", lifeCycle: "photoperiod", seedExpression: "unknown", marketClassification: "hybrid", difficulty: "Beginner-friendly", heightCategory: "medium", flowerWeeks: "8–9 weeks reported", floweringDays: [56, 63], stretch: [1.2, 1.8], thc: [18, 25], chemotype: "type_i", sourceKey: "blue-cookies-public-profile", terpenes: [{ name: "beta-caryophyllene", aromas: ["peppery", "woody"] }, { name: "limonene", aromas: ["citrus"] }, { name: "myrcene", aromas: ["earthy"] }], tendencies: { overview: ["Berry, fruit, earth, and cookie/dessert descriptors are commonly reported."], flowering: ["Color expression may vary and should not be forced with stress."], environment: ["Cooler late-flower nights may coincide with color in some phenotypes, but stability takes priority."], common_issues: ["Dense flower and high humidity can increase fungal risk independent of cultivar name."], pheno_tips: ["Compare fruit versus cookie expression and post-cure retention under matched conditions."] }, phenoHuntFocus: ["Fruit/cookie aroma", "Color without stress", "Density", "Post-cure retention"], sampleAromas: ["Berry and fruit direction", "Cookie and earthy direction"] },
  { slug: "jack-herer", name: "Jack Herer", aliases: ["Jack"], breeder: "Sensi Seeds", lineage: "Commonly reported as Haze × Northern Lights #5 × Shiva Skunk", intro: "Jack Herer is a long-circulating name associated with spicy, pine, herbal, and terpinolene-forward reports. Seed releases and phenotypes can differ, so Verdant emphasizes provenance and matched comparison.", lifeCycle: "photoperiod", seedExpression: "regular", marketClassification: "sativa", difficulty: "Intermediate", heightCategory: "tall", flowerWeeks: "8–10 weeks reported", floweringDays: [56, 70], stretch: [1.5, 2.5], thc: [18, 24], chemotype: "type_i", sourceKey: "jack-herer-public-profile", terpenes: [{ name: "terpinolene", aromas: ["floral", "herbal", "citrus", "pine"] }, { name: "alpha-pinene", aromas: ["pine", "forest"] }, { name: "beta-caryophyllene", aromas: ["peppery"] }], tendencies: { overview: ["Spicy, pine, herbal, and complex terpinolene-associated descriptors are commonly reported."], vegetative: ["Vigorous vertical growth and branching are frequently described."], flowering: ["Phenotypes may differ in finish and structure, making matched timepoint comparison important."], training: ["Early low-stress canopy planning may help manage stretch when vigor is strong."], pheno_tips: ["Record terpinolene/pine direction and finish timing across replicated candidates."] }, phenoHuntFocus: ["Terpinolene/pine aroma", "Stretch", "Finish timing", "Replication"], sampleAromas: ["Herbal pine and spice direction", "Floral citrus direction"] },
  { slug: "sour-stomper", name: "Sour Stomper", aliases: ["Sour Stomper Auto"], breeder: "Mephisto Genetics", lineage: "Breeder-reported Grapestomper OG × Sour Crack", intro: "Sour Stomper is the V1 autoflower reference. Breeder-reported timing and aroma are directional context, while recovery, watering, environment, and gentle training decisions stay tied to the actual plant.", lifeCycle: "autoflower", seedExpression: "feminized", marketClassification: "hybrid", difficulty: "Beginner-friendly", heightCategory: "medium", flowerWeeks: "65–75 days from sprout reported", floweringDays: [65, 75], stretch: [null, null], thc: [18, 24], chemotype: "unknown", sourceKey: "sour-stomper-product-info", terpenes: [{ name: "limonene", aromas: ["citrus"] }, { name: "beta-caryophyllene", aromas: ["peppery", "woody"] }, { name: "myrcene", aromas: ["earthy"] }], tendencies: { overview: ["Breeder material describes a sour fruit/grape and candy-associated aroma direction."], early_growth: ["Autoflower timing makes stable early root-zone and environment conditions especially important."], flowering: ["A 65–75 day from-sprout range is breeder-reported and is not a guaranteed harvest date."], training: ["Gentle low-stress canopy support is preferable to repeated high-stress recovery demands."], pheno_tips: ["Compare sour fruit, grape/candy direction, structure, and finish without assuming one fixed expression."] }, phenoHuntFocus: ["Sour fruit/grape aroma", "Early vigor", "Low-stress response", "Finish timing"], sampleAromas: ["Sour fruit and grape direction", "Candy citrus direction"] },
];

function buildProfile(seed: ProfileSeed): VerdantCultivarProfile {
  const overlays = makeGuideOverlays(seed.sourceKey, seed.tendencies);
  if (seed.lifeCycle === "autoflower") {
    overlays.training = {
      ...overlays.training,
      guidance: [{ text: "Use gentle low-stress canopy support only while the plant is healthy and actively growing.", risk: "low" }],
      cautions: ["Avoid high-stress training, heavy defoliation, transplant shock, and repeated recovery demands on an autoflower."],
      missingInformation: ["Controlled breeder-specific recovery trials are not available in this sample reference."],
    };
  }
  return {
    slug: seed.slug, name: seed.name, searchAlias: `${seed.name} ${seed.lifeCycle === "autoflower" ? "autoflower " : ""}strain`, aliases: seed.aliases,
    breeder: seed.breeder, lineage: seed.lineage, intro: seed.intro, lifeCycle: seed.lifeCycle,
    seedExpression: seed.seedExpression, marketClassification: seed.marketClassification,
    difficulty: seed.difficulty, heightCategory: seed.heightCategory, flowerWeeks: seed.flowerWeeks,
    floweringDaysMin: seed.floweringDays[0], floweringDaysMax: seed.floweringDays[1],
    stretchMin: seed.stretch[0], stretchMax: seed.stretch[1], yieldIndoorGPerM2Min: null, yieldIndoorGPerM2Max: null,
    thcPctMin: seed.thc[0], thcPctMax: seed.thc[1], cbdPctMin: null, cbdPctMax: null,
    chemotype: seed.chemotype, dominantTerpenes: seed.terpenes.map((item) => item.name),
    terpeneClaims: seed.terpenes.map((item, index) => terpeneClaim(item.name, index + 1, item.aromas, seed.sourceKey)),
    cannabinoidClaims: cannabinoidClaim(seed.thc[0], seed.thc[1], seed.sourceKey),
    publicationStatus: "published", verificationStatus: "sample", dataOrigin: "sample",
    lastVerifiedAt: LAST_VERIFIED_AT, guideVersion: 1, contentSchemaVersion: 1,
    sourceKeys: [seed.sourceKey, ...COMMON_SOURCE_KEYS], guideOverlays: overlays,
    phenoHuntFocus: seed.phenoHuntFocus, samplePhenos: samplePhenos(seed.name, seed.sampleAromas),
  };
}

export const VERDANT_CULTIVARS: readonly VerdantCultivarProfile[] = PROFILE_SEEDS.map(buildProfile);
export const VERDANT_CULTIVAR_SLUGS = VERDANT_CULTIVARS.map((cultivar) => cultivar.slug);

export function formatVerificationStatus(status: CultivarVerificationStatus): string {
  switch (status) {
    case "sample": return "Sample reference data";
    case "community": return "Community-supported";
    case "reviewed": return "Verdant reviewed";
    case "verified": return "Source-backed";
  }
}

export function findCultivarBySlug(slug: string | undefined): VerdantCultivarProfile | undefined {
  return slug ? VERDANT_CULTIVARS.find((cultivar) => cultivar.slug === slug) : undefined;
}

const uniqueStrings = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value.trim().length > 0))];
const uniqueGuidance = (values: readonly CultivarGuidanceItem[]): CultivarGuidanceItem[] => [...new Map(values.map((value) => [value.text, value])).values()];

function buildBaseGuide(lifeCycle: CultivarLifeCycle): readonly CultivarGuideSection[] {
  return CULTIVAR_GUIDE_SECTION_KEYS.map((key) => {
    const [summary, guidance, caution, missing] = BASE_COPY[key];
    const autoTraining = lifeCycle === "autoflower" && key === "training";
    return {
      key, title: SECTION_TITLES[key], summary, confidence: "medium", reportedTendencies: [],
      guidance: [{ text: autoTraining ? "Use gentle low-stress canopy support only while the plant is healthy and actively growing." : guidance, risk: "low" }],
      cautions: [autoTraining ? "Avoid high-stress training, heavy defoliation, transplant shock, and repeated recovery demands on an autoflower." : caution],
      missingInformation: [missing],
    };
  });
}

export function getCultivarGuideSections(cultivar: VerdantCultivarProfile): readonly CultivarGuideSection[] {
  return buildBaseGuide(cultivar.lifeCycle).map((section) => {
    const overlay = cultivar.guideOverlays[section.key];
    return overlay ? {
      ...section,
      summary: overlay.summary ?? section.summary,
      confidence: overlay.confidence ?? section.confidence,
      reportedTendencies: [...section.reportedTendencies, ...(overlay.reportedTendencies ?? [])],
      guidance: uniqueGuidance([...section.guidance, ...(overlay.guidance ?? [])]),
      cautions: uniqueStrings([...section.cautions, ...(overlay.cautions ?? [])]),
      missingInformation: uniqueStrings([...section.missingInformation, ...(overlay.missingInformation ?? [])]),
    } : section;
  });
}

const SOURCE_BY_KEY = new Map(CULTIVAR_SOURCES.map((item) => [item.key, item]));
export function getCultivarSources(cultivar: VerdantCultivarProfile): CultivarSource[] {
  return cultivar.sourceKeys.map((key) => SOURCE_BY_KEY.get(key)).filter((item): item is CultivarSource => item !== undefined);
}
