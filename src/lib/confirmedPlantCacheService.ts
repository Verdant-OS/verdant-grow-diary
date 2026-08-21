import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { PlantRow } from "@/lib/db";
import type { Plant } from "@/mock";
import { mapPlantRow } from "@/lib/growAdapters";
import { validatePlantRowResponse } from "@/lib/plantPayloadValidation";

export interface ConfirmedCreatedPlant {
  row: PlantRow;
  plant: Plant;
}

interface ExpectedCreatedPlantScope {
  ownerId: string;
  growId: string;
  tentId: string | null;
}

export interface ConfirmedPlantCacheReceipt {
  growCaches: readonly {
    queryKey: QueryKey;
    logicalKey: QueryKey;
  }[];
}

interface PrimeConfirmedPlantCachesOptions {
  /** Re-checks the active identity after async cancellation and before writes. */
  isOwnerCurrent: () => boolean;
  /** Runs immediately before the matching owner-scoped cache is published. */
  onGrowCacheConfirmed?: (logicalKey: QueryKey) => void;
}

function normalizedNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Convert the untrusted insert response into the two cache shapes only after
 * its owner and hierarchy match the submitted create operation.
 */
export function confirmCreatedPlantRow(
  value: unknown,
  expected: ExpectedCreatedPlantScope,
): ConfirmedCreatedPlant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const guarded = validatePlantRowResponse(value as Record<string, unknown>);
  if (!guarded.ok || !guarded.value) return null;
  const row = guarded.value as unknown as PlantRow;
  if (
    row.user_id !== expected.ownerId ||
    row.grow_id !== expected.growId ||
    normalizedNullableString(row.tent_id) !== expected.tentId ||
    row.is_archived !== false
  ) {
    return null;
  }
  return { row, plant: mapPlantRow(row) };
}

function rowId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function upsertPlantRow<T extends { id: string }>(
  current: unknown,
  next: T,
  direction: "ascending" | "descending",
): unknown {
  if (current == null) return [next];
  if (!Array.isArray(current)) return current;
  const withoutDuplicate = current.filter((candidate) => rowId(candidate) !== next.id);
  return direction === "ascending" ? [...withoutDuplicate, next] : [next, ...withoutDuplicate];
}

interface GrowPlantsCacheScope {
  logicalKey: QueryKey;
  tentId: string;
  growId: string;
  includeArchived: boolean;
}

function parseGrowPlantsCacheScope(
  queryKey: QueryKey,
  ownerId: string,
): GrowPlantsCacheScope | null {
  if (queryKey[0] !== "grow" || queryKey[1] !== "plants") return null;
  const ownerIndex = queryKey.length - 2;
  if (ownerIndex < 4 || queryKey[ownerIndex] !== "owner" || queryKey[ownerIndex + 1] !== ownerId) {
    return null;
  }
  const scope = queryKey.slice(2, ownerIndex);
  if (scope.length !== 2 && !(scope.length === 3 && scope[2] === "with-archived")) {
    return null;
  }
  const [tentId, growId] = scope;
  if (typeof tentId !== "string" || typeof growId !== "string") return null;
  return {
    logicalKey: queryKey.slice(0, ownerIndex),
    tentId,
    growId,
    includeArchived: scope[2] === "with-archived",
  };
}

function scopeIncludesPlant(scope: GrowPlantsCacheScope, row: PlantRow): boolean {
  if (row.is_archived && !scope.includeArchived) return false;
  if (scope.growId !== "all" && scope.growId !== row.grow_id) return false;
  if (scope.tentId !== "all" && scope.tentId !== row.tent_id) return false;
  return true;
}

/**
 * Prime only caches that already exist for the current owner and include the
 * confirmed row's grow/tent scope. Authoritative invalidation still follows.
 */
export async function primeConfirmedPlantCaches(
  queryClient: QueryClient,
  ownerId: string,
  confirmed: ConfirmedCreatedPlant,
  options: PrimeConfirmedPlantCachesOptions,
): Promise<ConfirmedPlantCacheReceipt> {
  const legacyKey = ["plants"] as const;
  const legacyQuery = queryClient.getQueryCache().find({ queryKey: legacyKey, exact: true });
  const updateLegacy = !!legacyQuery;
  const matchingGrowQueries = queryClient
    .getQueryCache()
    .findAll({ queryKey: ["grow", "plants"] })
    .flatMap((query) => {
      const scope = parseGrowPlantsCacheScope(query.queryKey, ownerId);
      return scope && scopeIncludesPlant(scope, confirmed.row)
        ? [{ query, queryKey: query.queryKey, scope }]
        : [];
    });

  // Prevent an older in-flight empty response from overwriting the confirmed
  // row. Cancellation is best-effort cache coordination: a durable insert must
  // not be reported as failed if a client-side cancellation hook rejects.
  await Promise.allSettled([
    ...(updateLegacy ? [queryClient.cancelQueries({ queryKey: legacyKey, exact: true })] : []),
    ...matchingGrowQueries.map(({ queryKey }) =>
      queryClient.cancelQueries({ queryKey, exact: true }),
    ),
  ]);

  // A durable response may complete after sign-out/account-switch cleanup.
  // Never repopulate the ownerless legacy cache, or any old owner query, unless
  // the submitting identity is still current at the actual publish boundary.
  if (!options.isOwnerCurrent()) return { growCaches: [] };

  const legacyQueryIsUnchanged =
    updateLegacy &&
    queryClient.getQueryCache().find({ queryKey: legacyKey, exact: true }) === legacyQuery;
  if (legacyQueryIsUnchanged) {
    queryClient.setQueryData(["plants"], (current) =>
      upsertPlantRow(current, confirmed.row, "ascending"),
    );
  }

  const growCaches: Array<{ queryKey: QueryKey; logicalKey: QueryKey }> = [];
  for (const { query, queryKey, scope } of matchingGrowQueries) {
    if (!options.isOwnerCurrent()) break;
    if (queryClient.getQueryCache().find({ queryKey, exact: true }) !== query) continue;
    options.onGrowCacheConfirmed?.(scope.logicalKey);
    if (!options.isOwnerCurrent()) break;
    queryClient.setQueryData(queryKey, (current) =>
      upsertPlantRow(current, confirmed.plant, "descending"),
    );
    growCaches.push({ queryKey, logicalKey: scope.logicalKey });
  }

  return { growCaches };
}

/**
 * A failed authoritative refresh leaves React Query's error state intact, but
 * its query boundary can overwrite source metadata. Re-affirm only cache rows
 * that still contain this server-confirmed plant; never recreate missing data.
 */
export function reaffirmConfirmedPlantCacheMeta(
  queryClient: QueryClient,
  confirmed: ConfirmedCreatedPlant,
  receipt: ConfirmedPlantCacheReceipt,
  options: PrimeConfirmedPlantCachesOptions,
): number {
  if (!options.isOwnerCurrent()) return 0;
  let reaffirmed = 0;
  for (const cache of receipt.growCaches) {
    if (!options.isOwnerCurrent()) break;
    const current = queryClient.getQueryData(cache.queryKey);
    if (
      !Array.isArray(current) ||
      !current.some((candidate) => rowId(candidate) === confirmed.row.id)
    ) {
      continue;
    }
    options.onGrowCacheConfirmed?.(cache.logicalKey);
    reaffirmed += 1;
  }
  return reaffirmed;
}
