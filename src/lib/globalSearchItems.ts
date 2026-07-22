import { normalizeSharedSearchText } from "@/lib/sharedSearchTextRules";

/**
 * Shared command-palette search model.
 *
 * Static destinations, owner-scoped grow entities, and public cultivar
 * references all converge here. Pages must not invent a second search model.
 */

export interface GlobalSearchItem {
  label: string;
  to: string;
  group: string;
  keywords?: readonly string[];
  description?: string;
}

export interface GlobalSearchGrowInput {
  id: string;
  name: string;
}

export interface GlobalSearchTentInput {
  id: string;
  name: string;
  stage?: string | null;
}

export interface GlobalSearchPlantInput {
  id: string;
  name: string;
  strain?: string | null;
  stage?: string | null;
}

export interface GlobalSearchCultivarInput {
  slug: string;
  name: string;
  aliases?: readonly string[];
  breeder?: string | null;
  lineage?: string | null;
}

export const GLOBAL_SEARCH_ITEMS: readonly GlobalSearchItem[] = [
  { label: "Dashboard", to: "/", group: "Today", keywords: ["home", "overview"] },
  { label: "Quick Log", to: "/daily-check", group: "Today", keywords: ["log", "diary"] },
  { label: "Tents", to: "/tents", group: "Cultivation" },
  { label: "Plants", to: "/plants", group: "Cultivation" },
  { label: "My Grows", to: "/grows", group: "Cultivation", keywords: ["harvest", "archive"] },
  { label: "Timeline", to: "/timeline", group: "Daily" },
  { label: "Alerts", to: "/alerts", group: "Daily" },
  { label: "Action Queue", to: "/actions", group: "Daily" },
  { label: "Tasks", to: "/tasks", group: "Daily" },
  { label: "Sensors", to: "/sensors", group: "Insight" },
  { label: "AI Doctor", to: "/doctor", group: "Insight", keywords: ["coach", "diagnosis"] },
  { label: "Reports", to: "/reports", group: "Insight", keywords: ["learning", "hub"] },
  {
    label: "Strain Reference Library",
    to: "/cultivars",
    group: "Reference",
    keywords: ["cultivar", "strain", "breeder", "lineage", "grow guide"],
  },
  { label: "Guides", to: "/guides", group: "Reference" },
  { label: "Cannabis Plant Care FAQ", to: "/guides/cannabis-plant-care", group: "Reference" },
  {
    label: "Pheno Hunt",
    to: "/pheno-hunts",
    group: "Advanced",
    keywords: ["pheno", "phenotype", "breeding", "keeper", "hunt"],
  },
  { label: "Lineage Repair", to: "/grow-lineage", group: "Advanced" },
  { label: "Settings", to: "/settings", group: "Account" },
  { label: "Preferences", to: "/account/preferences", group: "Account" },
];

const GROUP_ORDER = [
  "Grows",
  "Tents",
  "Plants",
  "Strain Reference",
  "Today",
  "Cultivation",
  "Daily",
  "Insight",
  "Reference",
  "Advanced",
  "Account",
] as const;

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
  return index === -1 ? GROUP_ORDER.length : index;
}

function normalizeKeywords(values: readonly (string | null | undefined)[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

export function buildGlobalSearchItems(args: {
  grows?: readonly GlobalSearchGrowInput[];
  tents?: readonly GlobalSearchTentInput[];
  plants?: readonly GlobalSearchPlantInput[];
  cultivars?: readonly GlobalSearchCultivarInput[];
  staticItems?: readonly GlobalSearchItem[];
}): GlobalSearchItem[] {
  const items: GlobalSearchItem[] = [...(args.staticItems ?? GLOBAL_SEARCH_ITEMS)];

  for (const grow of args.grows ?? []) {
    items.push({
      label: grow.name,
      to: `/grows/${grow.id}`,
      group: "Grows",
      keywords: ["grow", grow.id],
      description: "Grow",
    });
  }

  for (const tent of args.tents ?? []) {
    items.push({
      label: tent.name,
      to: `/tents/${tent.id}`,
      group: "Tents",
      keywords: normalizeKeywords(["tent", tent.stage, tent.id]),
      description: tent.stage ? `Tent · ${tent.stage}` : "Tent",
    });
  }

  for (const plant of args.plants ?? []) {
    items.push({
      label: plant.name,
      to: `/plants/${plant.id}`,
      group: "Plants",
      keywords: normalizeKeywords(["plant", plant.strain, plant.stage, plant.id]),
      description: plant.strain ? `Plant · ${plant.strain}` : "Plant",
    });
  }

  for (const cultivar of args.cultivars ?? []) {
    items.push({
      label: cultivar.name,
      to: `/cultivars/${cultivar.slug}`,
      group: "Strain Reference",
      keywords: normalizeKeywords([
        "cultivar",
        "strain",
        cultivar.slug,
        cultivar.breeder,
        cultivar.lineage,
        ...(cultivar.aliases ?? []),
      ]),
      description: cultivar.breeder ? `Reference · ${cultivar.breeder}` : "Reference cultivar",
    });
  }

  const uniqueByRoute = new Map<string, GlobalSearchItem>();
  for (const item of items) {
    if (!uniqueByRoute.has(item.to)) uniqueByRoute.set(item.to, item);
  }

  return Array.from(uniqueByRoute.values()).sort((a, b) => {
    const byGroup = groupRank(a.group) - groupRank(b.group);
    if (byGroup !== 0) return byGroup;
    const byLabel = a.label.localeCompare(b.label);
    if (byLabel !== 0) return byLabel;
    return a.to.localeCompare(b.to);
  });
}

export function filterGlobalSearchItems(
  items: readonly GlobalSearchItem[],
  query: string,
): GlobalSearchItem[] {
  const normalizedQuery = normalizeSharedSearchText(query);
  if (!normalizedQuery) return [...items];
  return items.filter((item) => {
    const haystack = normalizeSharedSearchText(
      [
        item.label,
        item.to,
        item.group,
        item.description ?? "",
        ...(item.keywords ?? []),
      ].join(" "),
    );
    return haystack.includes(normalizedQuery);
  });
}
