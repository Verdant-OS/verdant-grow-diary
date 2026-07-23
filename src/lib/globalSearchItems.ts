import { normalizeSharedSearchText } from "@/lib/sharedSearchTextRules";

/**
 * Shared command-palette result model.
 *
 * Private grow/tent/plant matches arrive already filtered and ranked by the
 * RLS-backed public.verdant_search RPC. Public cultivar references and static
 * destinations are bundled read-only data. They converge here for one
 * deterministic presenter surface; this module performs no I/O.
 */

export type GlobalSearchEntityType = "grow" | "tent" | "plant";
export type GlobalSearchItemKind = GlobalSearchEntityType | "cultivar" | "page";

export interface GlobalSearchItem {
  label: string;
  to: string;
  group: string;
  kind: GlobalSearchItemKind;
  keywords?: readonly string[];
  description?: string;
  /** RPC rows are already query-matched, including server-side fuzzy matches. */
  matchedByServer?: boolean;
}

export interface GlobalSearchEntityInput {
  entity_type: GlobalSearchEntityType;
  id: string;
  label: string;
  sublabel?: string | null;
}

export interface GlobalSearchCultivarInput {
  slug: string;
  name: string;
  aliases?: readonly string[];
  breeder?: string | null;
  lineage?: string | null;
}

export const GLOBAL_SEARCH_ITEMS: readonly GlobalSearchItem[] = [
  { label: "Dashboard", to: "/", group: "Today", kind: "page", keywords: ["home", "overview"] },
  {
    label: "Quick Log",
    to: "/daily-check",
    group: "Today",
    kind: "page",
    keywords: ["log", "diary"],
  },
  { label: "Tents", to: "/tents", group: "Cultivation", kind: "page" },
  { label: "Plants", to: "/plants", group: "Cultivation", kind: "page" },
  {
    label: "My Grows",
    to: "/grows",
    group: "Cultivation",
    kind: "page",
    keywords: ["harvest", "archive"],
  },
  { label: "Timeline", to: "/timeline", group: "Daily", kind: "page" },
  { label: "Alerts", to: "/alerts", group: "Daily", kind: "page" },
  { label: "Action Queue", to: "/actions", group: "Daily", kind: "page" },
  { label: "Tasks", to: "/tasks", group: "Daily", kind: "page" },
  { label: "Sensors", to: "/sensors", group: "Insight", kind: "page" },
  {
    label: "AI Doctor",
    to: "/doctor",
    group: "Insight",
    kind: "page",
    keywords: ["coach", "diagnosis"],
  },
  {
    label: "Reports",
    to: "/reports",
    group: "Insight",
    kind: "page",
    keywords: ["learning", "hub"],
  },
  {
    label: "Strain Reference Library",
    to: "/cultivars",
    group: "Reference",
    kind: "page",
    keywords: ["cultivar", "strain", "breeder", "lineage", "grow guide"],
  },
  { label: "Guides", to: "/guides", group: "Reference", kind: "page" },
  {
    label: "Cannabis Plant Care FAQ",
    to: "/guides/cannabis-plant-care",
    group: "Reference",
    kind: "page",
  },
  {
    label: "Pheno Hunt",
    to: "/pheno-hunts",
    group: "Advanced",
    kind: "page",
    keywords: ["pheno", "phenotype", "breeding", "keeper", "hunt"],
  },
  { label: "Lineage Repair", to: "/grow-lineage", group: "Advanced", kind: "page" },
  { label: "Settings", to: "/settings", group: "Account", kind: "page" },
  {
    label: "Preferences",
    to: "/account/preferences",
    group: "Account",
    kind: "page",
  },
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

function entityRoute(entity: GlobalSearchEntityInput): string {
  switch (entity.entity_type) {
    case "grow":
      return `/grows/${entity.id}`;
    case "tent":
      return `/tents/${entity.id}`;
    case "plant":
      return `/plants/${entity.id}`;
  }
}

function entityGroup(entityType: GlobalSearchEntityType): string {
  switch (entityType) {
    case "grow":
      return "Grows";
    case "tent":
      return "Tents";
    case "plant":
      return "Plants";
  }
}

function entityDescription(entity: GlobalSearchEntityInput): string {
  if (entity.sublabel?.trim()) return entity.sublabel.trim();
  switch (entity.entity_type) {
    case "grow":
      return "Grow";
    case "tent":
      return "Tent";
    case "plant":
      return "Plant";
  }
}

export function buildGlobalSearchItems(args: {
  entityResults?: readonly GlobalSearchEntityInput[];
  cultivars?: readonly GlobalSearchCultivarInput[];
  staticItems?: readonly GlobalSearchItem[];
}): GlobalSearchItem[] {
  const items: GlobalSearchItem[] = [...(args.staticItems ?? GLOBAL_SEARCH_ITEMS)];

  for (const entity of args.entityResults ?? []) {
    items.push({
      label: entity.label,
      to: entityRoute(entity),
      group: entityGroup(entity.entity_type),
      kind: entity.entity_type,
      keywords: normalizeKeywords([entity.entity_type, entity.id, entity.sublabel]),
      description: entityDescription(entity),
      matchedByServer: true,
    });
  }

  for (const cultivar of args.cultivars ?? []) {
    items.push({
      label: cultivar.name,
      to: `/cultivars/${cultivar.slug}`,
      group: "Strain Reference",
      kind: "cultivar",
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
    // Preserve server-side exact/prefix/fuzzy matches. Re-filtering them with a
    // local substring check would incorrectly discard valid fuzzy RPC results.
    if (item.matchedByServer) return true;

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
