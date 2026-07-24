/**
 * Immutable root-zone event context contract (V1).
 *
 * This module captures only recorded profile context that was available at
 * the watering/feeding boundary. It is pure and evidence-only: no I/O, no
 * sensor reads, no dryback or cadence inference, no targets, no diagnosis,
 * no alerts, no Action Queue writes, and no device control.
 */

import { isActivePlant } from "@/lib/archivedPlantVisibilityRules";

export const ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY = "root_zone_event_context_v1" as const;
export const ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION = 1 as const;
export const ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE = "root_zone_event_context" as const;
export const ROOT_ZONE_EVENT_CONTEXT_SOURCE = "profile_snapshot" as const;
export const ROOT_ZONE_EVENT_CONTEXT_MAX_LABEL_LENGTH = 120;
export const ROOT_ZONE_EVENT_CONTEXT_MAX_SCOPE_PLANTS = 10_000;
export const ROOT_ZONE_EVENT_CONTEXT_MAX_EVENT_SKEW_MS = 0;

export const ROOT_ZONE_EVENT_CONTEXT_SCOPES = Object.freeze(["plant", "tent"] as const);
export const ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES = Object.freeze([
  "consistent",
  "mixed",
  "incomplete",
  "not_recorded",
] as const);

export type RootZoneEventContextScope = (typeof ROOT_ZONE_EVENT_CONTEXT_SCOPES)[number];
export type RootZoneContextConsistency =
  (typeof ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES)[number];
export type RootZoneStageProvenance =
  | "plant_record"
  | "tent_record"
  | "grow_record"
  | "not_recorded";
export type RootZoneAggregateProvenance = "plant_record" | "tent_plant_records" | "not_recorded";

export interface RootZoneEventContextStageEnvelopeV1 {
  value: string | null;
  source: RootZoneStageProvenance;
}

export interface RootZoneEventContextAggregateEnvelopeV1 {
  value: string | null;
  source: RootZoneAggregateProvenance;
  consistency: RootZoneContextConsistency;
  recorded_count: number;
  total_count: number;
}

/** Exact snake_case payload reserved below details.root_zone_event_context_v1. */
export interface RootZoneEventContextEnvelopeV1 {
  schema_version: typeof ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION;
  source: typeof ROOT_ZONE_EVENT_CONTEXT_SOURCE;
  evidence_type: typeof ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE;
  advisory_only: true;
  captured_at: string;
  scope: RootZoneEventContextScope;
  stage: RootZoneEventContextStageEnvelopeV1;
  medium: RootZoneEventContextAggregateEnvelopeV1;
  container: RootZoneEventContextAggregateEnvelopeV1;
}

export interface RootZoneEventContextFieldV1 {
  readonly value: string | null;
  readonly source: RootZoneStageProvenance;
}

export interface RootZoneEventContextAggregateV1 {
  readonly value: string | null;
  readonly source: RootZoneAggregateProvenance;
  readonly consistency: RootZoneContextConsistency;
  readonly recordedCount: number;
  readonly totalCount: number;
}

/** Bounded read model. It intentionally contains no ownership or device IDs. */
export interface RootZoneEventContextV1 {
  readonly capturedAt: string;
  readonly scope: RootZoneEventContextScope;
  readonly source: typeof ROOT_ZONE_EVENT_CONTEXT_SOURCE;
  readonly advisoryOnly: true;
  readonly stage: RootZoneEventContextFieldV1;
  readonly medium: RootZoneEventContextAggregateV1;
  readonly container: RootZoneEventContextAggregateV1;
}

export interface RootZoneEventContextPlantLike {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  stage?: string | null;
  medium?: string | null;
  pot_size?: string | null;
  isArchived?: boolean | null;
  is_archived?: boolean | null;
  lastNote?: string | null;
  last_note?: string | null;
}

export interface RootZoneEventContextTentLike {
  id: string;
  grow_id?: string | null;
  stage?: string | null;
}

