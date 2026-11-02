/**
 * Toad Venom verified profile. Copy is the issue #2715 brief (2026-11-01).
 */
import type { CultivarFaqItem } from "@/lib/cultivarDetailSeo";
import type {
  CultivarLineageClaim,
  CultivarSameNameLine,
  CultivarSource,
  ProfileSeed,
} from "@/constants/strainReferenceLibrary";

const RETRIEVED = "2026-11-01T00:00:00.000Z";

function cited(
  key: string,
  title: string,
  publisher: string,
  url: string,
  sourceType: CultivarSource["sourceType"],
  linkPolicy?: CultivarSource["linkPolicy"],
): CultivarSource {
  return {
    key,
    title,
    publisher,
    url,
    sourceType,
    retrievedAt: RETRIEVED,
    licenseNotes: "Citation only. No article text is reproduced.",
    ...(linkPolicy ? { linkPolicy } : {}),
  };
}

export class ToadVenomCultivarProfile {
  static readonly slug = "toad-venom";

  static sources(): readonly CultivarSource[] {
    return [
      cited(
        "toad-venom-greenstate",
        "Toad Venom strain",
        "GreenState, David Downs (2026-02-26)",
        "https://www.greenstate.com/lifestyle/toad-venom-strain/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-leaf-magazines",
        "Hot Toad Summer",
        "Leaf Magazines (2026-06-03)",
        "https://leafmagazines.com/culture/hot-toad-summer/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-vice",
        "Toad Venom weed strain",
        "VICE, Maha Haq (2026-09-08)",
        "https://www.vice.com/en/via/toad-venom-weed-strain/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-ny420",
        "Toad Venom, strain of 2026",
        "New York 420 Week, Greg Silverstein (2026-10-20)",
        "https://newyork420week.com/articles/toad-venom-strain-of-2026",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-alchimia",
        "Origin of the Toad Venom cannabis variety",
        "Alchimiaweb (2026-10-15)",
        "https://www.alchimiaweb.com/blogen/origin-toad-venom-cannabis-variety/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-tiwih",
        "Toad Venom: the 2026 strain everyone is chasing",
        "thisiswhyimhigh (2026-05-01, updated 2026-09-17)",
        "https://thisiswhyimhigh.com/learn/toad-venom-the-2026-strain-everyone-is-chasing",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-roots",
        "Toad Venom strain",
        "Roots Cannabis Nursery (2026-03-06, updated Sept 2026)",
        "https://rootscannabisnursery.com/2026/03/06/toad-venom-strain/",
        "grower_report",
        "nofollow",
      ),
      cited(
        "toad-venom-leafly",
        "Toad Venom strain page",
        "Leafly (fetched 2026-11-01)",
        "https://www.leafly.com/strains/toad-venom",
        "community",
      ),
      cited(
        "toad-venom-leafly-picks",
        "Best cannabis strains",
        "Leafly Picks (updated 2026-10-27)",
        "https://www.leafly.com/news/strains-products/best-cannabis-strains-spring",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-hightimes",
        "Hottest cannabis strains right now",
        "High Times (2026-06-30)",
        "https://hightimes.com/strains/hottest-cannabis-strains-right-now-high-times-picks/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-metrotimes",
        "Michigan Zalympix 2026",
        "Detroit Metro Times (2026-09-21)",
        "https://www.metrotimes.com/weed-2/michigans-best-flower-and-live-rosin-crowned-at-2026-zalympix/",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-billies",
        "And the Billy Award goes to Frog",
        "David Downs, Fire Follower (2026-05-14)",
        "https://daviddownspresents.substack.com/p/and-the-billy-award-goes-to-frog",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-flora-flame",
        "Zalympix 2026 recap",
        "Flora & Flame (2026-06-03)",
        "https://floraandflameca.com/zalympix-2026-recap",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-terp-warz",
        "Terp Warz winners",
        "David Downs (2026-08-19)",
        "https://daviddownspresents.substack.com/p/terp-warz-winners-hashathon-cup-winners",
        "verdant_editorial",
      ),
      cited(
        "toad-venom-1321",
        "Toad Venom strain guide",
        "1321 (2026-07-03)",
        "https://shop1321.com/blogs/news/toad-venom-strain-guide",
        "community",
        "nofollow",
      ),
      cited(
        "toad-venom-howhigh",
        "Toad Venom by Mr. Gelatti",
        "How High Hub (2026-09-19)",
        "https://www.howhighhub.com/product/toad-venom-by-mr-gelatti/",
        "community",
        "unlinked",
      ),
      cited(
        "toad-venom-kaycha",
        "Kaycha Labs COA, sample MI60831003-002",
        "Kaycha Labs via thisiswhyimhigh (completed 2026-09-03)",
        "https://salve-platform-production-pub-1.s3.amazonaws.com/145193/external-download.pdf",
        "laboratory",
      ),
      cited(
        "toad-venom-icmag",
        "Toad Venom thread",
        "ICMAG (started 2026-01-03)",
        "https://www.icmag.com/threads/toad-venom.18136761/",
        "grower_report",
      ),
      cited(
        "toad-venom-growdiaries",
        "Toad Venom diaries",
        "GrowDiaries (date not shown)",
        "https://growdiaries.com/strains/toad-venom/diaries",
        "community",
      ),
      cited(
        "toad-venom-seedfinder-ronin",
        "Toad Venom, Ronin Garden",
        "Seedfinder (date not shown)",
        "https://seedfinder.eu/en/strain-info/toad-venom/ronin-garden",
        "community",
        "nofollow",
      ),
      cited(
        "toad-venom-seedfinder-growers-choice",
        "Toad Venom, Growers Choice",
        "Seedfinder (date not shown)",
        "https://seedfinder.eu/en/strain-info/toad-venom/growers-choice",
        "community",
        "nofollow",
      ),
      cited(
        "toad-venom-seedfinder-philo",
        "Philo Toad Venom",
        "Seedfinder (date not shown)",
        "https://seedfinder.eu/en/strain-info/toad-venom/philosopher-seeds",
        "community",
        "nofollow",
      ),
      cited(
        "toad-venom-seedfinder-zamnesia",
        "Toad Venom Auto",
        "Seedfinder (date not shown)",
        "https://seedfinder.eu/en/strain-info/toad-venom-auto/zamnesia-seeds",
        "community",
        "nofollow",
      ),
      cited(
        "toad-venom-eleven-thirty",
        "Eleven Thirty Genetics Toad Venom",
        "Eleven Thirty Genetics (date not shown)",
        "https://eleventhirtygenetics.com/products/toad-venom",
        "breeder",
        "nofollow",
      ),
      cited(
        "toad-venom-soloud",
        "Toad Venom S1 seeds",
        "SoLoud Genetics (2026-08-29)",
        "https://soloudseeds.com/blogs/soloud-selections/toad-venom-s1-seeds",
        "breeder",
        "nofollow",
      ),
    ];
  }

