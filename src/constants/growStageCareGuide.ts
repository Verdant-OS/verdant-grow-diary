/**
 * growStageCareGuide — structured care checklist data for the searchable
 * grow-stage guide page.
 *
 * Pure content constants. No business logic, no side effects, no Supabase,
 * no AI calls, no device-control promises.
 *
 * Cultivation guidance rules followed:
 *   - Environmental stability first, root-zone second, nutrients third.
 *   - No bro-science, no miracle fixes, no brand-specific schedules.
 *   - "Cultivar" terminology, not "strain".
 *   - Stage-aware ranges framed as rough targets, not universal rules.
 */

export type GrowStage = "seedling" | "veg" | "flower";
export type CareCategory = "watering" | "nutrients" | "environment" | "harvest";

export interface CareChecklistItem {
  readonly id: string;
  readonly stage: GrowStage;
  readonly category: CareCategory;
  readonly label: string;
  readonly detail: string;
}

export const GROW_STAGE_LABELS: Record<GrowStage, string> = {
  seedling: "Seedling",
  veg: "Vegetative",
  flower: "Flower",
};

export const CARE_CATEGORY_LABELS: Record<CareCategory, string> = {
  watering: "Watering",
  nutrients: "Nutrients",
  environment: "Environment",
  harvest: "Harvest",
};

export const CARE_CATEGORY_ORDER: ReadonlyArray<CareCategory> = [
  "watering",
  "nutrients",
  "environment",
  "harvest",
];

