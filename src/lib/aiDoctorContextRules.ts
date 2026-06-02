/**
 * aiDoctorContextRules — pure, deterministic readiness rules for the
 * AI Doctor Context panel.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no globals.
 *  - Never claims a diagnosis. Only reports what context is available.
 *  - Demo / unknown / missing data NEVER produces "strong" readiness.
 *  - Output is deterministic given the same input + `now` injection.
 *
 * Buckets:
 *  - "strong"       — enough trustworthy context for a cautious AI Doctor review.
 *  - "partial"      — useful context, but key signals missing or stale.
 *  - "insufficient" — too little context to even ask the AI Doctor safely.
 *
 * The rules here are intentionally simpler than `aiContextSufficiencyRules`:
 * this is the user-facing readiness summary, not the AI confidence ceiling.
 */

export type AiDoctorContextReadiness = "strong" | "partial" | "insufficient";

export interface AiDoctorContextPlantInput {
  hasProfile: boolean;
  strain: string | null;
  stage: string | null;
  medium?: string | null;
  hasPlantPhoto?: boolean;
}

export interface AiDoctorContextEventInput {
  /** ISO timestamp string, epoch ms, or Date. */
  at: string | number | Date | null | undefined;
  /** Best-effort bucket tag from the timeline classification layer. */
  category?:
    | "notes"
    | "watering"
    | "feeding"
    | "photos"
    | "manual_sensor_snapshot"
    | "warnings"
    | "other"
    | null;
}

export interface AiDoctorContextManualSnapshotInput {
  at: string | number | Date | null | undefined;
  /** Severity carried by the manual snapshot card. */
  severity?: "ok" | "warning" | "invalid" | null;
}

export interface AiDoctorContextInput {
  plant: AiDoctorContextPlantInput | null;
  recentEvents?: readonly AiDoctorContextEventInput[];
  recentManualSnapshots?: readonly AiDoctorContextManualSnapshotInput[];
  /** Optional now injection for deterministic tests. */
  now?: number;
}

export interface AiDoctorContextCounts {
  recentEvents: number;
  recentWateringOrFeeding: number;
  recentManualSnapshots: number;
  recentWarnings: number;
}

export interface AiDoctorContextLatest {
  manualSnapshotAt: string | null;
}

export interface AiDoctorContextResult {
  readiness: AiDoctorContextReadiness;
  /** UI-safe short codes only. No raw payload values. */
  missing: string[];
  /** UI-safe short codes naming what evidence is present. */
  evidence: string[];
  counts: AiDoctorContextCounts;
  latest: AiDoctorContextLatest;
  safeNextStep: string;
  /** Always true: this panel never claims a diagnosis. */
  diagnosisClaimed: false;
}

export const AI_DOCTOR_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7d
export const AI_DOCTOR_SNAPSHOT_FRESH_MS = 48 * 60 * 60 * 1000; // 48h

const SAFE_NEXT_STEPS: Record<AiDoctorContextReadiness, string> = {
  insufficient: "Add a recent note, photo, and manual sensor snapshot.",
  partial: "Review recent logs and add missing environment or photo context.",
  strong: "Ready for a cautious AI Doctor review.",
};

