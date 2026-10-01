export interface AssignTentListingReadInput {
  isPending?: boolean;
  isError?: boolean;
}

export interface AssignTentListingReadState {
  status: "loading" | "unavailable" | "ready";
  message: string | null;
  canChoose: boolean;
}

/** Failed reads stay unavailable even when the query retains cached destinations. */
export function buildAssignTentListingReadState(
  input?: AssignTentListingReadInput | null,
): AssignTentListingReadState {
  if (input?.isError) {
    return {
      status: "unavailable",
      message: "Tent destinations are unavailable. Retry to load them.",
      canChoose: false,
    };
  }
  if (input?.isPending !== false) {
    return { status: "loading", message: "Loading…", canChoose: false };
  }
  return { status: "ready", message: null, canChoose: true };
}