export interface RootZoneEventContextGrowLike {
  id: string;
  stage?: string | null;
}

export type RootZoneEventContextTarget =
  | {
      scope: "plant";
      growId: string;
      tentId?: string | null;
      plantId: string;
    }
  | {
      scope: "tent";
      growId: string;
      tentId: string;
    };

export interface BuildRootZoneEventContextEnvelopeV1Input {
  capturedAt: string;
  target: RootZoneEventContextTarget;
  plants: readonly RootZoneEventContextPlantLike[];
  tents: readonly RootZoneEventContextTentLike[];
  grows: readonly RootZoneEventContextGrowLike[];
}

export type RootZoneEventContextBuildFailureReason =
  | "invalid_captured_at"
  | "invalid_scope"
  | "scope_record_mismatch"
  | "invalid_context_value";

export type BuildRootZoneEventContextEnvelopeV1Result =
  | { ok: true; envelope: RootZoneEventContextEnvelopeV1 }
  | { ok: false; reason: RootZoneEventContextBuildFailureReason };

export type RootZoneEventContextProjection =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; context: RootZoneEventContextV1 };

type LabelResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; value: string };

type UniqueRecordResult<T> =
  | { status: "missing" }
  | { status: "duplicate" }
  | { status: "found"; record: T };

const CANONICAL_ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SECRET_ASSIGNMENT_RE =
  /(?:api[_-]?key|token|secret|password|authorization|bearer|bridge[_-]?token)\s*[:=]/i;
const ROOT_KEYS = Object.freeze([
  "schema_version",
  "source",
  "evidence_type",
  "advisory_only",
  "captured_at",
  "scope",
  "stage",
  "medium",
  "container",
] as const);
const STAGE_KEYS = Object.freeze(["value", "source"] as const);
const AGGREGATE_KEYS = Object.freeze([
  "value",
  "source",
  "consistency",
  "recorded_count",
  "total_count",
] as const);
const SCOPE_SET: ReadonlySet<string> = new Set(ROOT_ZONE_EVENT_CONTEXT_SCOPES);
const CONSISTENCY_SET: ReadonlySet<string> = new Set(ROOT_ZONE_EVENT_CONTEXT_CONSISTENCY_STATES);
const STAGE_SOURCE_SET: ReadonlySet<string> = new Set<RootZoneStageProvenance>([
  "plant_record",
  "tent_record",
  "grow_record",
  "not_recorded",
]);
const AGGREGATE_SOURCE_SET: ReadonlySet<string> = new Set<RootZoneAggregateProvenance>([
  "plant_record",
  "tent_plant_records",
  "not_recorded",
]);

function normalizeCanonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !CANONICAL_ISO_TIMESTAMP_RE.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const canonical = new Date(timestamp).toISOString();
  return canonical === value ? canonical : null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

function normalizeOptionalRecordId(value: unknown): LabelResult {
  if (value === null || value === undefined || value === "") return { status: "missing" };
  const normalized = normalizeId(value);
  return normalized ? { status: "valid", value: normalized } : { status: "invalid" };
}

function normalizeContextLabel(value: unknown): LabelResult {
  if (value === null || value === undefined) return { status: "missing" };
  if (typeof value !== "string") return { status: "invalid" };
  if (
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return { status: "invalid" };
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return { status: "missing" };
  if (
    normalized.length > ROOT_ZONE_EVENT_CONTEXT_MAX_LABEL_LENGTH ||
    SECRET_ASSIGNMENT_RE.test(normalized)
  ) {
    return { status: "invalid" };
  }
  return { status: "valid", value: normalized };
}

function isCanonicalContextLabel(value: unknown): value is string {
  const normalized = normalizeContextLabel(value);
  return normalized.status === "valid" && normalized.value === value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactDataKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    return false;
  }
  return expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return Boolean(descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value"));
  });
}

function dataValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error("Accessor properties are not accepted.");
  }
  return descriptor.value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function findUniqueById<T extends { id: string }>(
  records: readonly T[],
  id: string,
): UniqueRecordResult<T> {
  const matches = records.filter((record) => normalizeId(record?.id) === id);
  if (matches.length === 0) return { status: "missing" };
  if (matches.length !== 1) return { status: "duplicate" };
  return { status: "found", record: matches[0] };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildAggregate(
  rawValues: readonly unknown[],
  scope: RootZoneEventContextScope,
):
  | { ok: true; aggregate: RootZoneEventContextAggregateEnvelopeV1 }
  | { ok: false; reason: "invalid_context_value" } {
  if (rawValues.length > ROOT_ZONE_EVENT_CONTEXT_MAX_SCOPE_PLANTS) {
    return { ok: false, reason: "invalid_context_value" };
  }

  const recorded: string[] = [];
  for (const raw of rawValues) {
    const normalized = normalizeContextLabel(raw);
    if (normalized.status === "invalid") {
      return { ok: false, reason: "invalid_context_value" };
    }
    if (normalized.status === "valid") recorded.push(normalized.value);
  }

  const totalCount = rawValues.length;
  const recordedCount = recorded.length;
  if (recordedCount === 0) {
    return {
      ok: true,
      aggregate: {
        value: null,
        source: "not_recorded",
        consistency: "not_recorded",
        recorded_count: 0,
        total_count: totalCount,
      },
    };
  }

  const source: RootZoneAggregateProvenance =
    scope === "plant" ? "plant_record" : "tent_plant_records";
  if (recordedCount < totalCount) {
    return {
      ok: true,
      aggregate: {
        value: null,
        source,
        consistency: "incomplete",
        recorded_count: recordedCount,
        total_count: totalCount,
      },
    };
  }

  const byComparisonKey = new Map<string, string[]>();
  for (const value of recorded) {
    const key = value.toLowerCase();
    const values = byComparisonKey.get(key) ?? [];
    values.push(value);
    byComparisonKey.set(key, values);
  }
  if (byComparisonKey.size > 1) {
    return {
      ok: true,
      aggregate: {
        value: null,
        source,
        consistency: "mixed",
        recorded_count: recordedCount,
        total_count: totalCount,
      },
    };
  }

  const representative = [...recorded].sort(compareText)[0];
  return {
    ok: true,
    aggregate: {
      value: representative,
      source,
      consistency: "consistent",
      recorded_count: recordedCount,
      total_count: totalCount,
    },
  };
}

function buildStage(
  candidates: readonly {
    value: unknown;
    source: Exclude<RootZoneStageProvenance, "not_recorded">;
  }[],
):
  | { ok: true; stage: RootZoneEventContextStageEnvelopeV1 }
  | { ok: false; reason: "invalid_context_value" } {
  for (const candidate of candidates) {
    const normalized = normalizeContextLabel(candidate.value);
    if (normalized.status === "invalid") {
      return { ok: false, reason: "invalid_context_value" };
    }
    if (normalized.status === "valid") {
      return { ok: true, stage: { value: normalized.value, source: candidate.source } };
    }
  }
  return { ok: true, stage: { value: null, source: "not_recorded" } };
}

function recordRelationshipMatches(
  record: { grow_id?: string | null; tent_id?: string | null },
  growId: string,
  tentId: string | null,
): boolean {
  const recordGrow = normalizeOptionalRecordId(record.grow_id);
  const recordTent = normalizeOptionalRecordId(record.tent_id);
  if (recordGrow.status === "invalid" || recordTent.status === "invalid") return false;
  if (recordGrow.status === "valid" && recordGrow.value !== growId) return false;
  if (tentId === null) return recordTent.status !== "valid";
  return recordTent.status !== "valid" || recordTent.value === tentId;
}

function normalizeStageField(
  value: unknown,
  scope: RootZoneEventContextScope,
): RootZoneEventContextFieldV1 | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, STAGE_KEYS)) return null;
  const rawValue = dataValue(value, "value");
  const rawSource = dataValue(value, "source");
  if (typeof rawSource !== "string" || !STAGE_SOURCE_SET.has(rawSource)) return null;
  if (scope === "tent" && rawSource === "plant_record") return null;
  if (rawValue === null) {
    return rawSource === "not_recorded"
      ? deepFreeze({ value: null, source: "not_recorded" as const })
      : null;
  }
  if (!isCanonicalContextLabel(rawValue) || rawSource === "not_recorded") return null;
  return deepFreeze({ value: rawValue, source: rawSource as RootZoneStageProvenance });
}