  static lineageClaims(): readonly CultivarLineageClaim[] {
    return [
      {
        claim: "Ronin Seeds (LA) made the cross, with West Coast Connoisseurs co-credited.",
        source: "GreenState; NY 420 Week; Leafly",
        date: "2026-02-26 / 2026-10-20 / fetched 2026-11-01",
      },
      {
        claim: "Green Dragon (North Hollywood), Glen S., selected it and named her Becky.",
        source: "GreenState; Leaf Magazines",
        date: "2026-02-26 / 2026-06-03",
      },
      {
        claim: "Year reported as 2021.",
        source: "GreenState; Roots Cannabis Nursery",
        date: "2026-02-26 / 2026-03-06",
      },
      {
        claim: "Year reported as 2022.",
        source: "Leaf Magazines (NY 420 Week flags both years)",
        date: "2026-06-03",
      },
      {
        claim: "Hunt size: 30 seeds, one keeper.",
        source: "GreenState; Leaf Magazines; NY 420 Week",
        date: "2026",
      },
      {
        claim: "Hunt size: about 170 phenotypes in parallel.",
        source: "Alchimiaweb, reading of the Jake/Glen interview",
        date: "2026-10-15",
      },
      {
        claim:
          "Widely reported parents: Animal Face (Face Off OG × Animal Mints) × Sin Mintz (Sin Mint Cookies × Zkittlez). Direction and who made Sin Mintz are disputed.",
        source: "GreenState, Leaf Magazines, Roots, VICE, Leafly, Seedfinder",
        date: "2026",
      },
    ];
  }

