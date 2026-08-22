import {
  GROW_WALK_CONTRADICTION_CODES,
  GROW_WALK_MISSING_EVIDENCE_CODES,
  GROW_WALK_REASON_CODES,
  type GrowWalkAiDoctorEvidence,
  type GrowWalkAlertEvidence,
  type GrowWalkContradictionCode,
  type GrowWalkEvidenceConfidence,
  type GrowWalkEvidenceDerivation,
  type GrowWalkEventEvidence,
  type GrowWalkMissingEvidenceCode,
  type GrowWalkPhotoMetadata,
  type GrowWalkReasonCode,
  type GrowWalkSensorEvidence,
} from "./growWalkContracts";

const HOUR_MS = 60 * 60 * 1000;
const RECENT_LOG_WINDOW_MS = 36 * HOUR_MS;
const MAJOR_CHANGE_WINDOW_MS = 48 * HOUR_MS;
/**
 * Context readers must retain this much event history even when callers ask
 * for the minimum display window, because the evidence rules below use it.
 */
export const GROW_WALK_EVENT_EVIDENCE_HISTORY_HOURS = 48;
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

export interface GrowWalkEvidenceInput {
  readonly now: string | number | Date;
  readonly stage?: string | null;
  readonly plantStatus?: string | null;
  readonly plantType?: string | null;
  readonly medium?: string | null;
  readonly potSize?: string | null;
  /**
   * Bounded internal event history for rules with a fixed 36/48-hour window.
   * It is not itself a public context-output lane.
   */
  readonly fixedWindowEvents?: readonly GrowWalkEventEvidence[];
  readonly recentEvents: readonly GrowWalkEventEvidence[];
  readonly sensors: GrowWalkSensorEvidence;
  readonly photos: readonly GrowWalkPhotoMetadata[];
  readonly alerts: readonly GrowWalkAlertEvidence[];
  readonly aiDoctor: GrowWalkAiDoctorEvidence | null;
}

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isUsableTimestamp(ms: number | null, nowMs: number): ms is number {
  return ms !== null && ms <= nowMs + FUTURE_TOLERANCE_MS;
}