function normalizeAggregateField(
  value: unknown,
  scope: RootZoneEventContextScope,
): RootZoneEventContextAggregateV1 | null {
  if (!isPlainRecord(value) || !hasExactDataKeys(value, AGGREGATE_KEYS)) return null;
  const rawValue = dataValue(value, "value");
  const rawSource = dataValue(value, "source");
  const rawConsistency = dataValue(value, "consistency");
  const recordedCount = dataValue(value, "recorded_count");
  const totalCount = dataValue(value, "total_count");

  if (
    typeof rawSource !== "string" ||
    !AGGREGATE_SOURCE_SET.has(rawSource) ||
    typeof rawConsistency !== "string" ||
    !CONSISTENCY_SET.has(rawConsistency) ||
    !Number.isSafeInteger(recordedCount) ||
    !Number.isSafeInteger(totalCount) ||
    (recordedCount as number) < 0 ||
    (totalCount as number) < 0 ||
    (recordedCount as number) > (totalCount as number) ||
    (totalCount as number) > ROOT_ZONE_EVENT_CONTEXT_MAX_SCOPE_PLANTS
  ) {
    return null;
  }
  if (scope === "plant" && (totalCount as number) > 1) return null;
  const expectedSource = scope === "plant" ? "plant_record" : "tent_plant_records";
  const counts = {
    recordedCount: recordedCount as number,
    totalCount: totalCount as number,
  };

  if (rawConsistency === "not_recorded") {
    if (counts.recordedCount !== 0 || rawValue !== null || rawSource !== "not_recorded") {
      return null;
    }
  } else if (rawConsistency === "consistent") {
    if (
      counts.recordedCount === 0 ||
      counts.recordedCount !== counts.totalCount ||
      rawSource !== expectedSource ||
      !isCanonicalContextLabel(rawValue)
    ) {
      return null;
    }
  } else if (rawConsistency === "incomplete") {
    if (
      scope !== "tent" ||
      counts.recordedCount === 0 ||
      counts.recordedCount >= counts.totalCount ||
      rawValue !== null ||
      rawSource !== expectedSource
    ) {
      return null;
    }
  } else if (
    scope !== "tent" ||
    counts.totalCount < 2 ||
    counts.recordedCount !== counts.totalCount ||
    rawValue !== null ||
    rawSource !== expectedSource
  ) {
    return null;
  }

  if (scope === "plant" && !["consistent", "not_recorded"].includes(rawConsistency)) {
    return null;
  }
  return deepFreeze({
    value: rawValue as string | null,
    source: rawSource as RootZoneAggregateProvenance,
    consistency: rawConsistency as RootZoneContextConsistency,
    ...counts,
  });
}

