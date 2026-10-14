export interface GrowHelpExternalReference {
  label: string;
  url: `https://${string}`;
  method: string;
  note?: string;
}

export interface GrowHelpReferenceGroup {
  title: string;
  sources: readonly GrowHelpExternalReference[];
}

export interface GrowHelpRelatedResource {
  title: string;
  description: string;
  path: "/guides" | "/tools/blueprint-targets" | "/tools/vpd-calculator";
}

/**
 * Human-readable research ledger for the Toolkit. These pages are references,
 * never runtime dependencies; method text records why each link is present.
 */
export const GROW_HELP_REFERENCE_GROUPS: readonly GrowHelpReferenceGroup[] = [
  {
    title: "Nutrient references",
    sources: [
      {
        label: "Hydrobuilder nutrient mixing and dilution calculator",
        url: "https://hydrobuilder.com/pages/nutrient-mixing-dilution-calculator",
        method: "EC-target, label-rate, dilution, and stage-reference capability benchmark.",
      },
      {
        label: "Gera Tools hydroponic nutrient solution calculator",
        url: "https://geratools.com/hydroponics-nutrient-solution-calculator",
        method: "Working-volume dose scaling and EC-to-PPM conversion cross-check.",
      },
      {
        label: "MistCulture hydroponic nutrient calculator",
        url: "https://mistculture.com/tools-and-resources/hydroponic-nutrient-calculator/",
        method: "Meter-scale and optional elemental-target capability reference.",
      },
      {
        label: "SpeedCalcs hydroponic nutrient PPM calculator",
        url: "https://www.speedcalcs.com/p/hydroponic-nutrient-ppm-calculator.html",
        method: "PPM-scale selection and strength-calibration capability reference.",
      },
      {
        label: "HydroGreenSpace hydroponic nutrient calculator",
        url: "https://www.hydrogreenspace.com/hydroponic-nutrient-calculator/",
        method: "Mix-order, part-ratio, EC override, and dual-PPM capability benchmark.",
      },
      {
        label: "Jacks Nutrients fertilizer calculators",
        url: "https://www.jacksnutrients.com/fertilizer-calculators",
        method: "Manufacturer reference for dry-salt and stock-concentrate calculator patterns.",
      },
      {
        label: "Jacks Nutrients 3-2-1 mixing guide",
        url: "https://www.jacksnutrients.com/post/how-do-i-mix-jack-s-321",
        method: "Source for the optional documented 3-2-1-style preset and sequence.",
        note: "Cited only for the documented 3.6 g / 1.1 g / 2.4 g per gallon preset and mix order.",
      },
    ],
  },
  {
    title: "Light references",
    sources: [
      {
        label: "Hydrobuilder grow-light coverage and PPFD calculator",
        url: "https://hydrobuilder.com/pages/grow-light-coverage-ppfd-calculator",
        method: "Canopy-area, fixture-PPF, efficiency, and fixture-count capability benchmark.",
      },
      {
        label: "LumenCalculator hanging-height and PPFD calculator (original reference)",
        url: "https://lumencalculator.com/grow-light-hanging-height-ppfd-calculator/",
        method: "Original inverse-square and manufacturer-chart capability reference.",
        note: "This original page was unavailable during the 2026 source review.",
      },
      {
        label: "LumenCalculator grow-light coverage calculator (available replacement page)",
        url: "https://lumencalculator.com/grow-light-coverage-calculator/",
        method:
          "Available coverage-planning reference retained alongside the unavailable original.",
      },
      {
        label: "Grow With Hydroponics grow-light calculator",
        url: "https://growwithhydroponics.com/grow-light-calculator/",
        method: "Five-point uniformity, reflectivity, and energy-per-mole capability benchmark.",
      },
      {
        label: "MistCulture grow-light PPFD and DLI calculator",
        url: "https://mistculture.com/tools-and-resources/grow-light-ppfd-dli-calculator/",
        method: "PPF-per-area planning average and DLI reference-band benchmark.",
      },
    ],
  },
  {
    title: "Expense references",
    sources: [
      {
        label: "Hydrobuilder grow-room electricity calculator",
        url: "https://hydrobuilder.com/pages/grow-room-electricity-calculator",
        method: "Actual-draw electricity-cost and cycle-duration capability benchmark.",
      },
      {
        label: "HydroGreenSpace hydroponic electricity cost calculator",
        url: "https://www.hydrogreenspace.com/hydroponic-electricity-cost-calculator/",
        method: "Device-level kWh and electricity-cost capability cross-check.",
      },
      {
        label: "Grow Weed Easy electricity cost calculator",
        url: "https://www.growweedeasy.com/electricity-cost-calculator-for-growing-cannabis",
        method: "Grow-cycle electricity line-item capability reference.",
      },
      {
        label: "Hydro Oasis calculator suite",
        url: "https://www.hydrooasis.com.au/pages/calculators",
        method: "Nutrient, water, electricity, and harvest-cost suite benchmark.",
        note: "Its reviewed page did not expose an ROI calculator, so no ROI behavior is attributed to it.",
      },
      {
        label: "CannaCalc cost-per-gram calculator",
        url: "https://www.cannacalc.app/tools/cost-per-gram",
        method: "Setup-versus-operating cost and amortization capability benchmark.",
      },
      {
        label: "MistCulture hydroponic cost calculator",
        url: "https://mistculture.com/tools-and-resources/hydroponic-cost-calculator/",
        method: "Startup, recurring-cost, comparison, and payback capability benchmark.",
      },
    ],
  },
] as const;

export const GROW_HELP_RELATED_RESOURCES: readonly GrowHelpRelatedResource[] = [
  {
    title: "Manual VPD calculator",
    description: "Check air or leaf-to-air VPD separately from this feed, light, and cost plan.",
    path: "/tools/vpd-calculator",
  },
  {
    title: "Grow stage target bands",
    description: "Compare temperature, humidity, EC, pH, PPFD, and DLI starting references.",
    path: "/tools/blueprint-targets",
  },
  {
    title: "Grow guides",
    description: "Read evidence-aware guides before turning a planning estimate into a change.",
    path: "/guides",
  },
] as const;