  static sameNameLines(): readonly CultivarSameNameLine[] {
    return [
      {
        name: "Eleven Thirty Genetics Toad Venom",
        breeder: "Eleven Thirty Genetics",
        lineage: "Venom OG × All Gas OG (UK)",
        seedType: "Feminized photo; separate auto (× Ruderalis)",
        relation: "Different plant, shares name only",
        source: "Eleven Thirty Genetics; How High Hub",
        date: "date not shown / 2026-09-19",
      },
      {
        name: 'Growers Choice "Toad Venum" / "Toad Venom aka Toad Poison"',
        breeder: "Growers Choice",
        lineage: 'Animal Face × "our Sin Mintz cut"',
        seedType: "Feminized photo",
        relation: "Separate seed population [seed-bank marketing]",
        source: "Seedfinder; Cannapot",
        date: "date not shown",
      },
      {
        name: "SoLoud Genetics Toad Venom S1",
        breeder: "SoLoud Genetics",
        lineage: "Feminized self of a cut SoLoud says is Becky",
        seedType: "Feminized S1",
        relation: "Seed population, not the clone; no independent DNA",
        source: "SoLoud; thisiswhyimhigh",
        date: "2026-08-29 / 2026-09-17",
      },
      {
        name: "Native Sun Genetics Toad Venom",
        breeder: "Native Sun Genetics",
        lineage: 'In-house "NSG cut" of Animal Face × Sin Mintz',
        seedType: "Feminized photo",
        relation: "Explicitly not the original clone",
        source: "CartierCrops / Native Sun Genetics",
        date: "2026-06-02",
      },
      {
        name: "Philosopher Seeds Philo Toad Venom",
        breeder: "Philosopher Seeds",
        lineage: "Toad Venom × Permanent Marker",
        seedType: "Feminized",
        relation: "Derivative",
        source: "Seedfinder",
        date: "date not shown",
      },
      {
        name: "Zamnesia Seeds Toad Venom Auto",
        breeder: "Zamnesia Seeds",
        lineage: "Animal Face × Sin Mintz Auto",
        seedType: "Feminized auto",
        relation: "Derivative auto; not Eleven Thirty's auto",
        source: "Seedfinder",
        date: "date not shown",
      },
    ];
  }

  static faq(): readonly CultivarFaqItem[] {
    return [
      {
        question: "Is Toad Venom the same as toad venom (5-MeO-DMT)?",
        answer:
          "No. This page is about a cannabis cut. The name is a joke about the parents (Sin Mintz and Animal Face). It is not Incilius alvarius or 5-MeO-DMT.",
      },
      {
        question: "What is Toad Venom's lineage?",
        answer:
          "Animal Face × Sin Mintz is the widely reported cross. Direction and who made Sin Mintz are disputed. Venom OG × All Gas OG is Eleven Thirty's different plant. No public DNA test shows every jar sold as Toad Venom is the same plant.",
      },
      {
        question: "Is Toad Venom the same as Becky and Frog Poison?",
        answer:
          "Becky is Green Dragon's name for the selection. Frog Poison and Frawg Poison circulate as the same cut. No public DNA test proves that.",
      },
      {
        question: "How long does Toad Venom take to flower?",
        answer:
          "Roots Cannabis Nursery, after flowering the cut in R&D, reported 60–65 days and said to start checking trichomes around day 58 [grower report, 2026-03-06, updated Sept 2026]. Other shops publish different windows. Check the plant, not only the calendar.",
      },
      {
        question: "Are there Toad Venom seeds?",
        answer:
          "Not from Ronin Seeds or Green Dragon. The reported cut is clone-only. Third-party S1 and same-name seed lines exist and are different populations.",
      },
      {
        question: "Is there a Toad Venom auto?",
        answer:
          "Other breeders sell autos under the name. Those are different plants. If you run one, use low-stress training only: gentle bending and tie-down, not topping, high-stress training, or heavy defoliation.",
      },
      {
        question: "Will this Toad Venom profile predict how my plant turns out?",
        answer:
          "No. It is a starting hypothesis drawn from public sources. Your plant's own logs, stage, medium, source-labeled sensors, and observed response stay authoritative — a reference page never creates an alert, a nutrient or irrigation action, or any guaranteed result.",
      },
    ];
  }

