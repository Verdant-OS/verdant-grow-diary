export interface TentsQueryLike {
  data?: unknown;
  isLoading?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isPlaceholderData?: boolean;
}

export interface TentsQuerySnapshot {
  hasData: boolean;
  isLoading: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
}

export type TentsPlantsStatus =
  | "not_needed"
  | "loading"
  | "error"
  | "stale"
  | "refreshing"
  | "ready";
export type TentsSensorReadStatus = "loading" | "error" | "refresh_error" | "success";

export interface TentsPageAsyncState {
  kind: "loading" | "error" | "limited" | "usable";
  primaryRefreshFailed: boolean;
  primaryRefreshing: boolean;
  plantsStatus: TentsPlantsStatus;
  assignmentPlantsStatus: TentsPlantsStatus;
  sensorLoadingTentIds: string[];
  sensorErrorTentIds: string[];
  sensorRefreshFailedTentIds: string[];
}

/** Normalize React Query's structural state and fail closed on missing data. */
export function snapshotTentsQuery(query: TentsQueryLike): TentsQuerySnapshot {
  return {
    hasData: query.data !== undefined && query.data !== null,
    isLoading: query.isLoading === true,
    isPending: query.isPending === true,
    isFetching: query.isFetching === true,
    isError: query.isError === true,
    isPlaceholderData: query.isPlaceholderData === true,
  };
}

/** Placeholder rows belong to a previous query key and never prove this scope. */
export function selectCurrentTentsQueryData<T>(
  query: TentsQueryLike & { data?: T | null },
): T | undefined {
  if (query.isPlaceholderData === true || query.data == null) return undefined;
  return query.data as T;
}

function isPendingQuery(query: TentsQuerySnapshot): boolean {
  return (
    query.isPlaceholderData ||
    query.isLoading ||
    query.isPending ||
    (!query.hasData && !query.isError)
  );
}

function classifyPlantsStatus(query: TentsQuerySnapshot): Exclude<TentsPlantsStatus, "not_needed"> {
  if (isPendingQuery(query)) return "loading";
  if (query.isError) return query.hasData ? "stale" : "error";
  if (query.isFetching) return "refreshing";
  return "ready";
}

/**
 * Tents own the page's loading/error/empty decision. Plant assignments and
 * per-tent sensor reads are supplemental: their failures never erase proven
 * tent cards, but they must produce an explicit Limited state.
 */
export function classifyTentsPageAsyncState(input: {
  primary: TentsQuerySnapshot;
  primaryRowCount: number;
  plants: TentsQuerySnapshot;
  assignments: TentsQuerySnapshot;
  sensorStatusByTent: Readonly<Record<string, TentsSensorReadStatus>>;
  primaryTentIds?: readonly string[];
}): TentsPageAsyncState {
  if (isPendingQuery(input.primary)) {
    return {
      kind: "loading",
      primaryRefreshFailed: false,
      primaryRefreshing: false,
      plantsStatus: "not_needed",
      assignmentPlantsStatus: "not_needed",
      sensorLoadingTentIds: [],
      sensorErrorTentIds: [],
      sensorRefreshFailedTentIds: [],
    };
  }

  if (input.primary.isError && !input.primary.hasData) {
    return {
      kind: "error",
      primaryRefreshFailed: false,
      primaryRefreshing: false,
      plantsStatus: "not_needed",
      assignmentPlantsStatus: "not_needed",
      sensorLoadingTentIds: [],
      sensorErrorTentIds: [],
      sensorRefreshFailedTentIds: [],
    };
  }

  // Cached emptiness is not current proof when its refresh failed. Without
  // this boundary the page would show a false first-run state and enable a
  // create path against an unverified tent count.
  if (input.primary.isError && input.primaryRowCount === 0) {
    return {
      kind: "error",
      primaryRefreshFailed: false,
      primaryRefreshing: false,
      plantsStatus: "not_needed",
      assignmentPlantsStatus: "not_needed",
      sensorLoadingTentIds: [],
      sensorErrorTentIds: [],
      sensorRefreshFailedTentIds: [],
    };
  }

  // A cached empty array is not proof of current emptiness while its request
  // is still in flight. Keep the page in Loading so Create Tent cannot race
  // an unverified scope.
  if (input.primaryRowCount === 0 && input.primary.isFetching) {
    return {
      kind: "loading",
      primaryRefreshFailed: false,
      primaryRefreshing: true,
      plantsStatus: "not_needed",
      assignmentPlantsStatus: "not_needed",
      sensorLoadingTentIds: [],
      sensorErrorTentIds: [],
      sensorRefreshFailedTentIds: [],
    };
  }

  // An established empty tent result owns the page's Empty state; plant and
  // sensor enrichments are irrelevant until a tent card exists.
  if (input.primaryRowCount === 0) {
    return {
      kind: "usable",
      primaryRefreshFailed: false,
      primaryRefreshing: false,
      plantsStatus: "not_needed",
      assignmentPlantsStatus: "not_needed",
      sensorLoadingTentIds: [],
      sensorErrorTentIds: [],
      sensorRefreshFailedTentIds: [],
    };
  }

  const primaryTentIds = [...(input.primaryTentIds ?? Object.keys(input.sensorStatusByTent))]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort();
  const sensorLoadingTentIds = primaryTentIds.filter(
    (id) => (input.sensorStatusByTent[id] ?? "loading") === "loading",
  );
  const sensorErrorTentIds = primaryTentIds.filter(
    (id) => input.sensorStatusByTent[id] === "error",
  );
  const sensorRefreshFailedTentIds = primaryTentIds.filter(
    (id) => input.sensorStatusByTent[id] === "refresh_error",
  );
  const plantsStatus = classifyPlantsStatus(input.plants);
  const assignmentPlantsStatus = classifyPlantsStatus(input.assignments);
  const primaryRefreshFailed = input.primary.isError && input.primary.hasData;
  const primaryRefreshing =
    input.primary.isFetching && input.primary.hasData && !input.primary.isError;
  const isLimited =
    primaryRefreshFailed ||
    primaryRefreshing ||
    plantsStatus !== "ready" ||
    assignmentPlantsStatus !== "ready" ||
    sensorLoadingTentIds.length > 0 ||
    sensorErrorTentIds.length > 0 ||
    sensorRefreshFailedTentIds.length > 0;

  return {
    kind: isLimited ? "limited" : "usable",
    primaryRefreshFailed,
    primaryRefreshing,
    plantsStatus,
    assignmentPlantsStatus,
    sensorLoadingTentIds,
    sensorErrorTentIds,
    sensorRefreshFailedTentIds,
  };
}
