import type {
  CultivarDifficulty,
  CultivarLifeCycle,
  CultivarVerificationStatus,
  VerdantCultivarProfile,
} from "@/constants/verdantCultivars";
import { normalizeSharedSearchText } from "@/lib/sharedSearchTextRules";

export interface CultivarReferenceFilters {
  query?: string;
  difficulty?: "all" | CultivarDifficulty;
  lifeCycle?: "all" | CultivarLifeCycle;
  verificationStatus?: "all" | CultivarVerificationStatus;
}

/** Compatibility alias retained for existing cultivar-search callers. */
export const normalizeCultivarSearchText = normalizeSharedSearchText;

export function buildCultivarSearchText(cultivar: VerdantCultivarProfile): string {
  return normalizeCultivarSearchText(
    [
      cultivar.name,
      cultivar.searchAlias,
      cultivar.slug,
      cultivar.breeder ?? "",
      cultivar.lineage,
      cultivar.marketClassification,
      cultivar.lifeCycle,
      cultivar.difficulty,
      ...cultivar.aliases,
    ].join(" "),
  );
}

function queryRank(cultivar: VerdantCultivarProfile, rawQuery: string): number {
  const query = normalizeCultivarSearchText(rawQuery);
  if (!query) return 0;

  const name = normalizeCultivarSearchText(cultivar.name);
  const aliases = cultivar.aliases.map(normalizeCultivarSearchText);
  const breeder = normalizeCultivarSearchText(cultivar.breeder ?? "");
  const haystack = buildCultivarSearchText(cultivar);

  if (name === query || aliases.includes(query)) return 0;
  if (name.startsWith(query) || aliases.some((alias) => alias.startsWith(query))) return 1;
  if (breeder === query || breeder.startsWith(query)) return 2;
  if (haystack.includes(query)) return 3;
  return Number.POSITIVE_INFINITY;
}

export function filterCultivarReferenceProfiles(
  cultivars: readonly VerdantCultivarProfile[],
  filters: CultivarReferenceFilters,
): VerdantCultivarProfile[] {
  const difficulty = filters.difficulty ?? "all";
  const lifeCycle = filters.lifeCycle ?? "all";
  const verificationStatus = filters.verificationStatus ?? "all";
  const query = filters.query ?? "";

  return cultivars
    .map((cultivar) => ({ cultivar, rank: queryRank(cultivar, query) }))
    .filter(({ cultivar, rank }) => {
      if (!Number.isFinite(rank)) return false;
      if (cultivar.publicationStatus !== "published") return false;
      if (difficulty !== "all" && cultivar.difficulty !== difficulty) return false;
      if (lifeCycle !== "all" && cultivar.lifeCycle !== lifeCycle) return false;
      if (
        verificationStatus !== "all" &&
        cultivar.verificationStatus !== verificationStatus
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const byName = a.cultivar.name.localeCompare(b.cultivar.name);
      if (byName !== 0) return byName;
      return (a.cultivar.breeder ?? "").localeCompare(b.cultivar.breeder ?? "");
    })
    .map(({ cultivar }) => cultivar);
}
