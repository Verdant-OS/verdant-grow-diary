import type { SensorSnapshot } from "@/lib/sensorSnapshot";

interface SnapshotReadState {
  readonly status: "idle" | "loading" | "ok" | "unavailable";
  readonly snapshot: SensorSnapshot;
  readonly isFetching?: boolean;
  readonly isPaused?: boolean;
}

/** Cached values remain display context, not a completed current evidence read. */
export function buildSensorSnapshotReadState(state: SnapshotReadState | null | undefined): {
  confirmedSnapshot: SensorSnapshot | null;
  pendingNotice: string | null;
} {
  if (state?.status === "unavailable") return { confirmedSnapshot: null, pendingNotice: null };
  const hasCached = state?.status === "ok" && state.snapshot.source !== "unavailable";
  if (state?.isPaused) {
    return {
      confirmedSnapshot: null,
      pendingNotice: hasCached
        ? "Waiting for connection. Last loaded readings are shown; current sensor evidence is unconfirmed."
        : "Waiting for connection. Sensor evidence has not loaded yet.",
    };
  }
  if (!state || state.status !== "ok" || state.isFetching) {
    return {
      confirmedSnapshot: null,
      pendingNotice: hasCached
        ? "Refreshing sensor data. Last loaded readings are shown until this check completes."
        : "Loading sensor data…",
    };
  }
  return { confirmedSnapshot: state.snapshot, pendingNotice: null };
}
