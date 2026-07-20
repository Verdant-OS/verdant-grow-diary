/**
 * Root-zone observation rules.
 *
 * Projects the existing typed `watering_events` / `feeding_events` child
 * rows into a single bounded, read-only shape for Timeline and AI Doctor.
 * No writes, no Supabase client, no inferred targets, and no advice.
 */

import {
  ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY,
  projectRootZoneManualObservationFromDetails,
  type RootZoneManualObservationProjection,
  type RootZoneManualObservationV1,
} from "./rootZoneManualObservationRules";

export const ROOT_ZONE_OBSERVATION_SCHEMA_VERSION = 1 as const;
export const ROOT_ZONE_OBSERVATION_CAP = 20;
export const ROOT_ZONE_PRODUCT_CAP = 12;
export const ROOT_ZONE_MANUAL_OBSERVATION_COMPANION_QUERY_CAP = ROOT_ZONE_OBSERVATION_CAP * 2 + 1;

/** Shared PostgREST projection for the existing typed event spine. */
export const ROOT_ZONE_GROW_EVENT_SELECT =
  "id,grow_id,plant_id,tent_id,event_type,occurred_at,note,source,is_deleted," +
  "watering_events(volume_ml,ph,ec_ms_cm,runoff_ml,runoff_ph,runoff_ec,water_temp_c)," +
  "feeding_events(volume_ml,ph,ec_ms_cm,ec_in,ec_out,runoff_ml,runoff_ph,runoff_ec,water_temp_c,line_id,products,nutrient_brand)";

/** Separate RLS-scoped companion read; `grow_events` has no details column. */
export const ROOT_ZONE_MANUAL_OBSERVATION_DIARY_SELECT =
  "id,grow_id,plant_id,tent_id,entry_at," +
  "linked_grow_event_id:details->>linked_grow_event_id," +
  "root_zone_manual_observation_v1:details->root_zone_manual_observation_v1";

export type RootZoneEventType = "watering" | "feeding";
export type RootZoneSource = "manual" | "csv" | "demo" | "stale" | "invalid" | "unknown";
export const ROOT_ZONE_INVALID_FIELDS = [
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
  "manualObservation",
] as const;
export type RootZoneInvalidField = (typeof ROOT_ZONE_INVALID_FIELDS)[number];

export interface RootZoneProductV1 {
  name: string;
  amount: number | null;
  unit: string | null;
}

export interface RootZoneMetricsV1 {
  schemaVersion: typeof ROOT_ZONE_OBSERVATION_SCHEMA_VERSION;
  volumeMl: number | null;
  inputPh: number | null;
  inputEcMsCm: number | null;
  outputEcMsCm: number | null;
  runoffMl: number | null;
  runoffPh: number | null;
  runoffEcMsCm: number | null;
  waterTempC: number | null;
  nutrientLine: string | null;
  products: readonly RootZoneProductV1[];
}

export interface RootZoneObservationV1 {
  occurredAt: string;
  eventType: RootZoneEventType;
  source: RootZoneSource;
  metrics: RootZoneMetricsV1;
  /** Optional grower-authored context from this exact manual watering event. */
  manualObservation?: RootZoneManualObservationV1;
  /** Supplied fields rejected by the plausibility/safety projection. */
  invalidFields?: readonly RootZoneInvalidField[];
}

export interface RootZoneGrowEventRowLike {
  id?: unknown;
  grow_id?: unknown;
  plant_id?: unknown;
  tent_id?: unknown;
  event_type?: unknown;
  occurred_at?: unknown;
  note?: unknown;
  source?: unknown;
  is_deleted?: unknown;
  watering_events?: unknown;
  feeding_events?: unknown;
}

export interface RootZoneManualObservationDiaryRowLike {
  id?: unknown;
  grow_id?: unknown;
  plant_id?: unknown;
  tent_id?: unknown;
  entry_at?: unknown;
  linked_grow_event_id?: unknown;
  root_zone_manual_observation_v1?: unknown;
}

export interface RootZoneManualObservationCompanionIndex {
  readonly matchesByGrowEventId: ReadonlyMap<
    string,
    readonly RootZoneManualObservationDiaryRowLike[]
  >;
}

