/**
 * Cultivar detail SEO helpers — editorial FAQ + breadcrumb source of truth.
 *
 * Doctrine constraints (locked positioning): these are sample/reference
 * cultivars, not products. Nothing here may assert fixed chemistry, guaranteed
 * outcomes, effects, or a genotype. Every answer is framed as reported/variable
 * context, and one answer explicitly reasserts that the grower's own plant data
 * stays authoritative. The visible FAQ rendered from these items is the single
 * source of truth for the FAQPage JSON-LD (no schema-only claims).
 */
import type { VerdantCultivarProfile } from "../constants/verdantCultivars";

export interface CultivarFaqItem {
  question: string;
  answer: string;
}

export interface CultivarBreadcrumbItem {
  name: string;
  url: string;
}

function difficultyPhrase(difficulty: VerdantCultivarProfile["difficulty"]): string {
  switch (difficulty) {
    case "Beginner-friendly":
      return "beginner-friendly";
    case "Intermediate":
      return "intermediate";
    case "Advanced":
      return "advanced";
    default:
      return "variable in difficulty";
  }
}

/**
 * Build the editorial, variability-framed FAQ for a cultivar detail page.
 * Deterministic and pure. Only uses reported fields; never invents chemistry,
 * effects, or precision the profile does not carry.
 */
export function buildCultivarFaqItems(
  cultivar: VerdantCultivarProfile,
): CultivarFaqItem[] {
  const items: CultivarFaqItem[] = [];

  items.push({
    question: `How long does ${cultivar.name} take to flower?`,
    answer: `${cultivar.flowerWeeks}. Treat this as a reported range, not a fixed schedule — the real finish depends on the phenotype, your environment, and trichome/maturity checks rather than a calendar.`,
  });

  items.push({
    question: `What is ${cultivar.name}'s reported lineage?`,
    answer: `${cultivar.lineage}. Lineage for widely circulated names is often reported or disputed rather than verified, so Verdant keeps it as sourced context, never a genotype guarantee.`,
  });

  if (cultivar.breeder && cultivar.breeder.trim().length > 0) {
    items.push({
      question: `Who is the reported breeder or source of ${cultivar.name}?`,
      answer: `${cultivar.breeder}, per the sources on this page. A named source does not make every seed or cut identical — confirm provenance for your specific plant.`,
    });
  }

  items.push({
    question: `Is ${cultivar.name} suitable for beginners?`,
    answer: `Public reports describe it as ${difficultyPhrase(cultivar.difficulty)} to grow, and it is commonly run as ${
      cultivar.lifeCycle === "autoflower" ? "an autoflower" : "a photoperiod plant"
    }. Difficulty varies with your setup and experience, so use this as a rough prior, not a promise.`,
  });

  items.push({
    question: `Will this ${cultivar.name} profile predict how my plant turns out?`,
    answer: `No. It is a starting hypothesis drawn from public sources. Your plant's own logs, stage, medium, source-labeled sensors, and observed response stay authoritative — a reference page never creates an alert, a nutrient or irrigation action, or any guaranteed result.`,
  });

  return items;
}

/**
 * Breadcrumb trail for a cultivar detail page. Absolute URLs required by the
 * BreadcrumbList JSON-LD builder.
 */
export function buildCultivarBreadcrumbItems(
  cultivar: VerdantCultivarProfile,
  siteOrigin: string,
): CultivarBreadcrumbItem[] {
  const origin = siteOrigin.replace(/\/$/, "");
  return [
    { name: "Home", url: `${origin}/welcome` },
    { name: "Strain Reference Library", url: `${origin}/cultivars` },
    { name: cultivar.name, url: `${origin}/cultivars/${cultivar.slug}` },
  ];
}

/**
 * Safe fallback FAQ used when the requested cultivar profile is missing or
 * partially populated. Keeps the page compliant (non-empty FAQPage JSON-LD)
 * without inventing chemistry, lineage, or breeder claims for an unknown strain.
 */
export function buildCultivarFaqItemsSafe(
  cultivar: VerdantCultivarProfile | null | undefined,
): CultivarFaqItem[] {
  if (!cultivar || !cultivar.name || !cultivar.name.trim()) {
    return [
      {
        question: "Is this cultivar profile available?",
        answer:
          "This cultivar reference is not currently available. Verdant only publishes reported context for cultivars in its strain reference library — your own plant logs, stage, medium, and source-labeled sensors remain authoritative.",
      },
      {
        question: "Will a missing reference page affect my grow?",
        answer:
          "No. Reference pages never create alerts, nutrient or irrigation actions, or guaranteed outcomes. Use your grow's diary and sensor snapshots as the source of truth.",
      },
    ];
  }
  return buildCultivarFaqItems(cultivar);
}

/**
 * Safe fallback breadcrumbs when the cultivar profile is missing. Always
 * returns at least Home + Library so the BreadcrumbList JSON-LD stays valid.
 */
export function buildCultivarBreadcrumbItemsSafe(
  cultivar: VerdantCultivarProfile | null | undefined,
  siteOrigin: string,
): CultivarBreadcrumbItem[] {
  const origin = siteOrigin.replace(/\/$/, "");
  const base: CultivarBreadcrumbItem[] = [
    { name: "Home", url: `${origin}/welcome` },
    { name: "Strain Reference Library", url: `${origin}/cultivars` },
  ];
  if (cultivar && cultivar.name?.trim() && cultivar.slug?.trim()) {
    base.push({ name: cultivar.name, url: `${origin}/cultivars/${cultivar.slug}` });
  }
  return base;
}
