/**
 * cannabisPlantCareFaq — shared plant-care FAQ used by the public
 * cannabis-plant-care guide, the /guides/cannabis-nutrient-schedule guide, and
 * the Customer Mode cannabis care FAQ page.
 *
 * Pure content. No business logic, no side effects, no private data.
 *
 * ORDER IS PART OF THE CONTRACT: entries are referenced positionally elsewhere
 * (a diary FAQ deep-link targets index 2, "yellowing leaves"). New questions are
 * appended via CANNABIS_NUTRIENT_FAQ — never inserted or reordered.
 *
 * Cultivation guidance rules:
 *   - Horticultural best practices, no brand-specific schedules or bro-science.
 *   - "Cultivar" terminology, not "strain".
 *   - Stage-aware ranges framed as rough targets, not universal rules.
 *   - Read the plant and your own record; never chase a single universal number.
 */

export interface CannabisPlantCareFaqEntry {
  readonly question: string;
  readonly answer: string;
}

/**
 * Nutrient-specific questions, shared by the plant-care FAQ and the nutrient
 * schedule guide so visible copy and FAQPage JSON-LD cannot drift apart.
 *
 * Deliberately schedule-neutral: these answer what to look at and how to read
 * your own feed-vs-runoff evidence, not which bottle to buy or a week-by-week
 * chart. Brand-named guides exist separately and cover logging, not dosing.
 */
export const CANNABIS_NUTRIENT_FAQ: ReadonlyArray<CannabisPlantCareFaqEntry> = [
  {
    question: "How often should I feed cannabis nutrients?",
    answer:
      "Frequency follows the medium and the plant, not a fixed day count. Soil holds a charge, so many growers alternate feed and plain water. Coco and hydro are inert and are usually fed every watering at a lower strength. What matters more than the interval is consistency plus a record: log strength and date every time, and the pattern that actually works for your room becomes visible. Skip or dilute a feed when a plant is stressed, newly transplanted, or already showing burn.",
  },
  {
    question: "What nutrients do cannabis plants need at each stage?",
    answer:
      "Seedlings need very little — usually just a lightly buffered medium and water. Vegetative growth leans on nitrogen for leaves and stems, with steady calcium and magnesium. Flowering shifts toward phosphorus and potassium while nitrogen tapers. Late flower needs less of everything as the plant finishes. These are directional shifts, not a schedule: cultivar, medium, light intensity, and temperature all move the target, so read the plant alongside the stage.",
  },
  {
    question: "What EC or PPM should I feed, and how do I read runoff?",
    answer:
      "There is no universal ideal number. EC is more useful as a trend than a target: compare what you feed against what comes out. Runoff meaningfully higher than the feed suggests salts are accumulating and the plant is taking up less than you are giving — ease off or water plain. Runoff meaningfully lower suggests heavier uptake and room to feed. Measure the same way every time, because a number is only comparable to your own history. PPM scales differ (500 vs 700), so record which one your meter uses.",
  },
  {
    question: "How do I fix nutrient burn or a nutrient lockout?",
    answer:
      "Nutrient burn usually shows first as crisping or browning leaf tips, often after a strength increase. Stop feeding at that strength, water plain until runoff EC settles, and let new growth tell you whether it worked — scorched tissue does not heal. Lockout is different: the nutrient is present but unavailable, commonly because pH drifted outside roughly 6.0–6.8 in soil or 5.5–6.5 in soilless or hydro. Check pH and runoff EC before adding anything, since feeding more into a lockout makes it worse. Change one variable at a time so you can tell what actually helped.",
  },
];

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
  // Appended — see the order contract in the file docstring.
  ...CANNABIS_NUTRIENT_FAQ,
];
