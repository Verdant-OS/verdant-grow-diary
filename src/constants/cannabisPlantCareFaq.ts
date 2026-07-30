/**
 * cannabisPlantCareFaq — shared FAQ used by the public cannabis-plant-care
 * guide, the focused grow-light guide, and the Customer Mode cannabis care
 * FAQ page.
 *
 * Pure content. No business logic, no side effects, no private data.
 *
 * Cultivation guidance rules:
 *   - Horticultural best practices, no brand-specific schedules or bro-science.
 *   - "Cultivar" terminology, not "strain".
 *   - Stage-aware ranges framed as rough targets, not universal rules.
 */

export interface CannabisPlantCareFaqEntry {
  readonly question: string;
  readonly answer: string;
}

export const CANNABIS_LIGHTING_GUIDE_SLUG = "cannabis-grow-light-distance-and-schedule";
export const CANNABIS_LIGHTING_GUIDE_PATH = `/guides/${CANNABIS_LIGHTING_GUIDE_SLUG}` as const;

const CANNABIS_PLANT_CARE_CORE_FAQ: ReadonlyArray<CannabisPlantCareFaqEntry> = [
  {
    question: "How often should I water a cannabis plant?",
    answer:
      "It depends on the medium, pot size, stage, temperature, and humidity. In soil, let the top inch dry and the pot lighten before watering again. Coco and hydro follow a wetter rhythm, but the root zone still needs oxygen. Overwatering is more common than underwatering. A quick log of when and how much you water makes the pattern visible.",
  },
  {
    question: "What nutrients should I give my cannabis plant?",
    answer:
      "Vegetative plants need more nitrogen; flowering plants need more phosphorus and potassium. Start conservatively, measure EC or PPM, and adjust by plant response. pH is usually more important than the brand: soil near 6.0–6.8, soilless or hydro near 5.5–6.5. Never feed aggressively on a weak or stressed plant.",
  },
  {
    question: "Why are my cannabis leaves turning yellow?",
    answer:
      "Yellowing can be natural lower-leaf fade late in flower, or it can signal pH lockout, nitrogen deficiency, overwatering, light or heat stress, root problems, or pests. One symptom has many causes. Check the medium, runoff, recent changes, environment, and pest pressure before treating.",
  },
  {
    question: "What temperature and humidity should a cannabis grow room have?",
    answer:
      "Rough targets: seedling 70–80°F / 65–75% RH; veg 75–85°F / 50–65% RH; flower 68–78°F / 45–55% RH. Read these alongside VPD and the cultivar's preferences. Stability matters more than chasing a single number.",
  },
  {
    question: "How do I know when to harvest cannabis?",
    answer:
      "Use trichome color and pistil maturity, not the calendar alone. Clear trichomes are early; milky trichomes are peak for most cultivars; amber trichomes indicate more ripeness and sedation. A jeweler's loupe or handheld microscope is enough.",
  },
];

export const CANNABIS_LIGHTING_FAQ: ReadonlyArray<CannabisPlantCareFaqEntry> = [
  {
    question: "How far should an LED grow light be from cannabis plants?",
    answer:
      "There is no universal hanging distance. Fixture power, optics, dimmer setting, canopy shape, and growth stage all change the intensity at the leaves. Start with the manufacturer's measured canopy map, then verify PPFD at the canopy center and edges when a real meter is available. Log the fixture, dimmer setting, distance from the canopy, and any change time so plant response has context.",
  },
  {
    question: "What are PPFD and DLI, and which one should I log?",
    answer:
      "PPFD is the light intensity reaching a surface at one moment. DLI is the total photosynthetic light delivered over the full light period. For a stable indoor light, DLI equals average PPFD multiplied by light-hours and 3,600, divided by 1,000,000. Log PPFD at canopy height, the measurement location and source, and the light schedule; that is enough to calculate or verify DLI without pretending wattage or dimmer percentage is a light measurement.",
  },
  {
    question: "What light schedule should I use for autoflower cannabis?",
    answer:
      "Autoflower cultivars are photoperiod-insensitive, so they do not need a 12/12 flip to begin flowering. Many indoor growers use a stable 18/6 or 20/4 schedule, but neither is a universal winner. Choose a repeatable schedule that keeps DLI, canopy temperature, and power load in a safe range for the plant and room. Photoperiod-sensitive cultivars commonly use 18/6 for vegetative growth and 12/12 as a conservative flowering baseline.",
  },
  {
    question: "How can I tell light burn, bleaching, and heat stress apart?",
    answer:
      "Treat them as hypotheses, not a diagnosis from one leaf. Light-intensity stress is usually strongest at the top or directly under the fixture and may follow a height, dimmer, or schedule change. Bleaching describes pale or white tissue where chlorophyll has been damaged; it is an observation, not proof of one cause. Heat stress is better supported by high canopy or leaf temperature, dry-air or VPD changes, and broader curling or droop. Compare top and mid-canopy photos, canopy temperature and RH, PPFD, fixture distance, schedule, and recent feed or EC changes before adjusting anything.",
  },
];

export const CANNABIS_PLANT_CARE_FAQ: ReadonlyArray<CannabisPlantCareFaqEntry> = [
  ...CANNABIS_PLANT_CARE_CORE_FAQ,
  ...CANNABIS_LIGHTING_FAQ,
];