function toEpoch(at: AiDoctorContextEventInput["at"]): number | null {
  if (at == null) return null;
  if (at instanceof Date) {
    const t = at.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof at === "number") return Number.isFinite(at) ? at : null;
  if (typeof at === "string") {
    const t = Date.parse(at);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function nonBlank(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

export function evaluateAiDoctorContext(
  input: AiDoctorContextInput | null | undefined,
): AiDoctorContextResult {
  const safe = input ?? { plant: null };
  const now =
    typeof safe.now === "number" && Number.isFinite(safe.now)
      ? safe.now
      : Date.now();

  const events = Array.isArray(safe.recentEvents) ? safe.recentEvents : [];
  const snaps = Array.isArray(safe.recentManualSnapshots)
    ? safe.recentManualSnapshots
    : [];

  // --- Recent events within the 7d window -------------------------------
  const recent = events.filter((e) => {
    const t = toEpoch(e?.at);
    return t != null && now - t <= AI_DOCTOR_RECENT_WINDOW_MS;
  });
  const recentWaterFeed = recent.filter(
    (e) => e.category === "watering" || e.category === "feeding",
  ).length;
  const recentWarnings = recent.filter((e) => e.category === "warnings").length;

  // --- Recent manual snapshots ------------------------------------------
  let latestSnapAt: number | null = null;
  let latestSnapIso: string | null = null;
  let recentSnaps = 0;
  let snapWarnings = 0;
  for (const s of snaps) {
    const t = toEpoch(s?.at);
    if (t == null) continue;
    if (now - t <= AI_DOCTOR_RECENT_WINDOW_MS) {
      recentSnaps += 1;
      if (s.severity === "warning" || s.severity === "invalid") {
        snapWarnings += 1;
      }
    }
    if (latestSnapAt == null || t > latestSnapAt) {
      latestSnapAt = t;
      latestSnapIso = typeof s.at === "string" ? s.at : new Date(t).toISOString();
    }
  }

  const counts: AiDoctorContextCounts = {
    recentEvents: recent.length,
    recentWateringOrFeeding: recentWaterFeed,
    recentManualSnapshots: recentSnaps,
    recentWarnings: recentWarnings + snapWarnings,
  };

  const missing: string[] = [];
  const evidence: string[] = [];

  // --- Plant profile ----------------------------------------------------
  const plant = safe.plant;
  if (!plant || !plant.hasProfile) {
    missing.push("plant-profile");
  } else {
    evidence.push("plant-profile");
    if (nonBlank(plant.strain)) evidence.push("strain");
    else missing.push("strain");

    if (nonBlank(plant.stage)) evidence.push("stage");
    else missing.push("stage");

    if (plant.medium !== undefined) {
      if (nonBlank(plant.medium)) evidence.push("medium");
      else missing.push("medium");
    }

    if (plant.hasPlantPhoto) evidence.push("plant-photo");
    else missing.push("plant-photo");
  }

  // --- Activity ---------------------------------------------------------
  if (recent.length >= 2) evidence.push("recent-timeline-activity");
  else missing.push("recent-timeline-activity");

  if (recentWaterFeed > 0) evidence.push("recent-watering-or-feeding");
  else missing.push("recent-watering-or-feeding");

  // --- Sensor snapshots -------------------------------------------------
  if (recentSnaps > 0) {
    evidence.push("recent-manual-sensor-snapshot");
    if (latestSnapAt != null && now - latestSnapAt <= AI_DOCTOR_SNAPSHOT_FRESH_MS) {
      evidence.push("fresh-manual-sensor-snapshot");
    }
  } else {
    missing.push("recent-manual-sensor-snapshot");
  }

  if (counts.recentWarnings > 0) evidence.push("recent-warnings");

  // --- Readiness --------------------------------------------------------
  const hasProfile = !!plant && plant.hasProfile;
  const hasStage = !!plant && nonBlank(plant.stage);
  const hasRecentActivity = recent.length >= 2;
  const hasRecentSnap = recentSnaps > 0;
  const freshSnap =
    latestSnapAt != null && now - latestSnapAt <= AI_DOCTOR_SNAPSHOT_FRESH_MS;
  const hasPhotoOrWaterFeed =
    (plant?.hasPlantPhoto ?? false) || recentWaterFeed > 0;

  let readiness: AiDoctorContextReadiness;
  if (!hasProfile || (!hasRecentActivity && !hasRecentSnap)) {
    readiness = "insufficient";
  } else if (
    hasProfile &&
    hasStage &&
    hasRecentActivity &&
    hasRecentSnap &&
    freshSnap &&
    hasPhotoOrWaterFeed
  ) {
    readiness = "strong";
  } else {
    readiness = "partial";
  }

  return {
    readiness,
    missing,
    evidence,
    counts,
    latest: { manualSnapshotAt: latestSnapIso },
    safeNextStep: SAFE_NEXT_STEPS[readiness],
    diagnosisClaimed: false,
  };
}

export const AI_DOCTOR_INSUFFICIENT_NOTICE =
  "More context needed before AI Doctor should give confident guidance.";
