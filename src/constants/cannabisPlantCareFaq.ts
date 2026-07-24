/**
 * cannabisPlantCareFaq — shared 5-question FAQ used by the public
 * cannabis-plant-care guide and the Customer Mode cannabis care FAQ page.
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

export const CANNABIS_PLANT_CARE_FAQ: ReadonlyArray<CannabisPlantCareFaqEntry> = [
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