/** Strictly reconstruct one untrusted V1 envelope into the bounded read model. */
export function normalizeRootZoneEventContextEnvelopeV1(
  value: unknown,
): RootZoneEventContextV1 | null {
  try {
    if (!isPlainRecord(value) || !hasExactDataKeys(value, ROOT_KEYS)) return null;
    if (
      dataValue(value, "schema_version") !== ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION ||
      dataValue(value, "source") !== ROOT_ZONE_EVENT_CONTEXT_SOURCE ||
      dataValue(value, "evidence_type") !== ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE ||
      dataValue(value, "advisory_only") !== true
    ) {
      return null;
    }
    const capturedAt = normalizeCanonicalTimestamp(dataValue(value, "captured_at"));
    const scope = dataValue(value, "scope");
    if (!capturedAt || typeof scope !== "string" || !SCOPE_SET.has(scope)) return null;
    const typedScope = scope as RootZoneEventContextScope;
    const stage = normalizeStageField(dataValue(value, "stage"), typedScope);
    const medium = normalizeAggregateField(dataValue(value, "medium"), typedScope);
    const container = normalizeAggregateField(dataValue(value, "container"), typedScope);
    if (!stage || !medium || !container || medium.totalCount !== container.totalCount) return null;

    return deepFreeze({
      capturedAt,
      scope: typedScope,
      source: ROOT_ZONE_EVENT_CONTEXT_SOURCE,
      advisoryOnly: true as const,
      stage,
      medium,
      container,
    });
  } catch {
    return null;
  }
}

/**
 * Build a strict context snapshot from the exact selected event scope.
 * Missing records become explicit unknowns; mismatched records fail closed.
 */
