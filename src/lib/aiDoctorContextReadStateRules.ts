/** Read completeness is separate from the quality of the evidence that survived. */
export type ContextEvidenceReadStatus = "loading" | "paused" | "refreshing" | "error" | "success";

export function contextEvidenceReadStatus(
  status: "pending" | "error" | "success",
  fetchStatus: "idle" | "fetching" | "paused",
): ContextEvidenceReadStatus {
  if (fetchStatus === "paused") return "paused";
  if (status === "error") return "error";
  if (status === "pending") return "loading";
  return fetchStatus === "fetching" ? "refreshing" : "success";
}

interface EvidenceReadState {
  readStatus?: ContextEvidenceReadStatus;
  hasData?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
}

interface ContextReadInput {
  timeline: EvidenceReadState & {
    companionEvidenceUnavailable?: boolean;
    auditEvidenceUnavailable?: boolean;
  };
  rootZone: EvidenceReadState | null;
  manual: {
    status: "loading" | "error" | "refresh_error" | "success" | undefined;
    refreshing?: boolean;
  } | null;
}

function statusOf(state: EvidenceReadState): ContextEvidenceReadStatus {
  // Legacy callers may provide boolean state; the real hooks expose readStatus.
  return (
    state.readStatus ??
    (state.isError
      ? "error"
      : state.isLoading
        ? "loading"
        : state.isFetching
          ? "refreshing"
          : "success")
  );
}

export function buildAiDoctorContextReadView(input: ContextReadInput) {
  const reads = [input.timeline, ...(input.rootZone ? [input.rootZone] : [])];
  const statuses = reads.map(statusOf);
  if (input.manual) {
    statuses.push(
      input.manual.status === "error" || input.manual.status === "refresh_error"
        ? "error"
        : input.manual.status !== "success"
          ? "loading"
          : input.manual.refreshing
            ? "refreshing"
            : "success",
    );
  }
  const incomplete =
    input.timeline.companionEvidenceUnavailable === true ||
    input.timeline.auditEvidenceUnavailable === true;
  const status =
    statuses.includes("error") || incomplete
      ? "unavailable"
      : statuses.includes("paused")
        ? "paused"
        : statuses.includes("loading")
          ? "loading"
          : statuses.includes("refreshing")
            ? "refreshing"
            : "ready";
  const hasCachedEvidence =
    reads.some((read) => read.hasData && statusOf(read) !== "success") ||
    input.manual?.status === "refresh_error";
  const message =
    status === "unavailable"
      ? "Some context is unavailable. Retry to check the complete summary."
      : status === "paused"
        ? "Waiting for connection to check recent context."
        : status === "loading"
          ? "Loading recent context…"
          : status === "refreshing"
            ? "Refreshing recent context…"
            : null;
  return {
    status,
    showAssessment: status === "ready",
    canRetry: status === "unavailable",
    message,
    cachedNotice: hasCachedEvidence
      ? "Previously loaded evidence is shown where available; the complete summary has not been verified."
      : null,
  };
}
