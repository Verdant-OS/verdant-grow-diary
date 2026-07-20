/**
 * aiDoctorReviewEvidenceReceiptRules — privacy-bounded, deterministic receipt
 * for a server-validated AI Doctor request.
 *
 * The receipt deliberately records evidence availability and provenance, not
 * prompt text or user-entered measurement values. An exact prompt fingerprint
 * is recorded separately by the server finalizer.
 */
import type { AiDoctorReviewRequestPacket } from "./aiDoctorReviewRequestPacket";

export const AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION = 1 as const;
export const AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_MAX_BYTES = 65_536;

const COLLECTION_STATES = [
  "included",
  "none_available",
  "not_scoped",
  "omitted_by_choice",
] as const;
const REVIEW_MODES = ["standard", "historical_review"] as const;
const IMPORTED_HISTORY_SCOPES = ["tent_scoped", "not_scoped"] as const;
const ROOT_ZONE_HISTORY_SCOPES = ["plant_and_shared_tent", "plant_only", "not_scoped"] as const;
const READINESS_STATES = ["strong", "partial", "insufficient"] as const;
const EVENT_CATEGORIES = [
  "notes",
  "watering",
  "feeding",
  "photos",
  "manual_sensor_snapshot",
  "warnings",
  "other",
] as const;
const SNAPSHOT_SEVERITIES = ["ok", "warning", "invalid"] as const;
const SNAPSHOT_SOURCES = ["live", "manual", "csv", "demo", "stale", "invalid", "unknown"] as const;
const SNAPSHOT_TRUST_LEVELS = ["low", "medium", "high"] as const;
const ROOT_ZONE_EVENT_TYPES = ["watering", "feeding"] as const;
const ROOT_ZONE_SOURCES = ["manual", "csv", "demo", "stale", "invalid", "unknown"] as const;
const ROOT_ZONE_INVALID_FIELDS = [
  "volumeMl",
  "inputPh",
  "inputEcMsCm",
  "outputEcMsCm",
  "runoffMl",
  "runoffPh",
  "runoffEcMsCm",
  "waterTempC",
  "nutrientLine",
  "products",
] as const;
const ROOT_ZONE_MEASURED_FIELDS = [
  "volumeMl",
  "inputPh",
  "inputEcMsCm",
  "outputEcMsCm",
  "runoffMl",
  "runoffPh",
  "runoffEcMsCm",
  "waterTempC",
] as const;

export type AiDoctorReviewEvidenceCollectionState = (typeof COLLECTION_STATES)[number];
export type AiDoctorReviewEvidenceReviewMode = (typeof REVIEW_MODES)[number];
export type AiDoctorReviewImportedHistoryScope = (typeof IMPORTED_HISTORY_SCOPES)[number];
export type AiDoctorReviewRootZoneHistoryScope = (typeof ROOT_ZONE_HISTORY_SCOPES)[number];

type RootZoneMeasuredField = (typeof ROOT_ZONE_MEASURED_FIELDS)[number];

/**
 * Client-declared collection metadata. The server validates its exact shape,
 * but it never uses it to set eligibility, price, credit, or prompt content.
 */
export interface AiDoctorReviewEvidenceAcceptance {
  reviewMode: AiDoctorReviewEvidenceReviewMode;
  importedHistory: {
    state: AiDoctorReviewEvidenceCollectionState;
    scope: AiDoctorReviewImportedHistoryScope;
  };
  rootZoneHistory: {
    state: AiDoctorReviewEvidenceCollectionState;
    scope: AiDoctorReviewRootZoneHistoryScope;
  };
}

export interface BuildAiDoctorReviewEvidenceAcceptanceInput {
  reviewMode: AiDoctorReviewEvidenceReviewMode;
  importedHistory: {
    hasTentScope: boolean;
    included: boolean;
    omittedByChoice: boolean;
  };
  rootZoneHistory: {
    scope: AiDoctorReviewRootZoneHistoryScope;
    included: boolean;
    omittedByChoice: boolean;
  };
}

interface ReceiptRootZoneObservation {
  at: string;
  eventType: "watering" | "feeding";
  source: (typeof ROOT_ZONE_SOURCES)[number];
  measuredFields: RootZoneMeasuredField[];
  hasNutrientLine: boolean;
  productCount: number;
  invalidFields: Array<(typeof ROOT_ZONE_INVALID_FIELDS)[number]>;
}

