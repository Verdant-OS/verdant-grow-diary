/**
 * verdantCultivars — evergreen cultivator-focused profiles for /cultivars.
 *
 * Pure data. No product claims about live grow diaries, no fake sensor data,
 * no "AI picks winners" phrasing. Content is horticultural best-practice
 * guidance for home growers researching specific cultivars, cross-linking
 * into Verdant's existing Pheno Hunt / Guides surfaces.
 *
 * Vocabulary note: pages canonically use "cultivar" per project doctrine;
 * "strain" appears only as a search-intent alias inside SEO title/meta and
 * as a legacy URL alias (/strains → /cultivars).
 */

export interface VerdantCultivarProfile {
  /** URL slug under /cultivars/:slug. Lowercase, hyphenated. */
  slug: string;
  /** Common cultivar name (display). */
  name: string;
  /** Common alias growers search for (e.g. "Oreoz strain"). */
  searchAlias: string;
  /** One-line lineage summary — commonly reported, not a breeder claim. */
  lineage: string;
  /** Typical flower window in weeks (commonly reported range). */
  flowerWeeks: string;
  /** Difficulty for a home grower: beginner-friendly / intermediate / advanced. */
  difficulty: "Beginner-friendly" | "Intermediate" | "Advanced";
  /** Short intro paragraph (SEO body). */
  intro: string;
  /** Environment guidance keyed by stage — plain best-practice ranges. */
  environment: {
    seedling: string;
    veg: string;
    flower: string;
  };
  /** Common issues growers report and cautious mitigations. */
  commonIssues: Array<{ issue: string; mitigation: string }>;
  /** Pheno-hunt evidence points that matter for this cultivar. */
  phenoHuntFocus: string[];
  /**
   * Illustrative sample phenos for the public /cultivars page comparison
   * module. NEVER real grower data. Presented alongside an explicit
   * "Sample data" label in the UI; used purely to show what a Pheno Hunt
   * side-by-side looks like inside Verdant.
   */
  samplePhenos: ReadonlyArray<{
    label: string;
    structure: string;
    aroma: string;
    resin: string;
    yieldNote: string;
    finishNote: string;
  }>;
}

