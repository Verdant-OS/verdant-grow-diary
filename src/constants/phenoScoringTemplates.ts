/**
 * Verdant starter scoring templates.
 *
 * Original Verdant wording, built from common breeding and horticulture
 * criteria. Both stay draft and internal until a grower-facing launch is
 * decided. They describe what a grower records; they never rank plants or
 * name a keeper.
 *
 * The two templates deliberately use different scales so no code can assume
 * one fixed range.
 */
import type { PhenoScoringOption, PhenoScoringTemplate } from "@/lib/phenoScoringTemplateRules";

/** Shared aroma and flavor vocabulary, so living and dried notes compare. */
const AROMA_NOTE_OPTIONS: readonly PhenoScoringOption[] = [
  { id: "citrus", label: "Citrus" },
  { id: "fruit", label: "Sweet fruit" },
  { id: "berry", label: "Berry" },
  { id: "floral", label: "Floral" },
  { id: "pine", label: "Pine" },
  { id: "herbal", label: "Herbal" },
  { id: "earthy", label: "Earthy" },
  { id: "spice", label: "Spice or pepper" },
  { id: "fuel", label: "Fuel or chemical" },
  { id: "skunk", label: "Skunk" },
  { id: "cheese", label: "Cheese or funk" },
  { id: "dessert", label: "Dessert or cream" },
];

/** Scored on the living plant across one run, 1 to 5. */
export const VERDANT_PHENO_SCORECARD_TEMPLATE: PhenoScoringTemplate = {
  id: "verdant-pheno-scorecard",
  version: 1,
  title: "Pheno scorecard",
  status: "draft",
  visibility: "internal",
  scale: { min: 1, max: 5, step: 1, minLabel: "Weak", maxLabel: "Strong" },
  sections: [
    {
      id: "growth",
      title: "Growth",
      fields: [
        {
          id: "vigor",
          kind: "scale",
          label: "Vigor",
          required: true,
          help: "How fast and evenly this plant grew next to its siblings in the same conditions.",
        },
        {
          id: "clone_rooting",
          kind: "single",
          label: "Cutting rooting speed",
          help: "Only if you took cuttings. Compare with the other cuttings in the same tray.",
          options: [
            { id: "slow", label: "Slower than most" },
            { id: "typical", label: "About the same" },
            { id: "fast", label: "Faster than most" },
          ],
        },
        {
          id: "stretch",
          kind: "single",
          label: "Stretch in early flower",
          options: [
            { id: "low", label: "Little" },
            { id: "moderate", label: "Moderate" },
            { id: "heavy", label: "Heavy" },
          ],
        },
      ],
    },
    {
      id: "structure",
      title: "Structure",
      fields: [
        {
          id: "branch_strength",
          kind: "scale",
          label: "Branch strength",
          help: "Can the branches hold their flowers without much support?",
        },
        {
          id: "node_spacing",
          kind: "single",
          label: "Node spacing",
          options: [
            { id: "tight", label: "Tight" },
            { id: "medium", label: "Medium" },
            { id: "wide", label: "Wide" },
          ],
        },
        {
          id: "plant_shape",
          kind: "single",
          label: "Plant shape",
          options: [
            { id: "single_cola", label: "One main cola" },
            { id: "tapered", label: "Tapered, wider at the base" },
            { id: "bushy", label: "Bushy, even tops" },
            { id: "sprawling", label: "Sprawling" },
          ],
        },
        {
          id: "final_height",
          kind: "measure",
          label: "Height at harvest",
          unit: "cm",
          min: 0,
          max: 400,
        },
      ],
    },
    {
      id: "flower",
      title: "Flower",
      fields: [
        {
          id: "resin_coverage",
          kind: "scale",
          label: "Resin coverage",
          required: true,
          help: "How much of the flowers and sugar leaves are covered in trichomes late in flower.",
        },
        { id: "flower_density", kind: "scale", label: "Flower density" },
        {
          id: "leaf_in_flower",
          kind: "single",
          label: "Leaf in the flowers",
          help: "A rough guide to how much trimming the plant will need.",
          options: [
            { id: "little", label: "Little" },
            { id: "some", label: "Some" },
            { id: "lots", label: "A lot" },
          ],
        },
        {
          id: "flowering_time",
          kind: "measure",
          label: "Days in flower",
          unit: "days",
          min: 0,
          max: 140,
        },
      ],
    },
    {
      id: "health",
      title: "Health and stability",
      fields: [
        {
          id: "intersex_signs",
          kind: "single",
          label: "Intersex signs",
          required: true,
          help: "Pollen sacs or exposed anthers on a female. Record any you see, whatever you think caused them.",
          options: [
            { id: "none_seen", label: "None seen" },
            { id: "few", label: "A few" },
            { id: "many", label: "Many" },
          ],
        },
        {
          id: "pest_disease_resistance",
          kind: "scale",
          label: "Pest and disease resistance",
          help: "Only what you saw in this run. Name any pest or mold pressure in the notes.",
        },
        {
          id: "stress_recovery",
          kind: "scale",
          label: "Recovery from stress",
          help: "How well it bounced back from training, heat, or a watering mistake.",
        },
      ],
    },
    {
      id: "living_aroma",
      title: "Living aroma",
      fields: [
        {
          id: "stem_rub_strength",
          kind: "scale",
          label: "Stem rub strength",
          help: "Rub a stem or sugar leaf lightly and smell your fingers.",
        },
        {
          id: "living_aroma_notes",
          kind: "multi",
          label: "Living aroma notes",
          maxSelections: 3,
          options: AROMA_NOTE_OPTIONS,
        },
      ],
    },
    {
      id: "harvest",
      title: "Harvest",
      fields: [
        { id: "dry_weight", kind: "measure", label: "Dry weight", unit: "g", min: 0 },
        { id: "grower_notes", kind: "note", label: "Notes", maxLength: 1000 },
      ],
    },
  ],
};

