export type PlantsSupplementalQueryKey = "active" | "workspace" | "tents" | "diary" | "sensors";

export interface PlantsQuerySnapshot {
  hasData: boolean;
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
}

export interface PlantsQueryLike {
  data?: unknown;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  isPlaceholderData?: boolean;
}

export interface PlantsSupplementalQuerySnapshot {
  key: PlantsSupplementalQueryKey;
  query: PlantsQuerySnapshot;
}

export interface PlantsPageAsyncState {
  kind: "loading" | "error" | "limited" | "usable";
  primaryRefreshFailed: boolean;
  failedSupplementalKeys: PlantsSupplementalQueryKey[];
  staleSupplementalKeys: PlantsSupplementalQueryKey[];
  pendingSupplementalKeys: PlantsSupplementalQueryKey[];
}

export const PLANTS_SUPPLEMENTAL_QUERY_LABELS: Record<PlantsSupplementalQueryKey, string> = {
  active: "Plant summary",
  workspace: "Grow filter counts",
  tents: "Tent names and filters",
  diary: "Daily check notes",
  sensors: "Manual sensor check status",
};

/**
 * Converts React Query's structural state into the small deterministic shape
 * needed by the Plants presenter. Missing status flags fail closed: undefined
 * data is still pending until success or failure is established.
 */
export function snapshotPlantsQuery(query: PlantsQueryLike): PlantsQuerySnapshot {
  return {
    hasData: query.data !== undefined && query.data !== null,
    isLoading: query.isLoading === true,
    isPending: query.isPending === true,
    isError: query.isError === true,
    isPlaceholderData: query.isPlaceholderData === true,
  };
}

/**
 * Placeholder data belongs to the previous query key/scope. It may inform a
 * loading label but must never drive current-scope cards, chips, or badges.
 */
export function selectCurrentPlantsQueryData<T>(
  query: PlantsQueryLike & { data?: T | null },
): T | undefined {
  if (query.isPlaceholderData === true || query.data == null) return undefined;
  return query.data as T;
}

export type PlantsScopeState = "unscoped" | "loading" | "error" | "invalid" | "valid";

/** Resolve optional URL scope only after the RLS-backed grow list settles. */
export function classifyPlantsScopeState(input: {
  hasRequestedGrow: boolean;
  isLoading: boolean;
  hasError: boolean;
  isValid: boolean;
}): PlantsScopeState {
  if (!input.hasRequestedGrow) return "unscoped";
  if (input.isLoading) return "loading";
  if (input.hasError) return "error";
  return input.isValid ? "valid" : "invalid";
}

/** Reconcile a remembered tent choice against the tents proven for this scope. */
export function resolvePlantsTentFilter(
  requestedTentId: string,
  availableTentIds: readonly string[],
): string {
  if (requestedTentId === "all") return "all";
  return availableTentIds.includes(requestedTentId) ? requestedTentId : "all";
}

function isPendingQuery(query: PlantsQuerySnapshot): boolean {
  return (
    query.isPlaceholderData ||
    query.isLoading ||
    query.isPending ||
    (!query.hasData && !query.isError)
  );
}

/**
 * Plants owns one primary query: the archived-inclusive list that drives the
 * actual grid and empty state. Every other query is supplemental enrichment.
 *
 * Primary precedence is fail-closed:
 * loading/placeholder -> error -> established data. Supplemental failures or
 * pending enrichments never remove valid plant cards; they produce Limited.
 */
export function classifyPlantsPageAsyncState(input: {
  primary: PlantsQuerySnapshot;
  supplemental: readonly PlantsSupplementalQuerySnapshot[];
}): PlantsPageAsyncState {
  if (isPendingQuery(input.primary)) {
    return {
      kind: "loading",
      primaryRefreshFailed: false,
      failedSupplementalKeys: [],
      staleSupplementalKeys: [],
      pendingSupplementalKeys: [],
    };
  }

  if (input.primary.isError && !input.primary.hasData) {
    return {
      kind: "error",
      primaryRefreshFailed: false,
      failedSupplementalKeys: [],
      staleSupplementalKeys: [],
      pendingSupplementalKeys: [],
    };
  }

  const failedSupplementalKeys = input.supplemental
    .filter(({ query }) => query.isError && !query.hasData)
    .map(({ key }) => key);
  const staleSupplementalKeys = input.supplemental
    .filter(({ query }) => query.isError && query.hasData)
    .map(({ key }) => key);
  const pendingSupplementalKeys = input.supplemental
    .filter(({ query }) => !query.isError && isPendingQuery(query))
    .map(({ key }) => key);
  const primaryRefreshFailed = input.primary.isError && input.primary.hasData;

  return {
    kind:
      primaryRefreshFailed ||
      failedSupplementalKeys.length > 0 ||
      staleSupplementalKeys.length > 0 ||
      pendingSupplementalKeys.length > 0
        ? "limited"
        : "usable",
    primaryRefreshFailed,
    failedSupplementalKeys,
    staleSupplementalKeys,
    pendingSupplementalKeys,
  };
}