export interface AiDoctorReviewEvidenceReceiptSnapshot {
  schemaVersion: typeof AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION;
  packetSchemaVersion: number;
  /** Null only when a rollout-compatible client did not send this metadata. */
  clientCollectionDecision: AiDoctorReviewEvidenceAcceptance | null;
  plantProfile: {
    hasStrain: boolean;
    hasStage: boolean;
    hasMedium: boolean;
    hasPotSize: boolean;
  };
  readiness: {
    state: (typeof READINESS_STATES)[number];
    evidenceCount: number;
    missingCount: number;
  };
  recentEvents: Array<{ at: string; category: (typeof EVENT_CATEGORIES)[number] }>;
  recentSensorSnapshot: {
    capturedAt: string;
    severity: (typeof SNAPSHOT_SEVERITIES)[number];
    readingCount: number;
  } | null;
  recentSensorSnapshotAnnotation: {
    source: (typeof SNAPSHOT_SOURCES)[number];
    stale: boolean;
    trust: (typeof SNAPSHOT_TRUST_LEVELS)[number];
    includesValues: boolean;
  } | null;
  importedSensorHistory: {
    totalReadings: number;
    dateRange: { earliest: string; latest: string } | null;
    metricCount: number;
    excludedQualityCount: number;
    suspiciousFlagCount: number;
  } | null;
  rootZoneObservations: ReceiptRootZoneObservation[];
  missingLiveSensorReadings: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isOneOf<const T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isSafeTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function isSafeCount(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function normalizeDecisionState(
  hasScope: boolean,
  included: boolean,
  omittedByChoice: boolean,
): AiDoctorReviewEvidenceCollectionState {
  if (!hasScope) return "not_scoped";
  if (omittedByChoice) return "omitted_by_choice";
  return included ? "included" : "none_available";
}

/** Builds the frozen, transport-safe collection disclosure for one manual review. */
export function buildAiDoctorReviewEvidenceAcceptance(
  input: BuildAiDoctorReviewEvidenceAcceptanceInput,
): AiDoctorReviewEvidenceAcceptance {
  const importedScope: AiDoctorReviewImportedHistoryScope = input.importedHistory.hasTentScope
    ? "tent_scoped"
    : "not_scoped";
  const rootZoneHasScope = input.rootZoneHistory.scope !== "not_scoped";

  return {
    reviewMode: input.reviewMode,
    importedHistory: {
      state: normalizeDecisionState(
        input.importedHistory.hasTentScope,
        input.importedHistory.included,
        input.importedHistory.omittedByChoice,
      ),
      scope: importedScope,
    },
    rootZoneHistory: {
      state: normalizeDecisionState(
        rootZoneHasScope,
        input.rootZoneHistory.included,
        input.rootZoneHistory.omittedByChoice,
      ),
      scope: input.rootZoneHistory.scope,
    },
  };
}

/** Reject malformed client collection metadata before it can enter a receipt. */
export function normalizeAiDoctorReviewEvidenceAcceptance(
  value: unknown,
): AiDoctorReviewEvidenceAcceptance | null {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["reviewMode", "importedHistory", "rootZoneHistory"])
  ) {
    return null;
  }
  if (!isOneOf(value.reviewMode, REVIEW_MODES)) return null;
  const importedHistory = isPlainRecord(value.importedHistory) ? value.importedHistory : null;
  const rootZoneHistory = isPlainRecord(value.rootZoneHistory) ? value.rootZoneHistory : null;
  if (
    !importedHistory ||
    !rootZoneHistory ||
    !hasExactKeys(importedHistory, ["state", "scope"]) ||
    !hasExactKeys(rootZoneHistory, ["state", "scope"]) ||
    !isOneOf(importedHistory.state, COLLECTION_STATES) ||
    !isOneOf(importedHistory.scope, IMPORTED_HISTORY_SCOPES) ||
    !isOneOf(rootZoneHistory.state, COLLECTION_STATES) ||
    !isOneOf(rootZoneHistory.scope, ROOT_ZONE_HISTORY_SCOPES)
  ) {
    return null;
  }

