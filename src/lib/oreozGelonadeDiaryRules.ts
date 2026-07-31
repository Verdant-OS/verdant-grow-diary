/**
 * Pure, deterministic view rules for comparing the grower's own Oreoz and
 * Gelonade phenotype observations.
 *
 * Scores are subjective 1–5 records. They are summarized, never used to rank
 * plants, name a winner, or automate a keeper decision.
 */

import {
  OREOZ_GELONADE_CULTIVARS,
  OREOZ_GELONADE_PHENO_NOTE_PROMPT,
  type OreozGelonadeCultivarKey,
} from "@/constants/oreozGelonadeExperience";
import {
  DEFAULT_HYBRID_TRAITS,
  isValidTraitScore,
  type PhenoTraitDefinition,
} from "@/lib/phenoTraitScoringRules";
import {
  buildPlantQuickLogPrefill,
  type PlantQuickLogPrefill,
} from "@/lib/plantQuickLogPrefillRules";

export interface OreozGelonadePlantRow {
  readonly id: string;
  readonly name: string;
  readonly strain?: string | null;
  readonly candidate_label?: string | null;
  readonly pheno_hunt_id?: string | null;
  readonly grow_id?: string | null;
  readonly tent_id?: string | null;
  readonly stage?: string | null;
  readonly created_at?: string | null;
}

export interface OreozGelonadeScoreRow {
  readonly plantId: string;
  readonly huntId: string;
  readonly traits: Readonly<Record<string, number>>;
  readonly note: string | null;
  readonly updatedAt: string | null;
}

export interface OreozGelonadePlantProfile {
  readonly id: string;
  readonly name: string;
  readonly candidateLabel: string | null;
  readonly cultivar: OreozGelonadeCultivarKey;
  readonly huntId: string | null;
  readonly growId: string | null;
  readonly tentId: string | null;
  readonly stage: string | null;
  readonly traits: Readonly<Record<string, number>>;
  readonly growthHabitNote: string | null;
  readonly scoreUpdatedAt: string | null;
  readonly canEditPhenotype: boolean;
  readonly canQuickLog: boolean;
}

export interface TraitObservation {
  readonly plantId: string;
  readonly label: string;
  readonly score: number | null;
}

