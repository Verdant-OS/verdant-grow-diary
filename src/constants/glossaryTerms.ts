/**
 * Cannabis glossary — original, concise educational definitions for breeding,
 * cultivation, and phenotype terminology. Reference content only: not medical,
 * legal, or cultivation instructions.
 *
 * Terms are deduplicated and grouped into review-friendly categories. Where
 * the term is "strain," the definition explicitly prefers "cultivar" in this
 * context. No AI, no Action Queue, no automation, no device control, no
 * sensor ingest — this file is pure data.
 */

export type GlossaryCategory =
  | "Breeding"
  | "Genetics"
  | "Tissue Culture"
  | "Cultivation"
  | "Plant Anatomy"
  | "Extraction"
  | "Aroma / Chemistry";

export interface GlossaryTerm {
  readonly term: string;
  readonly category: GlossaryCategory;
  readonly definition: string;
  readonly seeAlso?: readonly string[];
}

const RAW: readonly GlossaryTerm[] = [
  {
    term: "Aseptic Culture",
    category: "Tissue Culture",
    definition:
      "Growing plant tissue in a sterile, contamination-free environment so it develops without competing microbes.",
    seeAlso: ["Aseptic Technique", "Sterilization", "Subculture"],
  },
  {
    term: "Aseptic Technique",
    category: "Tissue Culture",
    definition:
      "The set of procedures — flame-sterilized tools, sanitized surfaces, clean airflow — used to keep tissue culture work free of contamination.",
    seeAlso: ["Aseptic Culture", "Autoclave", "Sterilization"],
  },
  {
    term: "Autoclave",
    category: "Tissue Culture",
    definition:
      "A pressurized steam sterilizer used to make tools, media, and containers biologically clean for lab or tissue-culture work.",
    seeAlso: ["Sterilization", "Aseptic Technique"],
  },
  {
    term: "Autoflower",
    category: "Cultivation",
    definition:
      "A cannabis plant that begins flowering after a set age rather than in response to shorter day length, thanks to ruderalis-derived genetics.",
    seeAlso: ["Ruderalis", "Vegetative Stage"],
  },
  {
    term: "Auxins",
    category: "Plant Anatomy",
    definition:
      "A group of plant hormones that regulate cell elongation, apical dominance, and root formation.",
    seeAlso: ["Topping", "Training"],
  },
  {
    term: "Backcross (BX)",
    category: "Breeding",
    definition:
      "Crossing an offspring back to one of its parents (or a genetically similar line) to reinforce a target trait from that parent.",
    seeAlso: ["Selection", "Selective Breeding"],
  },
  {
    term: "Bag Seed",
    category: "Breeding",
    definition:
      "Seeds found in cured flower of unknown parentage; genetics and stability are unverified.",
    seeAlso: ["True-to-Seed", "Variety"],
  },
  {
    term: "Base Pair",
    category: "Genetics",
    definition:
      "Two complementary DNA bases (A–T or C–G) that pair across the double helix; the basic unit used to measure DNA length.",
    seeAlso: ["Recombination", "Segregation"],
  },
  {
    term: "Biennial",
    category: "Plant Anatomy",
    definition:
      "A plant that completes its life cycle over two growing seasons — vegetative growth in year one, flowering and seed set in year two. Cannabis itself is annual; the term is used comparatively.",
  },
  {
    term: "Biosynthesis",
    category: "Aroma / Chemistry",
    definition:
      "The process by which living cells build complex molecules (like cannabinoids or terpenes) from simpler precursors through enzymatic reactions.",
    seeAlso: ["Terpenes", "Trichome"],
  },
  {
    term: "Bract",
    category: "Plant Anatomy",
    definition:
      "The small leaf-like structure that wraps a cannabis flower's calyx and hosts a high density of trichomes.",
    seeAlso: ["Trichome"],
  },
  {
    term: "Broad Leaf Drug Varieties",
    category: "Genetics",
    definition:
      "A morphological grouping (often abbreviated BLD) for wide-leaflet cannabis varieties historically associated with indica-type descriptions.",
    seeAlso: ["Variety", "Strain"],
  },
  {
    term: "Bro Science",
    category: "Cultivation",
    definition:
      "Community folklore or anecdote presented as fact. Useful as a starting point for observation, but never a substitute for controlled evidence.",
  },
  {
    term: "Bubble Hash",
    category: "Extraction",
    definition:
      "A solventless concentrate made by agitating cannabis in ice water and sieving trichome heads through mesh bags.",
    seeAlso: ["Solventless Extraction", "Washer"],
  },
  {
    term: "Progeny",
    category: "Breeding",
    definition:
      "The offspring produced by a cross; the generation being evaluated for inherited traits.",
    seeAlso: ["Selection", "Selective Breeding"],
  },
  {
    term: "Protoplast Fusion",
    category: "Tissue Culture",
    definition:
      "A lab technique that removes cell walls and merges two cells to combine genetic material outside normal sexual reproduction.",
    seeAlso: ["Aseptic Culture", "Somaclonal Variation"],
  },
  {
    term: "Purebred",
    category: "Breeding",
    definition:
      "A line that has been inbred long enough that offspring reliably express the same traits generation to generation.",
    seeAlso: ["Selfing", "S1", "True-to-Seed"],
  },
  {
    term: "P-Value",
    category: "Genetics",
    definition:
      "A statistical estimate of how likely an observed result could occur by chance alone; smaller values suggest the effect is less likely random.",
    seeAlso: ["Quantitative Genetics"],
  },
  {
    term: "Qualitative Genetics",
    category: "Genetics",
    definition:
      "The study of traits controlled by one or a few genes with discrete categories (present/absent, color A vs. color B).",
    seeAlso: ["Quantitative Genetics", "Traits"],
  },
  {
    term: "Quantitative Genetics",
    category: "Genetics",
    definition:
      "The study of traits shaped by many genes plus environment, producing continuous variation (yield, height, cannabinoid percentage).",
    seeAlso: ["Quantitative Trait Locus (QTL)", "P-Value"],
  },
  {
    term: "Quantitative Trait Locus (QTL)",
    category: "Genetics",
    definition:
      "A region of the genome statistically linked to variation in a quantitative trait.",
    seeAlso: ["Quantitative Genetics", "Recombination"],
  },
  {
    term: "Receiver",
    category: "Breeding",
    definition:
      "In a cross, the female plant that receives pollen and produces the seeds.",
    seeAlso: ["Reciprocal Cross", "Selfing"],
  },
  {
    term: "Reciprocal Cross",
    category: "Breeding",
    definition:
      "Running the same pair of parents both directions (A♀×B♂ and B♀×A♂) to check whether the maternal or paternal role changes offspring outcomes.",
    seeAlso: ["Receiver", "Backcross (BX)"],
  },
  {
    term: "Recombination",
    category: "Genetics",
    definition:
      "The reshuffling of parental DNA segments during meiosis that produces genetically unique gametes.",
    seeAlso: ["Segregation", "Base Pair"],
  },
  {
    term: "Respiration",
    category: "Plant Anatomy",
    definition:
      "The metabolic process that releases energy by breaking down sugars using oxygen; occurs day and night in living plant tissue.",
    seeAlso: ["Transpiration"],
  },
  {
    term: "Rodelization",
    category: "Breeding",
    definition:
      "An unreliable, stress-based method where an unpollinated female is left past ripeness in the hope it self-pollinates to produce feminized seeds. Results are inconsistent.",
    seeAlso: ["Selfing", "S1"],
  },
  {
    term: "Ruderalis",
    category: "Genetics",
    definition:
      "A cannabis subgroup adapted to short growing seasons and known for day-neutral (autoflowering) behavior.",
    seeAlso: ["Autoflower", "Sativa"],
  },
  {
    term: "S1",
    category: "Breeding",
    definition:
      "The first-generation seeds produced by selfing a single female plant; genetically similar to but not identical to the parent.",
    seeAlso: ["Selfing", "Purebred"],
  },
  {
    term: "Sativa",
    category: "Genetics",
    definition:
      "A traditional morphological label for tall, narrow-leaflet cannabis. Historic naming; modern breeders describe cultivars by chemistry and lineage rather than sativa/indica alone.",
    seeAlso: ["Broad Leaf Drug Varieties", "Variety"],
  },
  {
    term: "Scarification",
    category: "Cultivation",
    definition:
      "Deliberately nicking or abrading a seed coat to help water enter and speed germination of tough-shelled seeds.",
    seeAlso: ["Stratification", "Testa"],
  },
  {
    term: "Screen of Green (SCROG)",
    category: "Cultivation",
    definition:
      "A canopy training method where branches are woven through a horizontal screen to keep an even flowering canopy.",
    seeAlso: ["Training", "Topping"],
  },
  {
    term: "Segregation",
    category: "Genetics",
    definition:
      "The Mendelian separation of allele pairs during gamete formation, so each offspring receives one allele from each parent.",
    seeAlso: ["Recombination", "Traits"],
  },
  {
    term: "Selection",
    category: "Breeding",
    definition:
      "Choosing which plants become parents of the next generation based on measured or observed traits.",
    seeAlso: ["Selective Breeding", "Selection Pressure"],
  },
  {
    term: "Selection Pressure",
    category: "Breeding",
    definition:
      "How strict a breeder is when discarding plants; higher pressure moves a population toward the target trait faster but shrinks diversity.",
    seeAlso: ["Selection", "Single Seed Descent (SSD)"],
  },
  {
    term: "Selective Breeding",
    category: "Breeding",
    definition:
      "Repeated cycles of crossing and selection to shift a population toward chosen traits over generations.",
    seeAlso: ["Selection", "Backcross (BX)"],
  },
  {
    term: "Selfing",
    category: "Breeding",
    definition:
      "Pollinating a female with pollen produced by a chemically reversed clone of itself to produce feminized S1 seeds.",
    seeAlso: ["S1", "Rodelization"],
  },
  {
    term: "Senescence",
    category: "Plant Anatomy",
    definition:
      "The natural late-life decline of a plant or tissue — fading leaves, slowing metabolism — as the life cycle ends.",
  },
  {
    term: "Shoot Tip Culture",
    category: "Tissue Culture",
    definition:
      "A tissue-culture technique that uses the growing tip of a shoot to propagate clean, genetically identical plantlets.",
    seeAlso: ["Aseptic Culture", "Subculture"],
  },
  {
    term: "Single Seed Descent (SSD)",
    category: "Breeding",
    definition:
      "An inbreeding scheme that advances one seed per plant per generation to reach genetic uniformity efficiently.",
    seeAlso: ["Selection Pressure", "Purebred"],
  },
  {
    term: "Skatole",
    category: "Aroma / Chemistry",
    definition:
      "A nitrogen-containing aroma compound with a strong fecal or barnyard note; contributes to some ‘funk’ profiles at low concentrations.",
    seeAlso: ["Thiols", "Tropical Volatile Sulfur Compounds"],
  },
  {
    term: "Solvent-Based Extraction",
    category: "Extraction",
    definition:
      "Concentrate production that uses a chemical solvent (such as ethanol or hydrocarbons) to strip cannabinoids and terpenes from plant material.",
    seeAlso: ["Solventless Extraction"],
  },
  {
    term: "Solventless Extraction",
    category: "Extraction",
    definition:
      "Concentrate production that uses only physical or mechanical means — ice water, heat, pressure — without chemical solvents.",
    seeAlso: ["Bubble Hash", "Washer"],
  },
  {
    term: "Somaclonal Variation",
    category: "Tissue Culture",
    definition:
      "Unintended genetic or epigenetic changes that appear when plants are propagated through tissue culture over many cycles.",
    seeAlso: ["Aseptic Culture", "Subculture"],
  },
  {
    term: "Sterilization",
    category: "Tissue Culture",
    definition:
      "Reducing microbial life on tools, surfaces, or media to a level low enough for aseptic work.",
    seeAlso: ["Autoclave", "Aseptic Technique"],
  },
  {
    term: "Strain",
    category: "Genetics",
    definition:
      "A common informal label for a cannabis variety. In this glossary and in Verdant we prefer 'cultivar' — a botanically defined, stable, named variety — because 'strain' is loosely used and imprecise across the industry.",
    seeAlso: ["Variety", "Purebred"],
  },
  {
    term: "Strain Fatigue",
    category: "Cultivation",
    definition:
      "Anecdotal claim that a clone line loses vigor over time. Often reflects accumulated pathogens or stress rather than a genetic phenomenon; treat as observation, not a verified biological rule.",
    seeAlso: ["Bro Science", "Somaclonal Variation"],
  },
  {
    term: "Stratification",
    category: "Cultivation",
    definition:
      "Exposing seeds to a period of cold or moisture to break dormancy and improve germination.",
    seeAlso: ["Scarification"],
  },
  {
    term: "Subculture",
    category: "Tissue Culture",
    definition:
      "Transferring tissue-cultured plantlets to fresh medium to continue growth and avoid nutrient depletion or waste buildup.",
    seeAlso: ["Aseptic Culture", "Shoot Tip Culture"],
  },
  {
    term: "Substrate",
    category: "Cultivation",
    definition:
      "The medium the plant's roots grow in — soil, coco, rockwool, peat, or hydroponic media.",
  },
  {
    term: "Super Cropping",
    category: "Cultivation",
    definition:
      "A high-stress training technique where the inner tissue of a stem is gently crushed and bent so the branch heals stronger and lower to the canopy.",
    seeAlso: ["Training", "Topping"],
  },
  {
    term: "Synthetic Cannabis",
    category: "Aroma / Chemistry",
    definition:
      "Lab-made compounds designed to bind cannabinoid receptors. These are not cannabis and can carry serious safety risks; treated here only as terminology.",
  },
  {
    term: "Synthetic Seeds",
    category: "Tissue Culture",
    definition:
      "Encapsulated somatic embryos or shoot tips coated in a gel that mimics a seed coat, used for storage and transport of clonal material.",
    seeAlso: ["Shoot Tip Culture"],
  },
  {
    term: "Terpenes",
    category: "Aroma / Chemistry",
    definition:
      "A large family of volatile aroma compounds produced in trichomes; they shape a cultivar's smell and flavor and influence perceived character.",
    seeAlso: ["Trichome", "Biosynthesis"],
  },
  {
    term: "Testa",
    category: "Plant Anatomy",
    definition:
      "The outer protective seed coat.",
    seeAlso: ["Scarification"],
  },
  {
    term: "Thiols",
    category: "Aroma / Chemistry",
    definition:
      "Sulfur-containing compounds responsible for strong, pungent 'gassy' or tropical-fruit aromas at very low concentrations.",
    seeAlso: ["Tropical Volatile Sulfur Compounds", "Skatole"],
  },
  {
    term: "Topping",
    category: "Cultivation",
    definition:
      "Removing the apical growing tip to encourage the plant to develop multiple main colas instead of one dominant one.",
    seeAlso: ["Training", "Auxins"],
  },
  {
    term: "Totipotency",
    category: "Tissue Culture",
    definition:
      "The ability of a single plant cell to divide and regenerate a whole new plant under the right conditions.",
    seeAlso: ["Aseptic Culture", "Protoplast Fusion"],
  },
  {
    term: "Training",
    category: "Cultivation",
    definition:
      "Any physical shaping — bending, tying, topping, screening — used to steer canopy shape, light exposure, and airflow.",
    seeAlso: ["Screen of Green (SCROG)", "Super Cropping", "Topping"],
  },
  {
    term: "Traits",
    category: "Genetics",
    definition:
      "Measurable or observable characteristics — height, flowering time, aroma, yield — that breeders evaluate and select on.",
    seeAlso: ["Selection", "Qualitative Genetics"],
  },
  {
    term: "Transgenic",
    category: "Genetics",
    definition:
      "Describing an organism whose genome contains DNA moved in from an unrelated species via genetic engineering.",
  },
  {
    term: "Transpiration",
    category: "Plant Anatomy",
    definition:
      "The movement of water from roots up through the plant and out through the leaves as vapor; drives nutrient uptake and canopy cooling.",
    seeAlso: ["Vapor Pressure Deficit (VPD)", "Xylem"],
  },
  {
    term: "Transplanting",
    category: "Cultivation",
    definition:
      "Moving a plant from one container or substrate to another, usually to give roots more space.",
  },
  {
    term: "Trichome",
    category: "Plant Anatomy",
    definition:
      "The glandular, resin-producing structures on cannabis flowers and bracts that synthesize and store cannabinoids and terpenes.",
    seeAlso: ["Bract", "Terpenes"],
  },
  {
    term: "Tropical Volatile Sulfur Compounds",
    category: "Aroma / Chemistry",
    definition:
      "A subgroup of sulfur-based aroma molecules (a subset of thiols) linked to tropical-fruit or gassy notes in some cultivars.",
    seeAlso: ["Thiols", "Terpenes"],
  },
  {
    term: "True-to-Seed",
    category: "Breeding",
    definition:
      "A line whose seeds reliably produce offspring with the same key traits as the parent generation.",
    seeAlso: ["Purebred", "Variety"],
  },
  {
    term: "Vapor Pressure Deficit (VPD)",
    category: "Cultivation",
    definition:
      "The difference between how much moisture the air is holding and how much it can hold at the current temperature; a practical guide to transpiration and canopy comfort.",
    seeAlso: ["Transpiration"],
  },
  {
    term: "Variety",
    category: "Genetics",
    definition:
      "A distinct, named group within a species. In cannabis we prefer 'cultivar' when the variety is deliberately bred and stably maintained.",
    seeAlso: ["Strain", "Purebred"],
  },
  {
    term: "Vegetative Stage",
    category: "Cultivation",
    definition:
      "The pre-flowering growth phase where the plant is building roots, stem, and leaves under long-day (or age-based, for autoflowers) conditions.",
    seeAlso: ["Autoflower", "Training"],
  },
  {
    term: "Washer",
    category: "Extraction",
    definition:
      "A vessel that agitates cannabis in cold water to knock trichome heads free for solventless (ice water hash) extraction.",
    seeAlso: ["Bubble Hash", "Solventless Extraction"],
  },
  {
    term: "Xylem",
    category: "Plant Anatomy",
    definition:
      "The plant's water- and mineral-conducting tissue that moves fluid upward from the roots.",
    seeAlso: ["Transpiration"],
  },
];

/** Deduplicated, alphabetically sorted glossary. */
export const GLOSSARY_TERMS: readonly GlossaryTerm[] = (() => {
  const seen = new Map<string, GlossaryTerm>();
  for (const t of RAW) {
    const key = t.term.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  return [...seen.values()].sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" }),
  );
})();

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  "Breeding",
  "Genetics",
  "Tissue Culture",
  "Cultivation",
  "Plant Anatomy",
  "Extraction",
  "Aroma / Chemistry",
];

export const GLOSSARY_DISCLAIMER =
  "Glossary entries are educational reference content, not medical, legal, or cultivation instructions.";