  if (
    (importedHistory.scope === "not_scoped" && importedHistory.state !== "not_scoped") ||
    (importedHistory.scope !== "not_scoped" && importedHistory.state === "not_scoped") ||
    (rootZoneHistory.scope === "not_scoped" && rootZoneHistory.state !== "not_scoped") ||
    (rootZoneHistory.scope !== "not_scoped" && rootZoneHistory.state === "not_scoped")
  ) {
    return null;
  }

  return {
    reviewMode: value.reviewMode,
    importedHistory: {
      state: importedHistory.state,
      scope: importedHistory.scope,
    },
    rootZoneHistory: {
      state: rootZoneHistory.state,
      scope: rootZoneHistory.scope,
    },
  };
}

/**
 * Ensures client-declared collection states cannot contradict the packet that
 * the server normalized. It intentionally does not influence eligibility,
 * credits, model choice, or prompt content.
 */
export function isAiDoctorReviewEvidenceAcceptanceCoherentWithPacket(
  packet: AiDoctorReviewRequestPacket,
  value: unknown,
): boolean {
  const decision = normalizeAiDoctorReviewEvidenceAcceptance(value);
  if (!decision) return false;

  const hasImportedHistory =
    packet.imported_sensor_history !== null && packet.imported_sensor_history !== undefined;
  const hasRootZoneHistory = (packet.recentRootZoneObservations?.length ?? 0) > 0;
  const importedIncluded = decision.importedHistory.state === "included";
  const rootZoneIncluded = decision.rootZoneHistory.state === "included";

  if (importedIncluded !== hasImportedHistory || rootZoneIncluded !== hasRootZoneHistory) {
    return false;
  }
  if (decision.importedHistory.scope === "not_scoped" && hasImportedHistory) return false;
  if (decision.rootZoneHistory.scope === "not_scoped" && hasRootZoneHistory) return false;
  return true;
}
function profileFieldPresent(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function receiptByteSize(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

function buildRootZoneObservationReceipt(
  observation: NonNullable<AiDoctorReviewRequestPacket["recentRootZoneObservations"]>[number],
): ReceiptRootZoneObservation | null {
  if (
    !isSafeTimestamp(observation.at) ||
    !isOneOf(observation.eventType, ROOT_ZONE_EVENT_TYPES) ||
    !isOneOf(observation.source, ROOT_ZONE_SOURCES)
  ) {
    return null;
  }
  const measuredFields = ROOT_ZONE_MEASURED_FIELDS.filter(
    (field) => typeof observation[field] === "number" && Number.isFinite(observation[field]),
  );
  const invalidFields = (observation.invalidFields ?? []).filter((field) =>
    (ROOT_ZONE_INVALID_FIELDS as readonly string[]).includes(field),
  );
  return {
    at: observation.at,
    eventType: observation.eventType,
    source: observation.source,
    measuredFields,
    hasNutrientLine: profileFieldPresent(observation.nutrientLine),
    productCount: Array.isArray(observation.products) ? observation.products.length : 0,
    invalidFields,
  };
}

/**
 * Builds an allowlisted availability/provenance receipt from the Edge-normalized
 * packet. No free text, measurement values, root-zone products, or provider
 * output crosses this boundary.
 */
export function buildAiDoctorReviewEvidenceReceiptSnapshot(input: {
  packet: AiDoctorReviewRequestPacket;
  clientCollectionDecision?: AiDoctorReviewEvidenceAcceptance | null;
}): AiDoctorReviewEvidenceReceiptSnapshot | null {
  const decision =
    input.clientCollectionDecision === null || input.clientCollectionDecision === undefined
      ? null
      : normalizeAiDoctorReviewEvidenceAcceptance(input.clientCollectionDecision);
  if (input.clientCollectionDecision != null && !decision) return null;

  const packet = input.packet;
  if (!isOneOf(packet.readiness.state, READINESS_STATES)) return null;
  const recentEvents = packet.recentEvents.flatMap((event) =>
    isSafeTimestamp(event.at) && isOneOf(event.category, EVENT_CATEGORIES)
      ? [{ at: event.at, category: event.category }]
      : [],
  );
  const snapshot = packet.recentSensorSnapshot;
  const recentSensorSnapshot =
    snapshot &&
    isSafeTimestamp(snapshot.capturedAt) &&
    isOneOf(snapshot.severity, SNAPSHOT_SEVERITIES)
      ? {
          capturedAt: snapshot.capturedAt,
          severity: snapshot.severity,
          readingCount: Array.isArray(snapshot.readings) ? snapshot.readings.length : 0,
        }
      : null;
  const annotation = packet.recentSensorSnapshotAnnotation;
  const recentSensorSnapshotAnnotation =
    annotation &&
    isOneOf(annotation.source, SNAPSHOT_SOURCES) &&
    isOneOf(annotation.trust, SNAPSHOT_TRUST_LEVELS) &&
    typeof annotation.stale === "boolean" &&
    typeof annotation.includesValues === "boolean"
      ? {
          source: annotation.source,
          stale: annotation.stale,
          trust: annotation.trust,
          includesValues: annotation.includesValues,
        }
      : null;
  const history = packet.imported_sensor_history;
  const importedSensorHistory =
    history && history.hasCsvHistory === true
      ? {
          totalReadings: history.totalReadings,
          dateRange:
            isSafeTimestamp(history.dateRange?.earliest) &&
            isSafeTimestamp(history.dateRange?.latest)
              ? { earliest: history.dateRange.earliest, latest: history.dateRange.latest }
              : null,
          metricCount: Array.isArray(history.metrics) ? history.metrics.length : 0,
          excludedQualityCount: history.excludedQualityCount,
          suspiciousFlagCount: history.suspiciousFlagCount,
        }
      : null;

  const receipt: AiDoctorReviewEvidenceReceiptSnapshot = {
    schemaVersion: AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION,
    packetSchemaVersion: packet.schemaVersion,
    clientCollectionDecision: decision,
    plantProfile: {
      hasStrain: profileFieldPresent(packet.plant.strain),
      hasStage: profileFieldPresent(packet.plant.stage),
      hasMedium: profileFieldPresent(packet.plant.medium),
      hasPotSize: profileFieldPresent(packet.plant.potSize),
    },
    readiness: {
      state: packet.readiness.state,
      evidenceCount: packet.readiness.evidence.length,
      missingCount: packet.readiness.missing.length,
    },
    recentEvents,
    recentSensorSnapshot,
    recentSensorSnapshotAnnotation,
    importedSensorHistory,
    rootZoneObservations: (packet.recentRootZoneObservations ?? [])
      .map(buildRootZoneObservationReceipt)
      .filter((observation): observation is ReceiptRootZoneObservation => observation !== null),
    missingLiveSensorReadings: packet.missingLiveSensorReadings === true,
  };

  return isAiDoctorReviewEvidenceReceiptSnapshot(receipt) ? receipt : null;
}

function isReceiptRootZoneObservation(value: unknown): value is ReceiptRootZoneObservation {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "at",
      "eventType",
      "source",
      "measuredFields",
      "hasNutrientLine",
      "productCount",
      "invalidFields",
    ]) ||
    !isSafeTimestamp(value.at) ||
    !isOneOf(value.eventType, ROOT_ZONE_EVENT_TYPES) ||
    !isOneOf(value.source, ROOT_ZONE_SOURCES) ||
    typeof value.hasNutrientLine !== "boolean" ||
    !isSafeCount(value.productCount, 12) ||
    !Array.isArray(value.measuredFields) ||
    value.measuredFields.length > ROOT_ZONE_MEASURED_FIELDS.length ||
    !Array.isArray(value.invalidFields) ||
    value.invalidFields.length > ROOT_ZONE_INVALID_FIELDS.length
  ) {
    return false;
  }
  return (
    value.measuredFields.every((field) => isOneOf(field, ROOT_ZONE_MEASURED_FIELDS)) &&
    new Set(value.measuredFields).size === value.measuredFields.length &&
    value.invalidFields.every((field) => isOneOf(field, ROOT_ZONE_INVALID_FIELDS)) &&
    new Set(value.invalidFields).size === value.invalidFields.length
  );
}

