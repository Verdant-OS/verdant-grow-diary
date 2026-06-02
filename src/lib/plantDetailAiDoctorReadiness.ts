/**
 * plantDetailAiDoctorReadiness — pure view-model for the Plant Detail
 * "AI Doctor readiness" card.
 *
 * Deterministic. No React, no I/O, no fetch, no privileged keys, no
 * writes, no AI calls. Consumes already-loaded Plant Detail signals and
 * projects a cautious readiness state with up to 3 missing context
 * bullets.
 *
 * The AI Doctor readiness card does not promise diagnosis certainty and
 * does not imply that a single photo is sufficient. It simply tells the
 * grower whether enough plant memory exists for a useful check-in.
 */

export type AiDoctorReadinessLevel = "ready" | "partial" | "empty";

export type AiDoctorMissingKind =
  | "stage_unknown"
  | "no_timeline"
  | "no_photo"
  | "no_sensor_snapshot"
  | "no_watering_or_feed";

export interface AiDoctorReadinessMissingBullet {
  kind: AiDoctorMissingKind;
  label: string;
}

export interface AiDoctorReadinessResult {
  level: AiDoctorReadinessLevel;
  /** Cautious headline for the card. Never promises certainty. */
  headline: string;
  /** Short subhead explaining what the level means. */
  subhead: string;
  /** Up to 3 missing-context bullets. Empty when ready. */
  missing: AiDoctorReadinessMissingBullet[];
  /** Total number of present signals (0–5). */
  presentCount: number;
  /** Total number of evaluated signals (always 5). */
  totalSignals: number;
  /** Sensor evidence breakdown from the shared contract. */
  sensorEvidence: AiDoctorSensorEvidence;
}

export interface PlantDetailAiDoctorReadinessInput {
  /** Current plant stage value (null/undefined/empty/unknown counts as missing). */
  stage?: string | null;
  /** True when at least one recent timeline/activity entry exists. */
  hasTimelineEntries: boolean;
  /** True when a recent photo exists for this plant. */
  hasRecentPhoto: boolean;
  /**
   * True when a recent activity includes a sensor snapshot. NOTE: when
   * `sensorSnapshot` is provided, the shared contract gates this flag —
   * only `usable` counts as healthy evidence. Stale / invalid /
   * needs_review / no_data do NOT count.
   */
  hasSensorSnapshot: boolean;
  /** True when at least one recent activity entry is watering or feeding. */
  hasRecentWateringOrFeed: boolean;
  /**
   * Optional shared-contract classification of the most recent sensor
   * snapshot. When provided, it overrides `hasSensorSnapshot` for the
   * healthy-evidence count and drives the cautionary/unsafe surface.
   */
  sensorSnapshot?: import("@/lib/sensorSnapshotStatusContract").Classification | null;
}

export type AiDoctorSensorEvidenceMode =
  | "healthy"
  | "cautionary"
  | "unsafe"
  | "missing"
  | "unknown";

export interface AiDoctorSensorEvidence {
  mode: AiDoctorSensorEvidenceMode;
  status: import("@/lib/sensorSnapshotStatusContract").SnapshotStatus | null;
  reason: import("@/lib/sensorSnapshotStatusContract").SnapshotReason | null;
  /** True only when `status === "usable"`. */
  countsAsHealthyEvidence: boolean;
  /** True when status === "stale" — show as cautionary context only. */
  isCautionary: boolean;
  /** True when status is invalid or needs_review — never use for recommendations. */
  isUnsafe: boolean;
  /** True when status is no_data or no classification provided. */
  isMissing: boolean;
  /** Short, presenter-safe label. */
  label: string;
}

const TOTAL_SIGNALS = 5;

const MISSING_BULLETS: Record<AiDoctorMissingKind, string> = {
  stage_unknown: "Plant stage not set",
  no_timeline: "No recent timeline entries",
  no_photo: "No recent photo",
  no_sensor_snapshot: "No sensor snapshot",
  no_watering_or_feed: "No recent watering or feed note",
};

function isStageKnown(stage: string | null | undefined): boolean {
  if (stage == null) return false;
  const s = stage.toString().trim().toLowerCase();
  return s !== "" && s !== "unknown";
}