export function buildRootZoneEventContextEnvelopeV1(
  input: BuildRootZoneEventContextEnvelopeV1Input,
): BuildRootZoneEventContextEnvelopeV1Result {
  try {
    const capturedAt = normalizeCanonicalTimestamp(input?.capturedAt);
    if (!capturedAt) return { ok: false, reason: "invalid_captured_at" };
    const target = input?.target;
    const growId = normalizeId(target?.growId);
    if (!target || !growId || !SCOPE_SET.has(target.scope)) {
      return { ok: false, reason: "invalid_scope" };
    }

    const plants = Array.isArray(input.plants) ? input.plants : [];
    const tents = Array.isArray(input.tents) ? input.tents : [];
    const grows = Array.isArray(input.grows) ? input.grows : [];
    const growMatch = findUniqueById(grows, growId);
    if (growMatch.status === "duplicate") {
      return { ok: false, reason: "scope_record_mismatch" };
    }
    const grow = growMatch.status === "found" ? growMatch.record : null;

    let stageCandidates: Array<{
      value: unknown;
      source: Exclude<RootZoneStageProvenance, "not_recorded">;
    }>;
    let mediumValues: readonly unknown[];
    let containerValues: readonly unknown[];

    if (target.scope === "plant") {
      const plantId = normalizeId(target.plantId);
      const tentId = target.tentId == null ? null : normalizeId(target.tentId);
      if (!plantId || (target.tentId != null && !tentId)) {
        return { ok: false, reason: "invalid_scope" };
      }
      const plantMatch = findUniqueById(plants, plantId);
      if (plantMatch.status === "duplicate") {
        return { ok: false, reason: "scope_record_mismatch" };
      }
      const plant = plantMatch.status === "found" ? plantMatch.record : null;
      if (plant && (!isActivePlant(plant) || !recordRelationshipMatches(plant, growId, tentId))) {
        return { ok: false, reason: "scope_record_mismatch" };
      }

      const tentMatch = tentId ? findUniqueById(tents, tentId) : ({ status: "missing" } as const);
      if (tentMatch.status === "duplicate") {
        return { ok: false, reason: "scope_record_mismatch" };
      }
      const tent = tentMatch.status === "found" ? tentMatch.record : null;
      if (tent && !recordRelationshipMatches(tent, growId, null)) {
        return { ok: false, reason: "scope_record_mismatch" };
      }

      stageCandidates = [
        { value: plant?.stage, source: "plant_record" },
        { value: tent?.stage, source: "tent_record" },
        { value: grow?.stage, source: "grow_record" },
      ];
      mediumValues = plant ? [plant.medium] : [];
      containerValues = plant ? [plant.pot_size] : [];
    } else {
      const tentId = normalizeId(target.tentId);
      if (!tentId) return { ok: false, reason: "invalid_scope" };
      const tentMatch = findUniqueById(tents, tentId);
      if (tentMatch.status === "duplicate") {
        return { ok: false, reason: "scope_record_mismatch" };
      }
      const tent = tentMatch.status === "found" ? tentMatch.record : null;
      if (tent && !recordRelationshipMatches(tent, growId, null)) {
        return { ok: false, reason: "scope_record_mismatch" };
      }

      const scopedPlants: RootZoneEventContextPlantLike[] = [];
      const seenIds = new Set<string>();
      for (const plant of plants) {
        if (!isActivePlant(plant)) continue;
        const recordTent = normalizeOptionalRecordId(plant?.tent_id);
        if (recordTent.status === "invalid" || recordTent.status !== "valid") continue;
        if (recordTent.value !== tentId) continue;
        const plantId = normalizeId(plant?.id);
        if (!plantId || seenIds.has(plantId)) {
          return { ok: false, reason: "scope_record_mismatch" };
        }
        seenIds.add(plantId);
        if (!recordRelationshipMatches(plant, growId, tentId)) {
          return { ok: false, reason: "scope_record_mismatch" };
        }
        scopedPlants.push(plant);
      }
      if (scopedPlants.length > ROOT_ZONE_EVENT_CONTEXT_MAX_SCOPE_PLANTS) {
        return { ok: false, reason: "invalid_scope" };
      }
      scopedPlants.sort((a, b) => compareText(normalizeId(a.id) ?? "", normalizeId(b.id) ?? ""));

      stageCandidates = [
        { value: tent?.stage, source: "tent_record" },
        { value: grow?.stage, source: "grow_record" },
      ];
      mediumValues = scopedPlants.map((plant) => plant.medium);
      containerValues = scopedPlants.map((plant) => plant.pot_size);
    }

    const stage = buildStage(stageCandidates);
    const medium = buildAggregate(mediumValues, target.scope);
    const container = buildAggregate(containerValues, target.scope);
    if (!stage.ok || !medium.ok || !container.ok) {
      return { ok: false, reason: "invalid_context_value" };
    }

    const envelope: RootZoneEventContextEnvelopeV1 = {
      schema_version: ROOT_ZONE_EVENT_CONTEXT_SCHEMA_VERSION,
      source: ROOT_ZONE_EVENT_CONTEXT_SOURCE,
      evidence_type: ROOT_ZONE_EVENT_CONTEXT_EVIDENCE_TYPE,
      advisory_only: true,
      captured_at: capturedAt,
      scope: target.scope,
      stage: stage.stage,
      medium: medium.aggregate,
      container: container.aggregate,
    };
    if (!normalizeRootZoneEventContextEnvelopeV1(envelope)) {
      return { ok: false, reason: "invalid_context_value" };
    }
    return { ok: true, envelope: deepFreeze(envelope) };
  } catch {
    return { ok: false, reason: "invalid_context_value" };
  }
}

/** Project one exact-time reserved envelope from otherwise unrelated details. */
export function projectRootZoneEventContextFromDetails(
  details: unknown,
  eventOccurredAt: string,
): RootZoneEventContextProjection {
  try {
    if (!isPlainRecord(details)) return { status: "absent" };
    const descriptor = Object.getOwnPropertyDescriptor(
      details,
      ROOT_ZONE_EVENT_CONTEXT_DETAILS_KEY,
    );
    if (!descriptor) return { status: "absent" };
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) return { status: "invalid" };
    const context = normalizeRootZoneEventContextEnvelopeV1(descriptor.value);
    const eventTimestamp = normalizeCanonicalTimestamp(eventOccurredAt);
    if (
      !context ||
      !eventTimestamp ||
      Math.abs(Date.parse(context.capturedAt) - Date.parse(eventTimestamp)) >
        ROOT_ZONE_EVENT_CONTEXT_MAX_EVENT_SKEW_MS
    ) {
      return { status: "invalid" };
    }
    return deepFreeze({ status: "valid" as const, context });
  } catch {
    return { status: "invalid" };
  }
}