/** Scored on dried, cured flower, 0 to 10 in half steps. */
export const VERDANT_TASTING_SCORECARD_TEMPLATE: PhenoScoringTemplate = {
  id: "verdant-tasting-scorecard",
  version: 1,
  title: "Tasting scorecard",
  status: "draft",
  visibility: "internal",
  scale: { min: 0, max: 10, step: 0.5, minLabel: "Poor", maxLabel: "Exceptional" },
  sections: [
    {
      id: "look",
      title: "Look and cure",
      fields: [
        { id: "visual_appeal", kind: "scale", label: "Visual appeal" },
        { id: "visible_resin", kind: "scale", label: "Visible resin" },
        {
          id: "cure_feel",
          kind: "single",
          label: "How the cure feels",
          options: [
            { id: "too_dry", label: "Too dry, crumbles" },
            { id: "right", label: "Springy, snaps cleanly" },
            { id: "too_wet", label: "Still damp" },
          ],
        },
      ],
    },
    {
      id: "dried_aroma",
      title: "Dried aroma",
      fields: [
        {
          id: "jar_aroma_strength",
          kind: "scale",
          label: "Aroma strength in the jar",
          required: true,
        },
        {
          id: "aroma_after_grind",
          kind: "single",
          label: "Aroma after grinding",
          options: [
            { id: "weaker", label: "Weaker" },
            { id: "same", label: "About the same" },
            { id: "stronger", label: "Stronger" },
            { id: "changed", label: "Changed character" },
          ],
        },
        {
          id: "dried_aroma_notes",
          kind: "multi",
          label: "Dried aroma notes",
          maxSelections: 3,
          options: AROMA_NOTE_OPTIONS,
        },
      ],
    },
    {
      id: "flavor",
      title: "Flavor",
      fields: [
        {
          id: "consumption_method",
          kind: "single",
          label: "How it was tasted",
          help: "Flavor reads differently by method, so record it before comparing.",
          options: [
            { id: "flower_vaporizer", label: "Vaporizer" },
            { id: "joint", label: "Joint" },
            { id: "pipe", label: "Pipe or bowl" },
            { id: "other", label: "Other" },
          ],
        },
        { id: "flavor_strength", kind: "scale", label: "Flavor strength", required: true },
        { id: "smoothness", kind: "scale", label: "Smoothness" },
        {
          id: "flavor_matches_aroma",
          kind: "single",
          label: "Flavor matches the aroma",
          options: [
            { id: "yes", label: "Yes" },
            { id: "partly", label: "Partly" },
            { id: "no", label: "No" },
          ],
        },
        {
          id: "flavor_notes",
          kind: "multi",
          label: "Flavor notes",
          maxSelections: 3,
          options: AROMA_NOTE_OPTIONS,
        },
      ],
    },
    {
      id: "effect",
      title: "Effect",
      fields: [
        { id: "effect_strength", kind: "scale", label: "Effect strength" },
        {
          id: "effect_feel",
          kind: "multi",
          label: "How it felt",
          help: "Your own experience only. This is not a health or medical claim.",
          maxSelections: 2,
          options: [
            { id: "energizing", label: "Energizing" },
            { id: "clear", label: "Clear-headed" },
            { id: "relaxing", label: "Relaxing" },
            { id: "sleepy", label: "Sleepy" },
            { id: "head", label: "Mostly in the head" },
            { id: "body", label: "Mostly in the body" },
          ],
        },
        {
          id: "effect_length",
          kind: "measure",
          label: "How long it lasted",
          unit: "minutes",
          min: 0,
          max: 600,
        },
        { id: "tasting_notes", kind: "note", label: "Notes", maxLength: 1000 },
      ],
    },
  ],
};

export const PHENO_SCORING_EXAMPLE_TEMPLATES = [
  VERDANT_PHENO_SCORECARD_TEMPLATE,
  VERDANT_TASTING_SCORECARD_TEMPLATE,
] as const;
