/** Pure evidence selection for advisory diary actions. No reads or writes. */
import {
  isDashboardSensorEvidenceRow,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import {
  snapshotFromDiary,
  snapshotFromEnvironmentCheck,
  snapshotFromManualSensorSnapshot,
} from "@/lib/sensorSnapshot";
import {
  isGuidedChecklistReadingFresh,
  type GuidedChecklistSensorReading,
} from "@/lib/guidedActionChecklistRules";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export interface GuidedChecklistRead {
  data?: unknown;
  isError?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  fetchStatus?: string;
}
export type GuidedChecklistReadState = "ready" | "pending" | "paused" | "error";

/** Cached data cannot establish a successful refresh, nor can defaults establish an empty read. */
export function resolveGuidedChecklistReadState(
  reads: readonly GuidedChecklistRead[],
  alertsStatus: string,
): GuidedChecklistReadState {
  if (
    alertsStatus === "unavailable" ||
    reads.some((r) => r.isError || (r.data !== undefined && !Array.isArray(r.data)))
  )
    return "error";
  if (reads.some((r) => r.fetchStatus === "paused")) return "paused";
  if (
    alertsStatus !== "ok" ||
    reads.some((r) => r.isPending || r.isLoading || r.isFetching || !Array.isArray(r.data))
  )
    return "pending";
  return "ready";
}

export function selectGuidedChecklistEvidence(input: {
  now: number;
  growId: string | null;
  tentIds: readonly string[] | null | undefined;
  readings: readonly unknown[] | null | undefined;
  diaryEntries: readonly unknown[] | null | undefined;
}): Record<string, GuidedChecklistSensorReading | null> {
  const selected: Record<string, GuidedChecklistSensorReading | null> = Object.fromEntries(
    (input.tentIds ?? []).map((id) => [id, null]),
  );
  if (!input.growId) return selected;
  const offer = (tentId: string | null, candidate: GuidedChecklistSensorReading) => {
    if (!tentId || !Object.hasOwn(selected, tentId)) return;
    const prior = selected[tentId];
    // A newer unusable candidate must not hide a still-current manual survivor.
    const rank = (r: GuidedChecklistSensorReading) =>
      isGuidedChecklistReadingFresh(r, input.now) ? 1 : 0;
    const time = (r: GuidedChecklistSensorReading) => {
      const ms = Date.parse(r.capturedAt ?? "");
      return Number.isFinite(ms) ? ms : -Infinity;
    };
    if (
      !prior ||
      rank(candidate) > rank(prior) ||
      (rank(candidate) === rank(prior) &&
        (time(candidate) > time(prior) ||
          (time(candidate) === time(prior) && (candidate.source ?? "") < (prior.source ?? ""))))
    )
      selected[tentId] = candidate;
  };
  for (const value of input.readings ?? []) {
    const row = record(value);
    if (!row || !isDashboardSensorEvidenceRow(row as unknown as DashboardSensorEvidenceRow))
      continue;
    const numeric =
      typeof row.value === "number"
        ? row.value
        : typeof row.value === "string" && row.value.trim()
          ? Number(row.value)
          : NaN;
    if (!Number.isFinite(numeric) || typeof row.metric !== "string" || !row.metric.trim()) continue;
    const source = text(row.source)?.trim().toLowerCase() ?? null;
    offer(text(row.tent_id), {
      capturedAt: resolveSensorObservationTime(row),
      source: source === "pi_bridge" ? "live" : source,
      quality: "ok",
    });
  }
  for (const value of input.diaryEntries ?? []) {
    const row = record(value);
    if (!row || row.grow_id !== input.growId || row.retracted_at != null) continue;
    const details = record(row.details);
    if (!details) continue;
    const entryAt = text(row.entry_at);
    const candidates = [
      snapshotFromManualSensorSnapshot(entryAt, record(details.manual_sensor_snapshot)),
      snapshotFromEnvironmentCheck(entryAt, record(details.environment_check)),
      snapshotFromDiary(entryAt, record(details.sensor_snapshot)),
    ];
    for (const snapshot of candidates) {
      if (
        !snapshot ||
        ![
          snapshot.temp,
          snapshot.rh,
          snapshot.vpd,
          snapshot.co2,
          snapshot.soil,
          snapshot.soil_ec,
          snapshot.soil_temp,
          snapshot.ppfd,
        ].some((v) => typeof v === "number" && Number.isFinite(v))
      )
        continue;
      offer(text(row.tent_id), { capturedAt: snapshot.ts, source: snapshot.source, quality: "ok" });
    }
  }
  return selected;
}