export const VERDANT_CULTIVARS: readonly VerdantCultivarProfile[] = [
  {
    slug: "oreoz",
    name: "Oreoz",
    searchAlias: "Oreoz strain",
    lineage: "Cookies & Cream × Secret Weapon",
    flowerWeeks: "9–10 weeks",
    difficulty: "Intermediate",
    intro:
      "Oreoz is an indica-dominant cultivar known for dense, resin-heavy flower and a gassy, sweet-cookie profile. Home growers typically report a compact structure with heavy apical dominance, so canopy management and airflow matter more than aggressive feeding.",
    environment: {
      seedling: "75–80°F, 65–70% RH, gentle light (~200 PPFD), stable VPD around 0.8 kPa.",
      veg: "74–80°F day / 68–72°F night, 55–65% RH, 400–600 PPFD, VPD 0.9–1.2 kPa.",
      flower:
        "72–78°F day / 65–70°F night, 45–55% RH tapering to 40–45% in late flower, 700–900 PPFD, VPD 1.2–1.5 kPa. Bud density makes late-flower humidity control a bud-rot risk — keep airflow through the canopy.",
    },
    commonIssues: [
      {
        issue: "Late-flower bud rot on dense colas.",
        mitigation:
          "Defoliate conservatively at week 3 of flower for airflow; keep RH under 50% from week 5 onward; do not spray canopy after lights-out.",
      },
      {
        issue: "Nutrient sensitivity — tip-burn on aggressive feeding.",
        mitigation:
          "Start feed at ~70% of the nutrient line's recommendation and increase only if the plant shows clear signs of hunger (pale, lower-leaf fade).",
      },
      {
        issue: "Short internodes crowd the canopy.",
        mitigation:
          "Low-stress training in early veg is usually enough. Heavy defoliation late is not required and can slow finishing.",
      },
    ],
    phenoHuntFocus: [
      "Resin coverage on sugar leaves and calyx",
      "Terpene profile: gas vs sweet cookie",
      "Bud density and stem strength under weight",
      "Finish uniformity across colas",
    ],
  },
  {
    slug: "do-si-dos",
    name: "Do-Si-Dos",
    searchAlias: "Do-Si-Dos strain",
    lineage: "OGKB (Girl Scout Cookies phenotype) × Face Off OG",
    flowerWeeks: "8–10 weeks",
    difficulty: "Intermediate",
    intro:
      "Do-Si-Dos is a widely grown indica-leaning cultivar with a sweet, earthy, slightly floral profile and heavy trichome production. It responds well to steady VPD and moderate feeding; excessive nitrogen in late veg tends to delay flower and soften structure.",
    environment: {
      seedling: "75–80°F, 65–70% RH, ~200 PPFD, VPD ~0.8 kPa.",
      veg: "74–80°F day / 68–72°F night, 55–65% RH, 400–600 PPFD, VPD 0.9–1.2 kPa.",
      flower:
        "72–78°F day / 65–70°F night, 45–55% RH tapering below 50% by week 5, 700–900 PPFD, VPD 1.2–1.5 kPa.",
    },
    commonIssues: [
      {
        issue: "Slow, uneven stretch in early flower.",
        mitigation:
          "Maintain consistent day/night temperature deltas (6–10°F). Avoid nutrient increases during the stretch; hold feed steady until stretch settles.",
      },
      {
        issue: "Calcium/magnesium deficiency signs (interveinal yellowing).",
        mitigation:
          "Verify runoff EC and pH before dosing; supplement Cal-Mag only when a deficiency is confirmed, not preventively at high doses.",
      },
      {
        issue: "Sensitivity to root-zone overwatering.",
        mitigation:
          "Water to ~10–20% runoff, then wait for the medium to lighten noticeably before the next watering. Log ml in and ml out.",
      },
    ],
    phenoHuntFocus: [
      "Trichome density and head clarity at chop",
      "Sweet/earthy vs floral terpene lean",
      "Stretch ratio (final height ÷ flip height)",
      "Nose retention through cure",
    ],
  },
  {
    slug: "blue-cookies",
    name: "Blue Cookies",
    searchAlias: "Blue Cookies strain",
    lineage: "Girl Scout Cookies × Blueberry",
    flowerWeeks: "8–9 weeks",
    difficulty: "Beginner-friendly",
    intro:
      "Blue Cookies is a balanced hybrid combining Cookies structure with Blueberry's sweet, fruity nose. It is a forgiving cultivar for newer growers when environment stays stable, and it colors up under cooler night temperatures late in flower.",
    environment: {
      seedling: "75–80°F, 65–70% RH, ~200 PPFD, VPD ~0.8 kPa.",
      veg: "74–80°F day / 68–72°F night, 55–65% RH, 400–600 PPFD, VPD 0.9–1.2 kPa.",
      flower:
        "70–76°F day / 60–66°F night in the last 2 weeks to encourage color, 45–55% RH, 700–850 PPFD, VPD 1.2–1.5 kPa.",
    },
    commonIssues: [
      {
        issue: "Uneven color expression run-to-run.",
        mitigation:
          "Color depends on genetics and night temperatures; cool nights in late flower help but are not a guarantee. Do not chase color with stress techniques.",
      },
      {
        issue: "Powdery mildew in high-RH tents.",
        mitigation:
          "Keep RH under 55% through flower, run canopy airflow, and inspect lower canopy weekly. Do not spray blooming flower.",
      },
    ],
    phenoHuntFocus: [
      "Color depth in late flower under matched night temps",
      "Fruit vs cookie terpene balance",
      "Yield vs bud-density trade-off between phenos",
    ],
  },
] as const;

export const VERDANT_CULTIVAR_SLUGS = VERDANT_CULTIVARS.map((c) => c.slug);

export function findCultivarBySlug(slug: string | undefined): VerdantCultivarProfile | undefined {
  if (!slug) return undefined;
  return VERDANT_CULTIVARS.find((c) => c.slug === slug);
}
