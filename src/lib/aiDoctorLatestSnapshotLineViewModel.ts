import { formatDistance } from "date-fns";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";

/** Shown instead of a relative time when the newest snapshot is future-dated. */
export const AI_DOCTOR_LATEST_SNAPSHOT_FUTURE_COPY =
  "dated in the future, so its age is unknown" as const;

/**
 * The value after "Latest manual sensor snapshot:" on the AI Doctor context
 * panel. A snapshot dated beyond MANUAL_SNAPSHOT_FUTURE_SKEW_MS has no known
 * age (evaluateAiDoctorContext sets `manualSnapshotFutureDated`), so it never
 * gets a relative time such as "in 1 day". Returns null when there is no
 * usable timestamp.
 */
export function buildAiDoctorLatestSnapshotLine(
  latest: Pick<AiDoctorContextResult["latest"], "manualSnapshotAt" | "manualSnapshotFutureDated">,
  now: number,
): string | null {
  if (!latest.manualSnapshotAt) return null;
  if (latest.manualSnapshotFutureDated) return AI_DOCTOR_LATEST_SNAPSHOT_FUTURE_COPY;
  const t = Date.parse(latest.manualSnapshotAt);
  if (!Number.isFinite(t)) return null;
  return formatDistance(t, now, { addSuffix: true });
}