function latestIso(
  values: readonly { readonly iso: string; readonly ms: number }[],
): string | null {
  if (values.length === 0) return null;
  return values.reduce((latest, current) => (current.ms > latest.ms ? current : latest)).iso;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isObservationEvent(event: GrowWalkEventEvidence): boolean {
  const type = normalize(event.eventType);
  return type === "observation" || type === "response" || event.response !== null;
}

function orderedCodes<T extends string>(
  allowed: readonly T[],
  found: ReadonlySet<T>,
): readonly T[] {
  return Object.freeze(allowed.filter((code) => found.has(code)));
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isActiveAlert(alert: GrowWalkAlertEvidence): boolean {
  const status = normalize(alert.status);
  return status === "open" || status === "acknowledged";
}

function isHumidityAlert(alert: GrowWalkAlertEvidence): boolean {
  if (normalize(alert.metric) === "humidity_pct") return true;
  return `${alert.title} ${alert.reasonExcerpt}`.toLowerCase().includes("humidity");
}

function isStaleOrInvalidReading(reading: GrowWalkSensorEvidence["readings"][string]): boolean {
  const source = normalize(reading.source);
  const quality = normalize(reading.quality);
  return (
    reading.freshness === "stale" ||
    reading.freshness === "invalid" ||
    source === "stale" ||
    source === "invalid" ||
    quality === "stale" ||
    quality === "invalid"
  );
}

function readingTimestamp(reading: GrowWalkSensorEvidence["readings"][string]): string {
  return reading.captured_at ?? reading.ts;
}

function deriveConfidence(input: {
  hasCurrentLive: boolean;
  hasRecentLog: boolean;
  profileIncomplete: boolean;
  sensorUnavailable: boolean;
  contradictionCount: number;
  highAlertCount: number;
  missingCount: number;
}): GrowWalkEvidenceConfidence {
  if (
    input.sensorUnavailable ||
    input.contradictionCount > 0 ||
    (!input.hasCurrentLive && !input.hasRecentLog) ||
    input.missingCount >= 5
  ) {
    return "low";
  }
  if (
    input.hasCurrentLive &&
    input.hasRecentLog &&
    !input.profileIncomplete &&
    input.highAlertCount === 0
  ) {
    return "high";
  }
  return "medium";
}

/**
 * Derive source-labeled scouting evidence only. It never diagnoses, writes,
 * invokes AI, changes Action Queue state, or controls devices.
 */
export function deriveGrowWalkEvidence(input: GrowWalkEvidenceInput): GrowWalkEvidenceDerivation {
  const nowMs = toMs(input.now) ?? 0;
  const reasons = new Set<GrowWalkReasonCode>();
  const missing = new Set<GrowWalkMissingEvidenceCode>();
  const contradictions = new Set<GrowWalkContradictionCode>();

  const validEventsFor = (events: readonly GrowWalkEventEvidence[]) => {
    const validEvents: Array<{ event: GrowWalkEventEvidence; iso: string; ms: number }> = [];
    for (const event of events) {
      const ms = toMs(event.occurredAt);
      if (!isUsableTimestamp(ms, nowMs)) {
        contradictions.add("future_or_malformed_timestamp");
        continue;
      }
      validEvents.push({ event, iso: event.occurredAt, ms });
    }
    return validEvents;
  };
  const validEvents = validEventsFor(input.recentEvents);
  const validFixedWindowEvents = input.fixedWindowEvents
    ? validEventsFor(input.fixedWindowEvents)
    : validEvents;

  const validPhotos: Array<{ photo: GrowWalkPhotoMetadata; iso: string; ms: number }> = [];
  for (const photo of input.photos) {
    const ms = toMs(photo.capturedAt);
    if (!isUsableTimestamp(ms, nowMs)) {
      contradictions.add("future_or_malformed_timestamp");
      continue;
    }
    validPhotos.push({ photo, iso: photo.capturedAt, ms });
  }

  const validAlerts: Array<{ alert: GrowWalkAlertEvidence; iso: string; ms: number }> = [];
  for (const alert of input.alerts) {
    const ms = toMs(alert.lastSeenAt);
    if (!isUsableTimestamp(ms, nowMs)) {
      contradictions.add("future_or_malformed_timestamp");
      continue;
    }
    validAlerts.push({ alert, iso: alert.lastSeenAt, ms });
  }

  if (input.aiDoctor && !isUsableTimestamp(toMs(input.aiDoctor.completedAt), nowMs)) {
    contradictions.add("future_or_malformed_timestamp");
  }

  const readings = Object.values(input.sensors.readings);
  for (const reading of readings) {
    if (!isUsableTimestamp(toMs(readingTimestamp(reading)), nowMs)) {
      contradictions.add("future_or_malformed_timestamp");
    }
  }
  if ((input.sensors.contradictionMetrics?.length ?? 0) > 0) {
    contradictions.add("sensor_sources_disagree");
  }

  const recentLogEvents = validFixedWindowEvents.filter(
    ({ ms }) => ms <= nowMs && nowMs - ms <= RECENT_LOG_WINDOW_MS,
  );
  const hasRecentLog = recentLogEvents.length > 0;
  if (!hasRecentLog) missing.add("no_recent_grower_log");

  const fixedWindowMajorChanges = validFixedWindowEvents.filter(
    ({ event, ms }) => event.isMajorChange && ms <= nowMs && nowMs - ms <= MAJOR_CHANGE_WINDOW_MS,
  );
  const recentMajorChangeCount48h = fixedWindowMajorChanges.length;
  const latestMajorChangeAt = latestIso(fixedWindowMajorChanges);
  const latestFixedWindowMajorChangeMs = fixedWindowMajorChanges.reduce<number | null>(
    (latest, current) => (latest === null || current.ms > latest ? current.ms : latest),
    null,
  );
  if (recentMajorChangeCount48h >= 3) reasons.add("stacked_major_changes_48h");

  const observations = validEvents.filter(({ event }) => isObservationEvent(event));
  const latestObservationAt = latestIso(observations);
  const fixedWindowObservations = validFixedWindowEvents.filter(({ event }) =>
    isObservationEvent(event),
  );
  const hasPostInterventionObservation =
    latestFixedWindowMajorChangeMs === null ||
    fixedWindowObservations.some(({ ms }) => ms > latestFixedWindowMajorChangeMs);
  if (!hasPostInterventionObservation) {
    reasons.add("missing_post_intervention_observation");
    missing.add("no_post_intervention_observation");
  }

  const worsening = validEvents.filter(({ event }) => event.response === "worse");
  if (worsening.length > 0) reasons.add("worsening_observation");

  // A stored photo receipt is metadata only; no visual content was inspected.
  missing.add("no_current_visual_evidence");
  if (
    latestFixedWindowMajorChangeMs !== null &&
    validPhotos.length > 0 &&
    validPhotos.every(({ ms }) => ms < latestFixedWindowMajorChangeMs)
  ) {
    missing.add("photo_predates_latest_major_change");
  }

  const hasCurrentLive = readings.some((reading) => reading.current_live === true);
  if (!input.sensors.available) {
    missing.add("sensor_lane_unavailable");
  } else if (!hasCurrentLive) {
    missing.add("sensor_lane_not_current_live");
  }

  const profileIncomplete =
    !hasText(input.stage) ||
    (hasText(input.plantType) && (!hasText(input.medium) || !hasText(input.potSize)));
  if (profileIncomplete) missing.add("plant_profile_incomplete");

  const activeHighAlerts = validAlerts.filter(
    ({ alert }) => alert.severity === "high" && isActiveAlert(alert),
  );
  if (activeHighAlerts.length > 0) reasons.add("active_high_alert_needs_confirmation");

  if (
    normalize(input.stage).includes("flower") &&
    activeHighAlerts.some(({ alert }) => isHumidityAlert(alert))
  ) {
    reasons.add("flower_humidity_alert_needs_inspection");
  }

  const hasProblemPeriod =
    activeHighAlerts.length > 0 || recentMajorChangeCount48h > 0 || worsening.length > 0;
  const staleOrInvalidSensor = readings.some(isStaleOrInvalidReading);
  if (hasProblemPeriod && staleOrInvalidSensor) {
    reasons.add("stale_or_invalid_sensor_during_problem");
  }
  if (contradictions.size > 0) reasons.add("contradictory_evidence");

  const adverseLaneCount = [
    activeHighAlerts.length > 0,
    worsening.length > 0,
    hasProblemPeriod && staleOrInvalidSensor,
    contradictions.size > 0,
  ].filter(Boolean).length;
  if (adverseLaneCount >= 2) reasons.add("multiple_adverse_evidence_lanes");

  const plantStatus = normalize(input.plantStatus);
  const recoveringOrStressed =
    plantStatus.includes("recover") ||
    plantStatus.includes("stress") ||
    plantStatus.includes("issue") ||
    plantStatus.includes("damage");
  if (recoveringOrStressed && adverseLaneCount > 0) {
    reasons.add("stressed_or_recovering_with_adverse_change");
  }

  const latestAdverseEvidenceAt = latestIso(
    [...worsening, ...activeHighAlerts].map(({ iso, ms }) => ({ iso, ms })),
  );
  const reasonCodes = orderedCodes(GROW_WALK_REASON_CODES, reasons);
  const missingEvidenceCodes = orderedCodes(GROW_WALK_MISSING_EVIDENCE_CODES, missing);
  const contradictionCodes = orderedCodes(GROW_WALK_CONTRADICTION_CODES, contradictions);

  return Object.freeze({
    reasonCodes,
    missingEvidenceCodes,
    contradictionCodes,
    recentMajorChangeCount48h,
    latestMajorChangeAt,
    latestObservationAt,
    latestAdverseEvidenceAt,
    evidenceConfidence: deriveConfidence({
      hasCurrentLive,
      hasRecentLog,
      profileIncomplete,
      sensorUnavailable: !input.sensors.available,
      contradictionCount: contradictionCodes.length,
      highAlertCount: activeHighAlerts.length,
      missingCount: missingEvidenceCodes.length,
    }),
  });
}
