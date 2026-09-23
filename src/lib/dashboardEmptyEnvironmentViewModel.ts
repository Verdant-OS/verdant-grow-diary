import { buildSensorSnapshotReadState } from "@/lib/sensorSnapshotReadStateRules";

type EvidenceState = Parameters<typeof buildSensorSnapshotReadState>[0];
type Tent = { readonly id: string; readonly name: string };

export interface DashboardEmptyEnvironmentModel {
  kind: "empty" | "evidence" | "pending" | "error";
  heading: string;
  description: string;
}

/** Sensor-history emptiness cannot establish absence of saved diary evidence. */
export function buildDashboardEmptyEnvironmentViewModel(input: {
  scoped: boolean;
  state: EvidenceState;
  selectedTents: readonly Tent[] | null | undefined;
}): DashboardEmptyEnvironmentModel {
  const empty: DashboardEmptyEnvironmentModel = {
    kind: "empty",
    heading: "No sensor readings in this view",
    description:
      "No sensor-history readings were returned for these tents. Add a manual reading or review saved diary entries in the Timeline.",
  };
  // The diary-inclusive loader is intentionally disabled without a grow.
  if (!input.scoped) return empty;
  if (input.state?.status === "unavailable") {
    return {
      kind: "error",
      heading: "Environment evidence unavailable",
      description: "Sensor history is empty, but saved environment evidence could not be checked.",
    };
  }
  const read = buildSensorSnapshotReadState(input.state);
  if (read.pendingNotice) {
    return {
      kind: "pending",
      heading: "Checking saved environment evidence",
      description: read.pendingNotice,
    };
  }
  const snapshot = read.confirmedSnapshot;
  const tent = input.selectedTents?.find((candidate) => candidate.id === snapshot?.tent_id);
  const hasValue =
    snapshot &&
    [
      snapshot.temp,
      snapshot.rh,
      snapshot.vpd,
      snapshot.co2,
      snapshot.soil,
      snapshot.soil_ec,
      snapshot.soil_temp,
      snapshot.ppfd,
    ].some((value) => typeof value === "number" && Number.isFinite(value));
  if (!tent || !snapshot || snapshot.source === "unavailable" || !hasValue) return empty;
  // This is an existence notice, not a freshness, quality or health claim.
  // Preserve the lower section's source/time/value presentation, including
  // stale evidence, rather than fabricating sensor-history rows or badges.
  return {
    kind: "evidence",
    heading: "Saved environment evidence available",
    description: `${tent.name} has a saved reading. Review its source, capture time and values in Latest Environment.`,
  };
}