export const GROW_STAGE_CARE_CHECKLIST: ReadonlyArray<CareChecklistItem> = [
  /* ------------------------------------------------------------------ */
  /* Seedling                                                           */
  /* ------------------------------------------------------------------ */
  {
    id: "seedling-watering-1",
    stage: "seedling",
    category: "watering",
    label: "Keep the medium moist, not soaked",
    detail:
      "Seedlings have tiny root systems. Use small, frequent waterings or a light mist rather than a heavy drench. The goal is even moisture with oxygen in the root zone.",
  },
  {
    id: "seedling-watering-2",
    stage: "seedling",
    category: "watering",
    label: "Water at the base, not over the leaves",
    detail:
      "Aim water near the stem so it reaches the roots. Wet foliage under intense light can cause stress or invite problems.",
  },
  {
    id: "seedling-nutrients-1",
    stage: "seedling",
    category: "nutrients",
    label: "Start nutrients gently after the first true leaves",
    detail:
      "Most seedlings do not need immediate feeding. When true leaves appear, begin at roughly 1/4 to 1/2 strength and increase only if the plant responds well.",
  },
  {
    id: "seedling-environment-1",
    stage: "seedling",
    category: "environment",
    label: "Keep temperature and humidity gentle",
    detail:
      "Rough targets: 70–80°F / 65–75% RH. Young plants prefer stable, humid air while roots establish. Avoid hot, dry air or strong direct airflow.",
  },
  {
    id: "seedling-environment-2",
    stage: "seedling",
    category: "environment",
    label: "Use low to moderate light intensity",
    detail:
      "Too much light early on can stunt or bleach seedlings. Increase intensity gradually as the plant develops. Watch for stretching as a sign the light is too weak.",
  },

  /* ------------------------------------------------------------------ */
  /* Vegetative                                                         */
  /* ------------------------------------------------------------------ */
  {
    id: "veg-watering-1",
    stage: "veg",
    category: "watering",
    label: "Water when the top inch dries",
    detail:
      "In soil, let the top inch dry before watering again. Coco and soilless stay wetter; hydro follows its own rhythm. The root zone needs wet-dry cycles to breathe.",
  },
  {
    id: "veg-watering-2",
    stage: "veg",
    category: "watering",
    label: "Learn the pot's dry weight",
    detail:
      "Lifting the container is a fast, reliable way to judge moisture. Combine it with a finger-check rather than relying on a fixed schedule.",
  },
  {
    id: "veg-nutrients-1",
    stage: "veg",
    category: "nutrients",
    label: "Emphasize nitrogen, but feed by response",
    detail:
      "Vegetative plants need more nitrogen than flowering plants, but the right strength depends on medium, cultivar, and environment. Start conservative and increase by EC/PPM and plant response.",
  },
  {
    id: "veg-nutrients-2",
    stage: "veg",
    category: "nutrients",
    label: "Check pH in and out",
    detail:
      "pH matters more than the nutrient brand. Soil: roughly 6.0–6.8. Soilless or hydro: roughly 5.5–6.5. If runoff pH drifts, fix that before adding more nutrients.",
  },
  {
    id: "veg-environment-1",
    stage: "veg",
    category: "environment",
    label: "Keep the room stable and moderately humid",
    detail:
      "Rough targets: 75–85°F / 50–65% RH. Read temperature and humidity alongside VPD and leaf temperature so the plant is seen in context, not as a single number.",
  },
  {
    id: "veg-environment-2",
    stage: "veg",
    category: "environment",
    label: "Train with low-stress techniques",
    detail:
      "LST and gentle defoliation help shape the canopy. Avoid aggressive topping, high-stress recovery, or heavy defoliation on weak or slow plants.",
  },

  /* ------------------------------------------------------------------ */
  /* Flower                                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "flower-watering-1",
    stage: "flower",
    category: "watering",
    label: "Reduce water volume as buds mature",
    detail:
      "Late-flower plants drink differently than mid-veg plants. Avoid heavy waterings that leave the canopy wet or the root zone soggy for long periods.",
  },
  {
    id: "flower-watering-2",
    stage: "flower",
    category: "watering",
    label: "Watch runoff EC and pH",
    detail:
      "Runoff readings reveal salt buildup and pH drift. If EC climbs or pH drifts, adjust inputs before the plant locks out nutrients.",
  },
  {
    id: "flower-nutrients-1",
    stage: "flower",
    category: "nutrients",
    label: "Shift toward phosphorus and potassium",
    detail:
      "Flowering plants need more P and K relative to nitrogen. Taper nitrogen through mid-to-late flower, but do not starve the plant if it is still building green tissue.",
  },
  {
    id: "flower-nutrients-2",
    stage: "flower",
    category: "nutrients",
    label: "Flush only if runoff or leaf evidence says so",
    detail:
      "A flush is not automatic. Base it on runoff EC, leaf tip burn, or visible salt stress. Avoid aggressive late-stage flushing that weakens the plant before harvest.",
  },
  {
    id: "flower-environment-1",
    stage: "flower",
    category: "environment",
    label: "Lower humidity and keep air moving",
    detail:
      "Rough targets: 68–78°F / 45–55% RH. In late flower, lower humidity and good airflow help reduce bud rot and mold risk. Avoid big temperature or humidity swings.",
  },
  {
    id: "flower-environment-2",
    stage: "flower",
    category: "environment",
    label: "Inspect for pests and environmental stress",
    detail:
      "Dense flowers attract issues if airflow is poor. Check leaves, stems, and buds regularly. Stable environment is the first defense.",
  },
  {
    id: "flower-harvest-1",
    stage: "flower",
    category: "harvest",
    label: "Time harvest by trichome color and pistil maturity",
    detail:
      "Clear trichomes are early. Milky trichomes are peak ripeness for most cultivars. Amber trichomes indicate more ripeness and often a heavier effect. Use a jeweler's loupe or handheld microscope.",
  },
  {
    id: "flower-harvest-2",
    stage: "flower",
    category: "harvest",
    label: "Prepare a stable dry space before cutting",
    detail:
      "Aim for roughly 60°F / 60% RH in a dark, ventilated drying space. Big humidity or temperature swings during drying can ruin months of careful work.",
  },
];

/** FAQ entries surfaced on the grow-stage care guide page. */
export const GROW_STAGE_CARE_FAQ: ReadonlyArray<{
  readonly question: string;
  readonly answer: string;
}> = [
  {
    question: "Can I use the same checklist for every cultivar?",
    answer:
      "The checklist covers general principles, but each cultivar and medium responds differently. Use the checklist as a starting point, then adjust by what the plant shows you.",
  },
  {
    question: "Why is the checklist grouped by stage instead of by week?",
    answer:
      "Weeks on seed packs are estimates. Stage-based checklists focus on what the plant actually needs: root development in seedling, canopy and structure in veg, and ripening and harvest timing in flower.",
  },
  {
    question: "Should I check every item every day?",
    answer:
      "No. Watering and environment checks happen daily; nutrient and harvest checks happen when you feed or when the plant is near maturity. The checklist is a reference, not a daily chore list.",
  },
];
