/**
 * Pure read-state mapping for Plant Detail's assigned-tent details query.
 *
 * The plant row owns the assignment; a missing, failed, or mismatched details
 * read must not clear that assignment or substitute another tent's row.
 */

export function resolveAssignedTentRow<T extends { id: string }>(
  assignedTentId: string | null | undefined,
  row: T | null | undefined,
): T | null {
  if (!assignedTentId || !row || row.id !== assignedTentId) return null;
  return row;
}

export function buildPlantAssignedTentDetailsReadView(input: {
  hasResolvedDetails: boolean;
  isError?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  fetchStatus?: string;
}): { message: string | null; canRetry: boolean } {
  const cached = input.hasResolvedDetails;
  const message = input.isError
    ? cached
      ? "Could not refresh assigned tent details. Showing cached details."
      : "Assigned tent details unavailable."
    : input.fetchStatus === "paused"
      ? cached
        ? "Waiting for connection to refresh assigned tent details. Showing cached details."
        : "Waiting for connection to load assigned tent details."
      : input.isFetching || input.isPending
        ? cached
          ? "Refreshing assigned tent details. Showing cached details."
          : "Loading assigned tent details…"
        : !cached
          ? "Assigned tent details unavailable."
          : null;
  const canRetry =
    !input.isFetching &&
    input.fetchStatus !== "paused" &&
    (Boolean(input.isError) || (!cached && !input.isPending));
  return { message, canRetry };
}
