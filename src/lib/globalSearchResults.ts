/**
 * ONE shared global-search result model + deterministic merge.
 *
 * Private owner-scoped entities (grows / tents / plants) come from the base
 * `public.verdant_search` RPC (RLS-enforced, owner-scoped, exact→prefix→fuzzy).
 * Public cultivar references come from the bundled V1 constants until DB cutover.
 * Both share this one result shape, one merge/rank helper, and one dialog — there
 * is no second command palette and no client-side fetch-all of private data.
 *
 * Invariants:
 * - Cultivar results are public, bundled, and read-only. They never touch
 *   `plants.strain`, never auto-link a plant to a cultivar, and never mutate any
 *   cultivar claim / confidence / verificationStatus.
 * - Private ordering from the RPC is preserved within each private group.
 */
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import {
  buildCultivarSearchText,
  normalizeCultivarSearchText,
} from "@/lib/cultivarReferenceSearchRules";
import { sharedSearchTextIncludes } from "@/lib/sharedSearchTextRules";

export type PrivateSearchEntityType = "grow" | "tent" | "plant";
export type GlobalSearchEntityType = PrivateSearchEntityType | "cultivar";
export type GlobalSearchMatchKind = "exact" | "prefix" | "fuzzy";

export interface GlobalSearchResult {
  entity_type: GlobalSearchEntityType;
  /** grow/tent/plant → row uuid; cultivar → slug. */
  id: string;
  label: string;
  sublabel: string;
  match_kind: GlobalSearchMatchKind;
  /** 0 = exact, 1 = prefix, 2 = fuzzy/contains. Matches the RPC contract. */
  rank: number;
  score: number;
}

/** Rows as returned by the private, owner-scoped `verdant_search` RPC. */
export type PrivateSearchRow = GlobalSearchResult & {
  entity_type: PrivateSearchEntityType;
};

const TYPE_ORDER: Record<GlobalSearchEntityType, number> = {
  grow: 0,
  tent: 1,
  plant: 2,
  cultivar: 3,
};

function compact(value: string): string {
  return normalizeCultivarSearchText(value).replace(/\s+/g, "");
}

/**
 * Pure public-cultivar search over the bundled V1 constants.
 *
 * Reuses the shared cultivar ranking concept (name/alias → breeder → contains)
 * but compares on a whitespace-compacted form so common compact aliases such as
 * `GG4` and `GG-4` both resolve to Original Glue. Only published profiles are
 * eligible. Deterministic: rank → score → name → slug. Deduped by slug.
 */
export function searchCultivarReferences(
  cultivars: readonly VerdantCultivarProfile[],
  query: string,
  limit = 20,
): GlobalSearchResult[] {
  const normalizedQuery = normalizeCultivarSearchText(query);
  if (!normalizedQuery) return [];
  const compactQuery = compact(query);

  const rows: GlobalSearchResult[] = [];
  const seen = new Set<string>();

  for (const cultivar of cultivars) {
    if (cultivar.publicationStatus !== "published") continue;
    if (seen.has(cultivar.slug)) continue;

    const nameForms = [cultivar.name, cultivar.searchAlias, cultivar.slug, ...cultivar.aliases];
    const compactNames = nameForms.map(compact).filter(Boolean);
    const compactBreeder = cultivar.breeder ? compact(cultivar.breeder) : "";
    const haystack = buildCultivarSearchText(cultivar);

    let matchKind: GlobalSearchMatchKind | null = null;
    let rank = 3;
    let score = 0;

    if (compactNames.includes(compactQuery)) {
      matchKind = "exact";
      rank = 0;
      score = 1;
    } else if (compactNames.some((name) => name.startsWith(compactQuery))) {
      matchKind = "prefix";
      rank = 1;
      score = 0.9;
    } else if (
      compactBreeder &&
      (compactBreeder === compactQuery || compactBreeder.startsWith(compactQuery))
    ) {
      matchKind = "fuzzy";
      rank = 2;
      score = 0.6;
    } else if (sharedSearchTextIncludes(haystack, query)) {
      matchKind = "fuzzy";
      rank = 2;
      score = 0.4;
    }

    if (!matchKind) continue;

    seen.add(cultivar.slug);
    rows.push({
      entity_type: "cultivar",
      id: cultivar.slug,
      label: cultivar.name,
      sublabel: cultivar.breeder ?? cultivar.lineage,
      match_kind: matchKind,
      rank,
      score,
    });
  }

  rows.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.score - a.score ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );

  return rows.slice(0, Math.max(0, limit));
}

/**
 * Deterministically merge private RPC rows with public cultivar rows into the
 * one shared surface. Ordering: match rank → entity/group tie-break → score →
 * stable lexical label → original arrival index. Deduped by `${type}:${id}`.
 *
 * Because the dialog re-groups by entity_type for display, private rows keep the
 * RPC's own within-group order (rank → score → label), and cultivar rows keep
 * their deterministic order.
 */
export function mergeGlobalSearchResults(
  privateRows: readonly GlobalSearchResult[],
  cultivarRows: readonly GlobalSearchResult[],
): GlobalSearchResult[] {
  const combined = [...privateRows, ...cultivarRows];
  const seen = new Set<string>();
  const deduped: { row: GlobalSearchResult; index: number }[] = [];

  combined.forEach((row, index) => {
    const key = `${row.entity_type}:${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({ row, index });
  });

  deduped.sort(
    (a, b) =>
      a.row.rank - b.row.rank ||
      TYPE_ORDER[a.row.entity_type] - TYPE_ORDER[b.row.entity_type] ||
      b.row.score - a.row.score ||
      a.row.label.localeCompare(b.row.label) ||
      a.index - b.index,
  );

  return deduped.map(({ row }) => row);
}
