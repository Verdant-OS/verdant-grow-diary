export const CANNABIS_SYMPTOM_IDS = ["yellowing", "spots", "tip_damage"] as const;

export type CannabisSymptomId = (typeof CANNABIS_SYMPTOM_IDS)[number];

export interface CannabisSymptomDefinition {
  readonly id: CannabisSymptomId;
  readonly label: string;
  readonly observedSign: "discoloration" | "spots" | "crispy_edges";
  readonly description: string;
  readonly guidePath: string;
  readonly verificationTopics: ReadonlyArray<string>;
  readonly whatToLogNext: string;
  readonly whatNotToAssume: string;
}

export const CANNABIS_SYMPTOM_DEFINITIONS: ReadonlyArray<CannabisSymptomDefinition> = [
  {
    id: "yellowing",
    label: "Yellowing / discoloration",
    observedSign: "discoloration",
    description: "Leaves or leaf areas appear lighter, pale, or yellow.",
    guidePath: "/guides/cannabis-leaves-turning-yellow",
    verificationTopics: [
      "Pattern and leaf age",
      "Root-zone history",
      "Recent feeding",
      "Environment",
    ],
    whatToLogNext:
      "Location, stage, progression, repeatable photos, and the next 24–72 hour response.",
    whatNotToAssume: "Yellowing alone does not prove a nutrient deficiency.",
  },
  {
    id: "spots",
    label: "Spots / lesions",
    observedSign: "spots",
    description: "Discrete spots, lesions, speckling, or damaged patches are visible.",
    guidePath: "/guides/cannabis-leaf-spots-lesions",
    verificationTopics: ["Distribution", "Leaf surfaces", "Watering and feeding", "Environment"],
    whatToLogNext:
      "Distribution, both leaf surfaces, progression, repeatable photos, and scouting observations.",
    whatNotToAssume: "Spots alone do not identify a pest, pathogen, or deficiency.",
  },
  {
    id: "tip_damage",
    label: "Burnt, crispy, or damaged tips",
    observedSign: "crispy_edges",
    description: "Leaf tips or edges look dry, brown, scorched, or crisp.",
    guidePath: "/guides/cannabis-burnt-crispy-leaf-tips",
    verificationTopics: [
      "Affected position",
      "Feed history",
      "Root-zone history",
      "Light and heat",
    ],
    whatToLogNext:
      "Affected canopy position, progression, repeatable photos, and any measured input or room change.",
    whatNotToAssume: "Crispy tips alone do not prove nutrient burn or excess light.",
  },
] as const;

export function findCannabisSymptomById(value: unknown): CannabisSymptomDefinition | null {
  return CANNABIS_SYMPTOM_DEFINITIONS.find((entry) => entry.id === value) ?? null;
}

export function findCannabisSymptomByObservedSign(
  value: unknown,
): CannabisSymptomDefinition | null {
  return CANNABIS_SYMPTOM_DEFINITIONS.find((entry) => entry.observedSign === value) ?? null;
}