export interface TraitSideSummary {
  readonly cultivar: OreozGelonadeCultivarKey;
  readonly observations: readonly TraitObservation[];
  readonly observedCount: number;
  readonly average: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export interface OreozGelonadeTraitComparison {
  readonly key: string;
  readonly label: string;
  readonly oreoz: TraitSideSummary;
  readonly gelonade: TraitSideSummary;
  readonly difference: string;
}

export interface OreozGelonadeDiaryView {
  readonly plants: readonly OreozGelonadePlantProfile[];
  readonly byCultivar: Readonly<
    Record<OreozGelonadeCultivarKey, readonly OreozGelonadePlantProfile[]>
  >;
  readonly traitComparisons: readonly OreozGelonadeTraitComparison[];
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedCultivarName(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchOreozGelonadeCultivar(value: unknown): OreozGelonadeCultivarKey | null {
  const normalized = normalizedCultivarName(value);
  if (!normalized) return null;
  for (const cultivar of Object.values(OREOZ_GELONADE_CULTIVARS)) {
    if (cultivar.aliases.includes(normalized)) return cultivar.key;
  }
  return null;
}

function normalizeTraits(value: unknown): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(DEFAULT_HYBRID_TRAITS.map((trait) => trait.key));
  const normalized: Record<string, number> = {};
  for (const [key, score] of Object.entries(value as Record<string, unknown>)) {
    if (allowed.has(key) && isValidTraitScore(score)) normalized[key] = score;
  }
  return normalized;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePlantProfiles(a: OreozGelonadePlantProfile, b: OreozGelonadePlantProfile): number {
  const labelA = (a.candidateLabel ?? a.name).toLowerCase();
  const labelB = (b.candidateLabel ?? b.name).toLowerCase();
  return compareText(labelA, labelB) || compareText(a.name, b.name) || compareText(a.id, b.id);
}

const CULTIVAR_ORDER: Readonly<Record<OreozGelonadeCultivarKey, number>> = {
  oreoz: 0,
  gelonade: 1,
};

function summarizeSide(
  cultivar: OreozGelonadeCultivarKey,
  plants: readonly OreozGelonadePlantProfile[],
  traitKey: string,
): TraitSideSummary {
  const observations = plants.map((plant) => ({
    plantId: plant.id,
    label: plant.candidateLabel ?? plant.name,
    score: isValidTraitScore(plant.traits[traitKey]) ? plant.traits[traitKey] : null,
  }));
  const scores = observations.flatMap((item) => (item.score === null ? [] : [item.score]));
  return {
    cultivar,
    observations,
    observedCount: scores.length,
    average:
      scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    minimum: scores.length > 0 ? Math.min(...scores) : null,
    maximum: scores.length > 0 ? Math.max(...scores) : null,
  };
}

function differenceCopy(
  label: string,
  oreoz: TraitSideSummary,
  gelonade: TraitSideSummary,
): string {
  if (oreoz.average === null && gelonade.average === null) {
    return `No ${label.toLowerCase()} scores are recorded yet.`;
  }
  if (oreoz.average === null || gelonade.average === null) {
    const recorded = oreoz.average !== null ? "Oreoz" : "Gelonade";
    return `Only ${recorded} has a recorded ${label.toLowerCase()} score, so no cross-cultivar difference can be inferred yet.`;
  }
  const delta = oreoz.average - gelonade.average;
  if (Math.abs(delta) < 0.25) {
    return `Your recorded ${label.toLowerCase()} averages are similar (${oreoz.average.toFixed(1)} vs ${gelonade.average.toFixed(1)}).`;
  }
  const higher = delta > 0 ? "Oreoz" : "Gelonade";
  return `${higher} is ${Math.abs(delta).toFixed(1)} points higher in your current subjective ${label.toLowerCase()} records; this is not a general cultivar claim.`;
}

function buildTraitComparison(
  definition: PhenoTraitDefinition,
  byCultivar: Readonly<Record<OreozGelonadeCultivarKey, readonly OreozGelonadePlantProfile[]>>,
): OreozGelonadeTraitComparison {
  const oreoz = summarizeSide("oreoz", byCultivar.oreoz, definition.key);
  const gelonade = summarizeSide("gelonade", byCultivar.gelonade, definition.key);
  return {
    key: definition.key,
    label: definition.label,
    oreoz,
    gelonade,
    difference: differenceCopy(definition.label, oreoz, gelonade),
  };
}

export function buildOreozGelonadeDiaryView(
  plants: readonly OreozGelonadePlantRow[] | null | undefined,
  scoresByPlant: Readonly<Record<string, OreozGelonadeScoreRow>> | null | undefined,
): OreozGelonadeDiaryView {
  const scores = scoresByPlant ?? {};
  const profiles: OreozGelonadePlantProfile[] = [];

  for (const plant of plants ?? []) {
    if (!plant || typeof plant.id !== "string" || typeof plant.name !== "string") continue;
    const cultivar = matchOreozGelonadeCultivar(plant.strain);
    if (!cultivar) continue;
    const huntId = clean(plant.pheno_hunt_id);
    const score = scores[plant.id];
    const scoreMatchesHunt = Boolean(score && huntId && score.huntId === huntId);
    profiles.push({
      id: plant.id,
      name: clean(plant.name) ?? "Unnamed plant",
      candidateLabel: clean(plant.candidate_label),
      cultivar,
      huntId,
      growId: clean(plant.grow_id),
      tentId: clean(plant.tent_id),
      stage: clean(plant.stage),
      traits: scoreMatchesHunt ? normalizeTraits(score.traits) : {},
      growthHabitNote: scoreMatchesHunt ? clean(score.note) : null,
      scoreUpdatedAt: scoreMatchesHunt ? clean(score.updatedAt) : null,
      canEditPhenotype: Boolean(huntId),
      canQuickLog: Boolean(clean(plant.grow_id) && clean(plant.tent_id)),
    });
  }

  profiles.sort(
    (a, b) => CULTIVAR_ORDER[a.cultivar] - CULTIVAR_ORDER[b.cultivar] || comparePlantProfiles(a, b),
  );
  const byCultivar = {
    oreoz: profiles.filter((plant) => plant.cultivar === "oreoz").sort(comparePlantProfiles),
    gelonade: profiles.filter((plant) => plant.cultivar === "gelonade").sort(comparePlantProfiles),
  } as const;

  return {
    plants: profiles,
    byCultivar,
    traitComparisons: DEFAULT_HYBRID_TRAITS.map((definition) =>
      buildTraitComparison(definition, byCultivar),
    ),
  };
}

export function normalizeEditableTraitRecord(
  input: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, number> {
  return { ...normalizeTraits(input) };
}

export function normalizeGrowthHabitNote(value: unknown): string | null {
  const note = clean(value);
  if (!note) return null;
  return note.slice(0, 2000);
}

export function buildPhenotypicObservationQuickLogPrefill(
  plant: OreozGelonadePlantProfile | null | undefined,
): (PlantQuickLogPrefill & { note: string; source: "oreoz-gelonade-diary" }) | null {
  if (!plant) return null;
  const base = buildPlantQuickLogPrefill({
    plantId: plant.id,
    plantName: plant.name,
    growId: plant.growId,
    tentId: plant.tentId,
    eventType: "observation",
  });
  if (!base) return null;
  return {
    ...base,
    note: OREOZ_GELONADE_PHENO_NOTE_PROMPT,
    source: "oreoz-gelonade-diary",
  };
}
