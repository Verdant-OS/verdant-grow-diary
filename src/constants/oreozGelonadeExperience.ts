/**
 * Shared route and copy constants for the deliberately narrow
 * Oreoz-versus-Gelonade guide-to-diary experience.
 *
 * Customer Mode is an ID-free, static education surface. It never receives a
 * grow, tent, plant, diary, or share-token identifier.
 */

export const OREOZ_GELONADE_GUIDE_SLUG = "oreoz-vs-gelonade-comparison" as const;
export const OREOZ_GELONADE_GUIDE_PATH = `/guides/${OREOZ_GELONADE_GUIDE_SLUG}` as const;

export const NEXT_DOOR_CUSTOMER_COMPARISON_PATH =
  "/customer/guide/oreoz-vs-gelonade-comparison" as const;
export const NEXT_DOOR_CUSTOMER_BRAND = "Next Door Cannabis" as const;

export const OREOZ_GELONADE_DIARY_COMPARISON_PATH = "/diary/pheno-expression-comparison" as const;

export const OREOZ_DIARY_PROFILE_PATH = "/diary/strains/oreoz" as const;
export const GELONADE_DIARY_PROFILE_PATH = "/diary/strains/gelonade" as const;

export const OREOZ_GELONADE_GUIDE_PROMPT = "oreoz-vs-gelonade" as const;
export const OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH =
  `/dashboard?open=quick-log&type=observation&prompt=${OREOZ_GELONADE_GUIDE_PROMPT}` as const;

export const OREOZ_GELONADE_PHENO_NOTE_PROMPT =
  "Phenotypic observation — record structure, internode spacing, stretch, aroma direction, resin, vigor, resilience, and the plant stage or environment context you can verify.";

export const OREOZ_GELONADE_CUSTOMER_SEO = Object.freeze({
  title: "Oreoz vs Gelonade comparison | Next Door Cannabis",
  description:
    "A customer-safe Oreoz and Gelonade comparison from Next Door Cannabis: commonly reported structure and aroma directions, plus what to observe without exposing private grow data.",
});

export type OreozGelonadeCultivarKey = "oreoz" | "gelonade";

export interface OreozGelonadeCultivarDefinition {
  readonly key: OreozGelonadeCultivarKey;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly diaryProfilePath: string;
  readonly reportedDirection: string;
  readonly evidenceCaution: string;
}

export const OREOZ_GELONADE_CULTIVARS: Readonly<
  Record<OreozGelonadeCultivarKey, OreozGelonadeCultivarDefinition>
> = Object.freeze({
  oreoz: {
    key: "oreoz",
    name: "Oreoz",
    aliases: ["oreoz", "oreos", "oreo cookies"],
    diaryProfilePath: OREOZ_DIARY_PROFILE_PATH,
    reportedDirection:
      "Often described as compact and resin-forward, with dessert, earthy, and fuel aroma directions.",
    evidenceCaution:
      "That public description is directional context, not a prediction for a particular cut.",
  },
  gelonade: {
    key: "gelonade",
    name: "Gelonade",
    aliases: ["gelonade"],
    diaryProfilePath: GELONADE_DIARY_PROFILE_PATH,
    reportedDirection:
      "Often described as taller or more stretch-prone, with citrus, lemon, sweet, and gas aroma directions.",
    evidenceCaution:
      "Public reports vary and do not establish how a particular plant will express.",
  },
});
