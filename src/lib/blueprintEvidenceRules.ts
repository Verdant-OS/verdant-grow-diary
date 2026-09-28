import { describeCurrentStateStaleWindow, isCurrentStateStale } from "@/lib/sensorTruthCanon";

export interface BlueprintReadState {
  status?: "idle" | "loading" | "ok" | "unavailable";
  readStatus?: "loading" | "paused" | "refreshing" | "error" | "success";
  isLoading?: boolean;
  isFetching?: boolean;
  isPaused?: boolean;
  isError?: boolean;
}

export interface BlueprintEvidenceState {
  canScore: boolean;
  notice: string | null;
  retryable: boolean;
}

/** Only completed reads establish evidence. Cached values remain display context. */
export function resolveBlueprintReadState(
  state: BlueprintReadState | null | undefined,
  label: "Sensor" | "Feeding",
): BlueprintEvidenceState {
  if (state?.isError || state?.status === "unavailable" || state?.readStatus === "error") {
    return {
      canScore: false,
      notice: `${label} evidence is unavailable. Current scoring is withheld.`,
      retryable: true,
    };
  }
  if (state?.isPaused || state?.readStatus === "paused") {
    return {
      canScore: false,
      notice: `Waiting for connection to verify ${label.toLowerCase()} evidence. Values shown are not scored.`,
      retryable: false,
    };
  }
  if (
    state?.isLoading ||
    state?.status === "loading" ||
    state?.status === "idle" ||
    state?.readStatus === "loading"
  ) {
    return {
      canScore: false,
      notice: `Loading ${label.toLowerCase()} evidence…`,
      retryable: false,
    };
  }
  if (state?.isFetching || state?.readStatus === "refreshing") {
    return {
      canScore: false,
      notice: `Refreshing ${label.toLowerCase()} evidence. Values shown are unconfirmed and not scored.`,
      retryable: false,
    };
  }
  return { canScore: true, notice: null, retryable: false };
}

/** Pure source/age gate; unknown timestamps cannot establish current evidence. */
export function resolveBlueprintSensorEvidence(
  snapshot: { source?: string | null; ts?: string | null } | null | undefined,
  read: BlueprintReadState | null | undefined,
  now: number | undefined,
  hasTent = true,
): BlueprintEvidenceState {
  if (!hasTent)
    return {
      canScore: false,
      notice: "Assign this plant to a tent to score its sensor evidence.",
      retryable: false,
    };
  const readState = resolveBlueprintReadState(read, "Sensor");
  if (!readState.canScore) return readState;
  if (!snapshot || snapshot.source === "unavailable") {
    return {
      canScore: false,
      notice: "No sensor evidence is available for this tent.",
      retryable: false,
    };
  }
  if (snapshot.source !== "live" && snapshot.source !== "manual") {
    return {
      canScore: false,
      notice:
        "Sensor evidence is historical or unverified. Values are shown for context, not scored as current.",
      retryable: false,
    };
  }
  const capturedAt = typeof snapshot.ts === "string" ? Date.parse(snapshot.ts) : NaN;
  if (
    typeof now !== "number" ||
    !Number.isFinite(now) ||
    !Number.isFinite(capturedAt) ||
    capturedAt > now
  ) {
    return {
      canScore: false,
      notice: "Sensor capture time is missing or invalid. Current scoring is withheld.",
      retryable: false,
    };
  }
  if (isCurrentStateStale(snapshot.ts, { now, source: snapshot.source })) {
    return {
      canScore: false,
      notice: `Stale sensor evidence (${describeCurrentStateStaleWindow(snapshot.source)}). Values are shown for context, not scored as current.`,
      retryable: false,
    };
  }
  return { canScore: true, notice: null, retryable: false };
}
