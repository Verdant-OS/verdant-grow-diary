/** Plant-list completeness is distinct from the rows available for reopening. */
interface PlantListRead<T> {
  data?: readonly T[];
  isError?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  isPaused?: boolean;
  fetchStatus?: "idle" | "fetching" | "paused";
}
function readStatus<T>(read: PlantListRead<T>) {
  if (read.isError) return "unavailable";
  if (read.isPaused || read.fetchStatus === "paused") return "paused";
  if (read.isPending || read.isLoading) return "loading";
  if (read.isFetching || read.fetchStatus === "fetching") return "refreshing";
  return Array.isArray(read.data) ? "ready" : "unavailable";
}
export function buildTentPlantListReadView<T>(all: PlantListRead<T>, active: PlantListRead<T>) {
  const allStatus = readStatus(all);
  const statuses = [allStatus, readStatus(active)];
  const status = statuses.includes("unavailable")
    ? "unavailable"
    : statuses.includes("paused")
      ? "paused"
      : statuses.includes("loading")
        ? "loading"
        : statuses.includes("refreshing")
          ? "refreshing"
          : "ready";
  // A completed all-plants read is authoritative even when empty. Otherwise
  // retain its cached rows, or the active-query survivor, without claiming completeness.
  const plants =
    Array.isArray(all.data) && (allStatus === "ready" || all.data.length > 0)
      ? all.data
      : Array.isArray(active.data)
        ? active.data
        : [];
  const complete = status === "ready";
  return {
    plants,
    complete,
    showRows: complete || plants.length > 0,
    canRetry: status === "unavailable",
    status,
    countNotice: complete ? null : "Plant counts not verified",
    message:
      status === "unavailable"
        ? "Plant list unavailable. Retry to check plants assigned to this tent."
        : status === "paused"
          ? "Waiting for connection to load plants in this tent."
          : status === "loading"
            ? "Loading plants in this tent…"
            : status === "refreshing"
              ? "Refreshing plants in this tent…"
              : null,
    availableNotice:
      !complete && plants.length > 0
        ? "Available plants are shown; the complete list and counts have not been verified."
        : null,
  };
}