  static seed(): ProfileSeed {
    const primary = "toad-venom-greenstate";
    return {
      slug: this.slug,
      name: "Toad Venom",
      aliases: ["Becky", "Frog Poison", "Frawg Poison"],
      breeder: "Ronin Seeds (cross); Green Dragon (selection). Credit is disputed, see Lineage.",
      lineage: "Animal Face × Sin Mintz (reported; direction and Sin Mintz maker disputed)",
      intro:
        "Toad Venom is a clone-only cannabis cut credited to Ronin Seeds' cross of Animal Face × Sin Mintz and selected by Green Dragon of North Hollywood, who named it Becky. It is the cannabis plant, not the Incilius alvarius (Sonoran Desert toad) secretion that contains 5-MeO-DMT. Several unrelated seed lines use the same name.",
      dek: "Also sold as Becky and Frog Poison. Source-backed record of the Ronin Seeds × Green Dragon cut, last checked Nov 1, 2026.",
      metaDescription:
        "Toad Venom (Becky, Frog Poison) strain: disputed Animal Face × Sin Mintz lineage, reported flower time, and 6 other lines sold under the same name.",
      lifeCycle: "photoperiod",
      seedExpression: "clone_only",
      marketClassification: "unknown",
      difficulty: null,
      heightCategory: "variable",
      flowerWeeks: "About 8.5–9.5 weeks (60–65 days, one nursery flower-out)",
      floweringDays: [60, 65],
      stretch: [null, null],
      thc: [null, null],
      chemotype: "unknown",
      sourceKey: primary,
      sourceKeys: [...this.sources().map((source) => source.key)],
      verificationStatus: "verified",
      dataOrigin: "editorial",
      lastVerifiedAt: RETRIEVED,
      terpenes: [
        { name: "beta-caryophyllene", aromas: ["peppery"], valuePct: 1.07 },
        { name: "limonene", aromas: ["citrus"], valuePct: 0.642 },
        { name: "linalool", aromas: ["floral"], valuePct: 0.449 },
        { name: "beta-myrcene", aromas: ["earthy"], valuePct: 0.415 },
        { name: "alpha-humulene", aromas: ["woody"], valuePct: 0.408 },
      ],
      terpeneSourceKey: "toad-venom-kaycha",
      tendencies: {
        overview: [
          "One selected phenotype (keeper). Aliases: Becky (Green Dragon), Toad Venom (Ronin), Frog Poison / Frawg Poison (parallel market name). Frog Poison = Becky is not proven by public DNA (VICE 2026-09-08).",
          "Not the toad. The name is a joke about the parents. It is not Incilius alvarius / 5-MeO-DMT (NY 420 Week 2026-10-20; thisiswhyimhigh updated 2026-09-17).",
          'VICE, 2026-09-08, quotes Jake: "What\'s a sinful animal?" Alchimiaweb 2026-10-15 attributes that line to Dusty in the Oklahoma room. Both accounts are shown; neither is resolved here.',
          'Leaf Magazines, 2026-06-03: "Ronin definitely bred the cross, and Green Dragon hunted it, selecting its winning varietal from 30 seeds in 2022. Green Dragon originally named it Becky."',
          'Green Dragon to VICE, 2026-09-08: "We are the ones that found her from seed." VICE, same date: "It doesn\'t have one clean origin story."',
        ],
        flowering: [
          '60–65 days. "Start checking trichomes around day 58." "A plant that wants ten weeks is not Toad Venom." Roots Cannabis Nursery after flowering the cut [grower report], 2026-03-06 / updated Sept 2026.',
          "56–63 days: 1321 (retailer blog, 2026-07-03). 8–9 weeks: Prime Cuts [nursery marketing, 2026-09-29]. 9–10 weeks indoor: Kind Green Buds (aggregator, 2026-08-12), which conflicts with Roots. Do not average these.",
          'ICMAG grower, day 41: "Super stinky and sticky" [grower report].',
        ],
        vegetative: [
          'Roots, after flower-out [grower report]: compact, tight internodes. "A lanky, wide-noded plant is a flag."',
          'ICMAG growers [grower report]: "She grows like a vine," medium internodal spacing, LST on the main stem. Prime Cuts: "medium stature with moderate stretch" [nursery marketing]. Reports disagree. No numeric stretch multiplier is published.',
        ],
        training: [
          "Photoperiod clone: ICMAG growers used low-stress training on the main stem. No other technique is sourced.",
          "Autos sold as Toad Venom are different plants. Low-stress handling only.",
        ],
        harvest: [
          'Roots: deep forest green, subtle purple in sugar leaves, bright orange pistils. "Heavy purple throughout is a flag for a different cultivar." [grower report]',
          'Aroma reports (not a spec): mint-cookie, lime, gas. Leaf Magazines 2026-06-03: "pungent, minty, cookie, lime taffy, chemical-fume taste."',
        ],
        missing_information: [
          "Not found as of 2026-11-01: no finished home harvest with yield numbers for the clone (GrowDiaries strain page: 0 harvests). No per-plant yield. Yield fields stay blank.",
          "No public DNA proof and no breeder spec sheet. No regular (non-feminized) seeds and no breeder auto from Ronin or Green Dragon.",
          "No High Times Cup, Emerald Cup, or Spannabis win was found. Cups that did happen are listed separately and are not major-cup trophies.",
          "Awards found: Billy Awards 2026-04-19, 1st Gas (as Frog Poison). California Zalympix 2026-05-30, Best Toad Industry. Michigan Zalympix announced 2026-09-20, Best Overall Flower 1st. Terp Warz Summer Classic 2026-08-08, among winners, placement unclear. Editorial picks are not cups.",
          "Kaycha Labs sample MI60831003-002 (harvested 2026-08-04, completed 2026-09-03): 31.2% total THC and 3.78% total terpenes on that one batch. One batch, one lab. Not a strain constant. THC is not stored as a strain range.",
        ],
      },
      phenoHuntFocus: [
        "Cut provenance",
        "Internode spacing in inches",
        "Flower day 58 trichomes",
        "Same-name line check",
      ],
      sampleAromas: ["Mint and lime direction", "Gas direction"],
      lineageClaims: this.lineageClaims(),
      sameNameLines: this.sameNameLines(),
      sameNameNote:
        "If the lineage on your pack or clone tag does not say Animal Face and Sin Mintz, you are looking at the other Toad Venom.",
      editorialFaq: this.faq(),
    };
  }
}