function evaluateSensorEvidence(
  input: PlantDetailAiDoctorReadinessInput,
): AiDoctorSensorEvidence {
  const snap = input.sensorSnapshot ?? null;
  if (!snap) {
    if (input.hasSensorSnapshot) {
      return {
        mode: "unknown",
        status: null,
        reason: null,
        countsAsHealthyEvidence: true,
        isCautionary: false,
        isUnsafe: false,
        isMissing: false,
        label: "Sensor snapshot present",
      };
    }
    return {
      mode: "missing",
      status: "no_data",
      reason: "no_rows",
      countsAsHealthyEvidence: false,
      isCautionary: false,
      isUnsafe: false,
      isMissing: true,
      label: "No sensor snapshot",
    };
  }
  const healthy = snap.status === "usable";
  const cautionary = snap.status === "stale";
  const unsafe = snap.status === "invalid" || snap.status === "needs_review";
  const missing = snap.status === "no_data";
  let mode: AiDoctorSensorEvidenceMode = "unknown";
  let label = snap.label;
  if (healthy) mode = "healthy";
  else if (cautionary) {
    mode = "cautionary";
    label = "Sensor snapshot is outside the stale window — cautionary context only.";
  } else if (unsafe) {
    mode = "unsafe";
    label =
      snap.status === "invalid"
        ? "Sensor snapshot rejected as invalid — not used for recommendations."
        : "Sensor snapshot needs review — not used for recommendations.";
  } else if (missing) {
    mode = "missing";
    label = "No sensor snapshot.";
  }
  return {
    mode,
    status: snap.status,
    reason: snap.reason,
    countsAsHealthyEvidence: healthy,
    isCautionary: cautionary,
    isUnsafe: unsafe,
    isMissing: missing,
    label,
  };
}

function countPresent(
  input: PlantDetailAiDoctorReadinessInput,
  sensorEvidence: AiDoctorSensorEvidence,
): number {
  let count = 0;
  if (isStageKnown(input.stage)) count++;
  if (input.hasTimelineEntries) count++;
  if (input.hasRecentPhoto) count++;
  // Sensor signal is gated by the shared contract: only `usable` counts.
  if (sensorEvidence.countsAsHealthyEvidence) count++;
  if (input.hasRecentWateringOrFeed) count++;
  return count;
}

function buildMissing(
  input: PlantDetailAiDoctorReadinessInput,
): AiDoctorReadinessMissingBullet[] {
  const out: AiDoctorReadinessMissingBullet[] = [];
  if (!isStageKnown(input.stage)) {
    out.push({ kind: "stage_unknown", label: MISSING_BULLETS.stage_unknown });
  }
  if (!input.hasTimelineEntries) {
    out.push({ kind: "no_timeline", label: MISSING_BULLETS.no_timeline });
  }
  if (!input.hasRecentPhoto) {
    out.push({ kind: "no_photo", label: MISSING_BULLETS.no_photo });
  }
  if (!input.hasSensorSnapshot) {
    out.push({ kind: "no_sensor_snapshot", label: MISSING_BULLETS.no_sensor_snapshot });
  }
  if (!input.hasRecentWateringOrFeed) {
    out.push({ kind: "no_watering_or_feed", label: MISSING_BULLETS.no_watering_or_feed });
  }
  return out.slice(0, 3);
}

function levelFromCount(count: number): AiDoctorReadinessLevel {
  if (count >= 4) return "ready";
  if (count >= 2) return "partial";
  return "empty";
}

function headlineForLevel(level: AiDoctorReadinessLevel, presentCount: number): string {
  switch (level) {
    case "ready":
      return "Ready for check-in";
    case "partial":
      return "More context helpful";
    case "empty":
      return "Not enough context yet";
    default:
      return "Not enough context yet";
  }
}

function subheadForLevel(level: AiDoctorReadinessLevel, presentCount: number): string {
  switch (level) {
    case "ready":
      return `${presentCount} of ${TOTAL_SIGNALS} memory signals present. AI Doctor can use this context for a cautious review.`;
    case "partial":
      return `${presentCount} of ${TOTAL_SIGNALS} memory signals present. Adding more context improves check-in quality.`;
    case "empty":
      return "Add a note, photo, or manual sensor snapshot first for a better check-in.";
    default:
      return "Add a note, photo, or manual sensor snapshot first for a better check-in.";
  }
}

/**
 * Build the AI Doctor readiness result for Plant Detail.
 *
 * Returns a cautious readiness level, headline, subhead, and up to 3
 * missing-context bullets. Never promises diagnosis certainty.
 */
export function buildPlantDetailAiDoctorReadiness(
  input: PlantDetailAiDoctorReadinessInput,
): AiDoctorReadinessResult {
  const sensorEvidence = evaluateSensorEvidence(input);
  // Mirror the gated sensor signal into hasSensorSnapshot for buildMissing.
  const gatedInput: PlantDetailAiDoctorReadinessInput = {
    ...input,
    hasSensorSnapshot: sensorEvidence.countsAsHealthyEvidence,
  };
  const presentCount = countPresent(gatedInput, sensorEvidence);
  const level = levelFromCount(presentCount);
  const missing = buildMissing(gatedInput);

  return {
    level,
    headline: headlineForLevel(level, presentCount),
    subhead: subheadForLevel(level, presentCount),
    missing,
    presentCount,
    totalSignals: TOTAL_SIGNALS,
    sensorEvidence,
  };
}