const SECRET_HINT_RE =
  /(secret|token|api[_-]?key|password|service[_-]?role|bearer\s|^eyJ[A-Za-z0-9_-]{8,}\.|^sk_(live|test)_|^sb_|^pk_(live|test)_)/i;
const DECIMAL_NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Shared fail-closed check for root-zone text crossing trust boundaries. */
export function hasRootZoneSecretHint(value: string): boolean {
  return SECRET_HINT_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength || hasRootZoneSecretHint(trimmed)) {
    return null;
  }
  return trimmed;
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
  options: { strictlyPositive?: boolean } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && DECIMAL_NUMBER_RE.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  if (options.strictlyPositive ? numeric <= min : numeric < min) return null;
  if (numeric > max) return null;
  return numeric === 0 ? 0 : numeric;
}

function firstNumber(
  values: readonly unknown[],
  min: number,
  max: number,
  options?: { strictlyPositive?: boolean },
): number | null {
  for (const value of values) {
    const result = boundedNumber(value, min, max, options);
    if (result !== null) return result;
  }
  return null;
}

function wasSupplied(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function productsContainRejectedInput(value: unknown): boolean {
  if (!wasSupplied(value)) return false;
  if (!Array.isArray(value)) return true;
  if (value.length > ROOT_ZONE_PRODUCT_CAP) return true;

  return value.some((item) => {
    const row = asRecord(item);
    if (!row || cleanString(row.name, 120) === null) return true;
    if (wasSupplied(row.amount) && boundedNumber(row.amount, 0, 1_000_000) === null) return true;
    return wasSupplied(row.unit) && cleanString(row.unit, 40) === null;
  });
}

function collectInvalidFields(
  eventType: RootZoneEventType,
  child: Record<string, unknown>,
): readonly RootZoneInvalidField[] {
  const invalid: RootZoneInvalidField[] = [];
  const checkNumber = (
    field: RootZoneInvalidField,
    value: unknown,
    min: number,
    max: number,
    options?: { strictlyPositive?: boolean },
  ) => {
    if (wasSupplied(value) && boundedNumber(value, min, max, options) === null) {
      invalid.push(field);
    }
  };

  checkNumber("volumeMl", child.volume_ml, 0, 1_000_000, { strictlyPositive: true });
  checkNumber("inputPh", child.ph, 0, 14);
  if (eventType === "feeding") {
    if (
      (wasSupplied(child.ec_in) && boundedNumber(child.ec_in, 0, 10) === null) ||
      (!wasSupplied(child.ec_in) &&
        wasSupplied(child.ec_ms_cm) &&
        boundedNumber(child.ec_ms_cm, 0, 10) === null)
    ) {
      invalid.push("inputEcMsCm");
    }
    checkNumber("outputEcMsCm", child.ec_out, 0, 10);
  } else {
    checkNumber("inputEcMsCm", child.ec_ms_cm, 0, 10);
  }
  checkNumber("runoffMl", child.runoff_ml, 0, 1_000_000);
  checkNumber("runoffPh", child.runoff_ph, 0, 14);
  checkNumber("runoffEcMsCm", child.runoff_ec, 0, 10);
  checkNumber("waterTempC", child.water_temp_c, -10, 60);

  if (eventType === "feeding") {
    const lineWasSupplied = wasSupplied(child.line_id) || wasSupplied(child.nutrient_brand);
    const line = cleanString(child.line_id, 120) ?? cleanString(child.nutrient_brand, 120);
    if (lineWasSupplied && line === null) invalid.push("nutrientLine");
    if (productsContainRejectedInput(child.products)) invalid.push("products");
  }
  return Object.freeze(invalid);
}

export function normalizeRootZoneSource(value: unknown): RootZoneSource {
  if (typeof value !== "string") return "unknown";
  const source = value.trim().toLowerCase();
  if (source === "manual" || source === "manual_snapshot") return "manual";
  if (source === "csv" || source === "csv_import" || source === "import") return "csv";
  if (source === "demo" || source === "fixture" || source === "mock") return "demo";
  if (source === "stale") return "stale";
  if (source === "invalid") return "invalid";
  return "unknown";
}

export function rootZoneSourceLabel(source: RootZoneSource): string {
  switch (source) {
    case "manual":
      return "Manual log";
    case "csv":
      return "CSV log";
    case "demo":
      return "Demo log";
    case "stale":
      return "Stale source";
    case "invalid":
      return "Invalid source";
    default:
      return "Source unavailable";
  }
}

function normalizeProducts(value: unknown): readonly RootZoneProductV1[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const products: RootZoneProductV1[] = [];
  for (const item of value) {
    if (products.length >= ROOT_ZONE_PRODUCT_CAP) break;
    const row = asRecord(item);
    if (!row) continue;
    const name = cleanString(row.name, 120);
    if (!name) continue;
    products.push({
      name,
      amount: boundedNumber(row.amount, 0, 1_000_000),
      unit: cleanString(row.unit, 40),
    });
  }
  return Object.freeze(products);
}

function hasEvidence(metrics: RootZoneMetricsV1): boolean {
  return (
    metrics.volumeMl !== null ||
    metrics.inputPh !== null ||
    metrics.inputEcMsCm !== null ||
    metrics.outputEcMsCm !== null ||
    metrics.runoffMl !== null ||
    metrics.runoffPh !== null ||
    metrics.runoffEcMsCm !== null ||
    metrics.waterTempC !== null ||
    metrics.nutrientLine !== null ||
    metrics.products.length > 0
  );
}

function buildMetrics(
  eventType: RootZoneEventType,
  child: Record<string, unknown>,
): RootZoneMetricsV1 | null {
  const products = eventType === "feeding" ? normalizeProducts(child.products) : Object.freeze([]);
  const metrics: RootZoneMetricsV1 = {
    schemaVersion: ROOT_ZONE_OBSERVATION_SCHEMA_VERSION,
    volumeMl: boundedNumber(child.volume_ml, 0, 1_000_000, { strictlyPositive: true }),
    inputPh: boundedNumber(child.ph, 0, 14),
    inputEcMsCm:
      eventType === "feeding"
        ? firstNumber([child.ec_in, child.ec_ms_cm], 0, 10)
        : boundedNumber(child.ec_ms_cm, 0, 10),
    outputEcMsCm: eventType === "feeding" ? boundedNumber(child.ec_out, 0, 10) : null,
    runoffMl: boundedNumber(child.runoff_ml, 0, 1_000_000),
    runoffPh: boundedNumber(child.runoff_ph, 0, 14),
    runoffEcMsCm: boundedNumber(child.runoff_ec, 0, 10),
    waterTempC: boundedNumber(child.water_temp_c, -10, 60),
    nutrientLine:
      eventType === "feeding"
        ? (cleanString(child.line_id, 120) ?? cleanString(child.nutrient_brand, 120))
        : null,
    products,
  };
  return hasEvidence(metrics) ? metrics : null;
}

/** Normalize a previously projected root-zone metrics envelope. */
export function normalizeRootZoneMetricsV1(value: unknown): RootZoneMetricsV1 | null {
  const row = asRecord(value);
  if (!row || row.schemaVersion !== ROOT_ZONE_OBSERVATION_SCHEMA_VERSION) return null;
  const metrics: RootZoneMetricsV1 = {
    schemaVersion: ROOT_ZONE_OBSERVATION_SCHEMA_VERSION,
    volumeMl: boundedNumber(row.volumeMl, 0, 1_000_000, { strictlyPositive: true }),
    inputPh: boundedNumber(row.inputPh, 0, 14),
    inputEcMsCm: boundedNumber(row.inputEcMsCm, 0, 10),
    outputEcMsCm: boundedNumber(row.outputEcMsCm, 0, 10),
    runoffMl: boundedNumber(row.runoffMl, 0, 1_000_000),
    runoffPh: boundedNumber(row.runoffPh, 0, 14),
    runoffEcMsCm: boundedNumber(row.runoffEcMsCm, 0, 10),
    waterTempC: boundedNumber(row.waterTempC, -10, 60),
    nutrientLine: cleanString(row.nutrientLine, 120),
    products: normalizeProducts(row.products),
  };
  return hasEvidence(metrics) ? metrics : null;
}

function exactNonBlankIdentifier(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return null;
  return value.trim() === value ? value : null;
}

/** Build one exact-link index without projecting or exposing diary details. */
export function buildRootZoneManualObservationCompanionIndex(
  rows: readonly RootZoneManualObservationDiaryRowLike[] | null | undefined,
): RootZoneManualObservationCompanionIndex {
  const mutable = new Map<string, RootZoneManualObservationDiaryRowLike[]>();
  for (const row of rows ?? []) {
    try {
      if (
        row?.root_zone_manual_observation_v1 === null ||
        row?.root_zone_manual_observation_v1 === undefined
      ) {
        continue;
      }
      const linkedGrowEventId = exactNonBlankIdentifier(row.linked_grow_event_id);
      if (!linkedGrowEventId) continue;
      const matches = mutable.get(linkedGrowEventId) ?? [];
      matches.push(row);
      mutable.set(linkedGrowEventId, matches);
    } catch {
      // An untrusted row that cannot expose a verified link cannot be attached.
    }
  }

  const matchesByGrowEventId = new Map<string, readonly RootZoneManualObservationDiaryRowLike[]>();
  for (const [eventId, matches] of mutable) {
    matchesByGrowEventId.set(eventId, Object.freeze([...matches]));
  }
  return Object.freeze({ matchesByGrowEventId });
}

function nullableIdentifierMatches(parent: unknown, companion: unknown): boolean {
  if (parent === null || companion === null) return parent === null && companion === null;
  const parentId = exactNonBlankIdentifier(parent);
  const companionId = exactNonBlankIdentifier(companion);
  return parentId !== null && parentId === companionId;
}

function companionScopeMatchesGrowEvent(
  event: RootZoneGrowEventRowLike,
  companion: RootZoneManualObservationDiaryRowLike,
): boolean {
  const eventGrowId = exactNonBlankIdentifier(event.grow_id);
  const companionGrowId = exactNonBlankIdentifier(companion.grow_id);
  return (
    eventGrowId !== null &&
    eventGrowId === companionGrowId &&
    nullableIdentifierMatches(event.tent_id, companion.tent_id) &&
    nullableIdentifierMatches(event.plant_id, companion.plant_id)
  );
}

function projectManualObservationForGrowEvent(
  row: RootZoneGrowEventRowLike,
  eventType: RootZoneEventType,
  source: RootZoneSource,
  occurredAt: string,
  companionIndex: RootZoneManualObservationCompanionIndex | null | undefined,
): RootZoneManualObservationProjection {
  const eventId = exactNonBlankIdentifier(row.id);
  if (!eventId || !companionIndex) return { status: "absent" };
  const matches = companionIndex.matchesByGrowEventId.get(eventId) ?? [];
  if (matches.length === 0) return { status: "absent" };
  if (matches.length !== 1) return { status: "invalid" };

  const companion = matches[0];
  if (
    eventType !== "watering" ||
    source !== "manual" ||
    !companionScopeMatchesGrowEvent(row, companion)
  ) {
    return { status: "invalid" };
  }
  return projectRootZoneManualObservationFromDetails(
    {
      [ROOT_ZONE_MANUAL_OBSERVATION_DETAILS_KEY]: companion.root_zone_manual_observation_v1,
    },
    occurredAt,
  );
}

/** Project one existing typed grow event into a root-zone observation. */
export function buildRootZoneObservationFromGrowEvent(
  row: RootZoneGrowEventRowLike,
  companionIndex: RootZoneManualObservationCompanionIndex | null = null,
): RootZoneObservationV1 | null {
  if (!row || row.is_deleted === true) return null;
  const eventType = row.event_type;
  if (eventType !== "watering" && eventType !== "feeding") return null;
  if (typeof row.occurred_at !== "string") return null;
  const occurredMs = Date.parse(row.occurred_at);
  if (!Number.isFinite(occurredMs)) return null;
  const child = relationRecord(eventType === "watering" ? row.watering_events : row.feeding_events);
  if (!child) return null;
  const metrics = buildMetrics(eventType, child);
  if (!metrics) return null;
  const occurredAt = new Date(occurredMs).toISOString();
  const source = normalizeRootZoneSource(row.source);
  const manualObservationProjection = projectManualObservationForGrowEvent(
    row,
    eventType,
    source,
    occurredAt,
    companionIndex,
  );
  const invalidFields = [...collectInvalidFields(eventType, child)];
  if (manualObservationProjection.status === "invalid") {
    invalidFields.push("manualObservation");
  }
  return {
    occurredAt,
    eventType,
    source,
    metrics,
    ...(manualObservationProjection.status === "valid"
      ? { manualObservation: manualObservationProjection.manualObservation }
      : {}),
    ...(invalidFields.length > 0 ? { invalidFields } : {}),
  };
}

/**
 * Build the loose details shape already understood by the diary Timeline
 * history rules. Unknown or absent measurements remain absent/null.
 */
export function buildRootZoneDiaryDetails(
  observation: RootZoneObservationV1 | null,
): Record<string, unknown> {
  if (!observation) return {};
  const m = observation.metrics;
  const details: Record<string, unknown> = {
    root_zone_v1: m,
  };
  if (m.volumeMl !== null) details.watering_amount_ml = m.volumeMl;
  if (m.inputPh !== null) details.ph = m.inputPh;
  if (m.inputEcMsCm !== null) details.ec = m.inputEcMsCm;
  if (m.outputEcMsCm !== null) details.ec_out = m.outputEcMsCm;
  if (m.runoffMl !== null) details.runoff_ml = m.runoffMl;
  if (m.runoffPh !== null) details.runoff_ph = m.runoffPh;
  if (m.runoffEcMsCm !== null) details.runoff_ec = m.runoffEcMsCm;
  if (m.waterTempC !== null) details.water_temp_c = m.waterTempC;
  if (m.nutrientLine !== null) {
    details.nutrient_line_id = m.nutrientLine;
    details.recipe = m.nutrientLine;
  }
  if (m.products.length > 0) details.nutrients = m.products;
  if (observation.invalidFields && observation.invalidFields.length > 0) {
    details.root_zone_invalid_fields = [...observation.invalidFields];
  }
  return details;
}

function compareObservations(a: RootZoneObservationV1, b: RootZoneObservationV1): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt > b.occurredAt ? -1 : 1;
  if (a.eventType !== b.eventType) return a.eventType < b.eventType ? -1 : 1;
  // Complete serialized tie-break keeps equal-time observations stable even
  // when only provenance differs and caller order is shuffled.
  const aj = JSON.stringify(a);
  const bj = JSON.stringify(b);
  return aj < bj ? -1 : aj > bj ? 1 : 0;
}