/** Strict structural guard used immediately before protected storage. */
export function isAiDoctorReviewEvidenceReceiptSnapshot(
  value: unknown,
): value is AiDoctorReviewEvidenceReceiptSnapshot {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "packetSchemaVersion",
      "clientCollectionDecision",
      "plantProfile",
      "readiness",
      "recentEvents",
      "recentSensorSnapshot",
      "recentSensorSnapshotAnnotation",
      "importedSensorHistory",
      "rootZoneObservations",
      "missingLiveSensorReadings",
    ]) ||
    value.schemaVersion !== AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION ||
    value.packetSchemaVersion !== 1 ||
    typeof value.missingLiveSensorReadings !== "boolean" ||
    !Array.isArray(value.recentEvents) ||
    value.recentEvents.length > 20 ||
    !Array.isArray(value.rootZoneObservations) ||
    value.rootZoneObservations.length > 20
  ) {
    return false;
  }
  if (
    value.clientCollectionDecision !== null &&
    !normalizeAiDoctorReviewEvidenceAcceptance(value.clientCollectionDecision)
  ) {
    return false;
  }
  const plantProfile = isPlainRecord(value.plantProfile) ? value.plantProfile : null;
  const readiness = isPlainRecord(value.readiness) ? value.readiness : null;
  if (
    !plantProfile ||
    !readiness ||
    !hasExactKeys(plantProfile, ["hasStrain", "hasStage", "hasMedium", "hasPotSize"]) ||
    !hasExactKeys(readiness, ["state", "evidenceCount", "missingCount"]) ||
    !Object.values(plantProfile).every((entry) => typeof entry === "boolean") ||
    !isOneOf(readiness.state, READINESS_STATES) ||
    !isSafeCount(readiness.evidenceCount, 32) ||
    !isSafeCount(readiness.missingCount, 32)
  ) {
    return false;
  }
  if (
    !value.recentEvents.every(
      (event) =>
        isPlainRecord(event) &&
        hasExactKeys(event, ["at", "category"]) &&
        isSafeTimestamp(event.at) &&
        isOneOf(event.category, EVENT_CATEGORIES),
    ) ||
    !value.rootZoneObservations.every(isReceiptRootZoneObservation)
  ) {
    return false;
  }
  if (value.recentSensorSnapshot !== null) {
    const snapshot = isPlainRecord(value.recentSensorSnapshot) ? value.recentSensorSnapshot : null;
    if (
      !snapshot ||
      !hasExactKeys(snapshot, ["capturedAt", "severity", "readingCount"]) ||
      !isSafeTimestamp(snapshot.capturedAt) ||
      !isOneOf(snapshot.severity, SNAPSHOT_SEVERITIES) ||
      !isSafeCount(snapshot.readingCount, 32)
    ) {
      return false;
    }
  }
  if (value.recentSensorSnapshotAnnotation !== null) {
    const annotation = isPlainRecord(value.recentSensorSnapshotAnnotation)
      ? value.recentSensorSnapshotAnnotation
      : null;
    if (
      !annotation ||
      !hasExactKeys(annotation, ["source", "stale", "trust", "includesValues"]) ||
      !isOneOf(annotation.source, SNAPSHOT_SOURCES) ||
      !isOneOf(annotation.trust, SNAPSHOT_TRUST_LEVELS) ||
      typeof annotation.stale !== "boolean" ||
      typeof annotation.includesValues !== "boolean"
    ) {
      return false;
    }
  }
  if (value.importedSensorHistory !== null) {
    const history = isPlainRecord(value.importedSensorHistory) ? value.importedSensorHistory : null;
    if (
      !history ||
      !hasExactKeys(history, [
        "totalReadings",
        "dateRange",
        "metricCount",
        "excludedQualityCount",
        "suspiciousFlagCount",
      ]) ||
      !isSafeCount(history.totalReadings, 200) ||
      !isSafeCount(history.metricCount, 64) ||
      !isSafeCount(history.excludedQualityCount, 200) ||
      !isSafeCount(history.suspiciousFlagCount, 200)
    ) {
      return false;
    }
    if (history.dateRange !== null) {
      const range = isPlainRecord(history.dateRange) ? history.dateRange : null;
      if (
        !range ||
        !hasExactKeys(range, ["earliest", "latest"]) ||
        !isSafeTimestamp(range.earliest) ||
        !isSafeTimestamp(range.latest)
      ) {
        return false;
      }
    }
  }
  const bytes = receiptByteSize(value);
  return bytes !== null && bytes > 0 && bytes <= AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_MAX_BYTES;
}
