/**
 * Built-in default cultivar options for the breeding program setup flow.
 *
 * These are operator-authored quick-pick presets, NOT Verdant advice or AI
 * output. Every field is stored verbatim — do not paraphrase or auto-fill
 * blank fields with guesses. Blank means blank.
 */

export interface DefaultCultivar {
  readonly id: string;
  readonly cultivarName: string;
  readonly lineage: string;
  readonly cbdThcRatio: string;
  readonly totalMaxCannabinoidRange: string;
  readonly plantSizeAndStructure: string;
  readonly flowerResponse: string;
  readonly harvestWindow: string;
  readonly flowerDescription: string;
}

export const DEFAULT_CULTIVARS: readonly DefaultCultivar[] = [
  {
    id: "banana_cough",
    cultivarName: "banana cough",
    lineage: "",
    cbdThcRatio: "",
    totalMaxCannabinoidRange: "",
    plantSizeAndStructure: "",
    flowerResponse: "",
    harvestWindow: "",
    flowerDescription: "",
  },
  {
    id: "permanent_marker",
    cultivarName: "permanent marker",
    lineage: "",
    cbdThcRatio: "",
    totalMaxCannabinoidRange: "",
    plantSizeAndStructure: "",
    flowerResponse: "",
    harvestWindow: "",
    flowerDescription: "",
  },
] as const;

/**
 * Serialize the descriptive (non-primary) fields as a stable, human-readable
 * block that can be appended to `breeding_programs.notes`. A field with no
 * value is OMITTED — persisting "Lineage: " boilerplate into user notes
 * records nothing and reads as data that was never there.
 */
export function formatCultivarNotes(cultivar: DefaultCultivar): string {
  const lines = [
    [`Cultivar`, cultivar.cultivarName],
    [`Lineage`, cultivar.lineage],
    [`CBD:THC ratio`, cultivar.cbdThcRatio],
    [`Total maximum cannabinoid range`, cultivar.totalMaxCannabinoidRange],
    [`Plant size and structure`, cultivar.plantSizeAndStructure],
    [`Flower response`, cultivar.flowerResponse],
    [`Harvest window`, cultivar.harvestWindow],
    [`Flower description`, cultivar.flowerDescription],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim() !== "")
    .map(([label, value]) => `${label}: ${value}`);
  return lines.join("\n");
}