/** Stable newest-first sort, exact-content dedupe, and hard cap. */
export function sortAndBoundRootZoneObservations(
  observations: readonly RootZoneObservationV1[] | null | undefined,
  cap: number = ROOT_ZONE_OBSERVATION_CAP,
): RootZoneObservationV1[] {
  const boundedCap = Math.max(0, Math.min(ROOT_ZONE_OBSERVATION_CAP, Math.floor(cap)));
  if (boundedCap === 0) return [];
  const sorted = [...(observations ?? [])].sort(compareObservations);
  const out: RootZoneObservationV1[] = [];
  const seen = new Set<string>();
  for (const observation of sorted) {
    const key = JSON.stringify(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(observation);
    if (out.length >= boundedCap) break;
  }
  return out;
}

export function buildRootZoneObservationsFromRows(
  rows: readonly RootZoneGrowEventRowLike[] | null | undefined,
  cap: number = ROOT_ZONE_OBSERVATION_CAP,
  manualObservationDiaryRows:
    | readonly RootZoneManualObservationDiaryRowLike[]
    | null
    | undefined = [],
): RootZoneObservationV1[] {
  const companionIndex = buildRootZoneManualObservationCompanionIndex(manualObservationDiaryRows);
  const observations: RootZoneObservationV1[] = [];
  for (const row of rows ?? []) {
    const observation = buildRootZoneObservationFromGrowEvent(row, companionIndex);
    if (observation) observations.push(observation);
  }
  return sortAndBoundRootZoneObservations(observations, cap);
}
