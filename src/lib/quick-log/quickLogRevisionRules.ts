import { LARGE_WATER_AMOUNT_HARD_MAX_ML } from "@/lib/quickLogWaterVolumeWarningRules";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import {
  isHumidityValid,
  isTemperatureValid,
  isVpdValid,
} from "@/lib/sensorReadingNormalizationRules";

/**
 * Quick Log Corrections & Retractions v1 — pure rules (issue #786).
 *
 * Contracts and deterministic helpers for the append-only revision ledger
 * (public.quicklog_entry_revisions) and the retraction marker
 * (diary_entries.retracted_at / grow_events.is_deleted).
 *
 * Safety posture:
 *  - No I/O in this module. Deterministic, null-safe, injectable time.
 *  - Corrections and retractions are core Free behavior: nothing in this
 *    module (or the service/hooks built on it) may consult plan, tier, or
 *    entitlement state.
 *  - Legacy rows without revision metadata must resolve to a quiet default
 *    (no badge, visible, never a crash).
 */

export const QUICKLOG_REVISION_REASON_CODES = [
  "wrong_plant",
  "wrong_tent",
  "wrong_time",
  "typo",
  "wrong_value",
  "duplicate",
  "test_entry",
  "accidental",
  "other",
] as const;

export type QuickLogRevisionReasonCode = (typeof QUICKLOG_REVISION_REASON_CODES)[number];

export const QUICKLOG_REVISION_REASON_LABELS: Record<QuickLogRevisionReasonCode, string> = {
  wrong_plant: "Wrong plant",
  wrong_tent: "Wrong tent",
  wrong_time: "Wrong time",
  typo: "Typo",
  wrong_value: "Wrong value",
  duplicate: "Duplicate",
  test_entry: "Test entry",
  accidental: "Logged by accident",
  other: "Other",
};

/** Chips offered when correcting an entry. */
export const QUICKLOG_CORRECTION_REASON_CHIPS: QuickLogRevisionReasonCode[] = [
  "wrong_plant",
  "typo",
  "wrong_time",
  "wrong_value",
  "other",
];

/** Chips offered when retracting an entry. */
export const QUICKLOG_RETRACTION_REASON_CHIPS: QuickLogRevisionReasonCode[] = [
  "accidental",
  "test_entry",
  "duplicate",
  "wrong_plant",
  "other",
];

export const QUICKLOG_REVISION_NOTE_MAX_LENGTH = 500;
export const QUICKLOG_CORRECTED_NOTE_MAX_LENGTH = 4000;

export const QUICKLOG_RETRACT_DIALOG_TITLE = "Retract this Quick Log?";
export const QUICKLOG_RETRACT_DIALOG_BODY =
  "This removes the entry from your active history, summaries, and AI context. " +
  "The original entry and this retraction stay in your audit trail — nothing is deleted.";
export const QUICKLOG_RETRACT_CONFIRM_LABEL = "Retract entry";
export const QUICKLOG_CORRECT_DIALOG_TITLE = "Correct this Quick Log";
export const QUICKLOG_CORRECT_DIALOG_BODY = "The original values are kept in the entry's history.";
export const QUICKLOG_EDITED_BADGE_LABEL = "edited";
export const QUICKLOG_RETRACTED_BADGE_LABEL = "retracted";

export type QuickLogRevisionKind = "correction" | "retraction";

/** Raw ledger row as selected from public.quicklog_entry_revisions. */
export interface QuickLogRevisionRow {
  id: string;
  grow_event_id: string | null;
  diary_entry_id: string | null;
  root_id: string;
  user_id: string;
  actor_id: string;
  revision_no: number;
  kind: string;
  reason_code: string;
  reason_note: string | null;
  previous_state: unknown;
  new_state: unknown;
  created_at: string;
}

export interface QuickLogRevision {
  id: string;
  rootId: string;
  growEventId: string | null;
  diaryEntryId: string | null;
  revisionNo: number;
  kind: QuickLogRevisionKind;
  reasonCode: QuickLogRevisionReasonCode;
  reasonNote: string | null;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown> | null;
  createdAt: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Parse one ledger row. Malformed rows return null instead of throwing so a
 * single bad row can never take down a timeline surface.
 */
export function parseQuickLogRevisionRow(
  row: QuickLogRevisionRow | null | undefined,
): QuickLogRevision | null {
  if (!row || !isNonEmptyString(row.id) || !isNonEmptyString(row.root_id)) {
    return null;
  }
  if (row.kind !== "correction" && row.kind !== "retraction") return null;
  if (!Number.isInteger(row.revision_no) || (row.revision_no as number) < 1) {
    return null;
  }
  const reason = (QUICKLOG_REVISION_REASON_CODES as readonly string[]).includes(row.reason_code)
    ? (row.reason_code as QuickLogRevisionReasonCode)
    : null;
  if (!reason) return null;
  if (!isNonEmptyString(row.created_at)) return null;
  return {
    id: row.id,
    rootId: row.root_id,
    growEventId: row.grow_event_id ?? null,
    diaryEntryId: row.diary_entry_id ?? null,
    revisionNo: row.revision_no,
    kind: row.kind,
    reasonCode: reason,
    reasonNote: isNonEmptyString(row.reason_note) ? row.reason_note : null,
    previousState: isPlainObject(row.previous_state) ? row.previous_state : {},
    newState: isPlainObject(row.new_state) ? row.new_state : null,
    createdAt: row.created_at,
  };
}

/** Deterministic order: revision_no ascending, id as an explicit tiebreaker. */
export function sortQuickLogRevisions(revisions: readonly QuickLogRevision[]): QuickLogRevision[] {
  return [...revisions].sort((a, b) => {
    if (a.revisionNo !== b.revisionNo) return a.revisionNo - b.revisionNo;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface QuickLogRevisionBadge {
  correctionCount: number;
  retracted: boolean;
  lastRevisionAt: string | null;
}

/** Legacy default: entries with no ledger rows are badge-free. */
export const EMPTY_QUICKLOG_REVISION_BADGE: QuickLogRevisionBadge = {
  correctionCount: 0,
  retracted: false,
  lastRevisionAt: null,
};

/**
 * Group parsed ledger rows by root id into compact badge state for the
 * timeline/history surfaces. Roots absent from the map are untouched legacy
 * entries and must render exactly as before.
 */
export function buildQuickLogRevisionBadges(
  rows: readonly (QuickLogRevisionRow | null | undefined)[] | null | undefined,
): Map<string, QuickLogRevisionBadge> {
  const badges = new Map<string, QuickLogRevisionBadge>();
  if (!rows) return badges;
  for (const raw of rows) {
    const rev = parseQuickLogRevisionRow(raw);
    if (!rev) continue;
    const prior = badges.get(rev.rootId) ?? { ...EMPTY_QUICKLOG_REVISION_BADGE };
    const next: QuickLogRevisionBadge = {
      correctionCount: prior.correctionCount + (rev.kind === "correction" ? 1 : 0),
      retracted: prior.retracted || rev.kind === "retraction",
      lastRevisionAt:
        prior.lastRevisionAt === null || prior.lastRevisionAt < rev.createdAt
          ? rev.createdAt
          : prior.lastRevisionAt,
    };
    badges.set(rev.rootId, next);
  }
  return badges;
}

/** Row shapes the retraction predicate accepts (diary reads select details + retracted_at). */
export interface RetractableDiaryRowLike {
  retracted_at?: string | null;
}

/**
 * Operational-read predicate for diary rows. Null/undefined (legacy rows and
 * readers that have not selected the column) means NOT retracted.
 */
export function isRetractedDiaryRow(row: RetractableDiaryRowLike | null | undefined): boolean {
  return typeof row?.retracted_at === "string" && row.retracted_at.length > 0;
}

/** Merged writer bound, still used for feeding volume (Quick Log Feed allows 1,000,000 ml). */
export const QUICKLOG_CORRECTION_VOLUME_MAX_ML = 1_000_000;
/** A watering correction uses the Quick Log single-watering ceiling (#2110). */
export const QUICKLOG_CORRECTION_WATERING_VOLUME_MAX_ML = LARGE_WATER_AMOUNT_HARD_MAX_ML;
/** Merged feeding product amount bound in root-zone observation rules. */
export const QUICKLOG_CORRECTION_DOSE_MAX = 1_000_000;

export interface QuickLogCorrectionSensorValues {
  temperature_c?: number;
  humidity_pct?: number;
  vpd_kpa?: number;
}

export type QuickLogCorrectionValueKind = "watering" | "feeding" | "sensor";

export interface QuickLogCorrectionValueContext {
  kind: QuickLogCorrectionValueKind;
  volumeMl?: number | null;
  doseAmount?: number | null;
  sensor?: QuickLogCorrectionSensorValues | null;
}

export interface QuickLogCorrectionChanges {
  note?: string | null;
  occurredAt?: string;
  targetType?: "plant" | "tent";
  targetId?: string;
  volumeMl?: number;
  /** Which entry the volume belongs to; a watering volume is capped lower. Not sent. */
  volumeKind?: "watering" | "feeding";
  doseAmount?: number;
  sensorValues?: QuickLogCorrectionSensorValues;
}

export type QuickLogCorrectionValidation =
  | { ok: true; changes: Record<string, unknown> }
  | { ok: false; reason: "no_changes" | "invalid_changes" | "invalid_note" };

/**
 * Client-side pre-validation mirroring the RPC's checks. The RPC remains
 * authoritative; this exists so the dialog can fail fast and calmly.
 */
export function validateQuickLogCorrection(
  input: QuickLogCorrectionChanges | null | undefined,
  reasonNote?: string | null,
  now: () => Date = () => new Date(),
): QuickLogCorrectionValidation {
  if (reasonNote && reasonNote.length > QUICKLOG_REVISION_NOTE_MAX_LENGTH) {
    return { ok: false, reason: "invalid_note" };
  }
  if (!input) return { ok: false, reason: "no_changes" };
  const changes: Record<string, unknown> = {};
  if (input.note !== undefined) {
    if (typeof input.note === "string" && input.note.length > QUICKLOG_CORRECTED_NOTE_MAX_LENGTH) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.note = input.note;
  }
  if (input.occurredAt !== undefined) {
    const parsed = Date.parse(input.occurredAt);
    if (Number.isNaN(parsed)) return { ok: false, reason: "invalid_changes" };
    if (parsed > now().getTime() + 5 * 60 * 1000) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.occurred_at = input.occurredAt;
  }
  const hasType = input.targetType !== undefined;
  const hasId = input.targetId !== undefined;
  if (hasType !== hasId) return { ok: false, reason: "invalid_changes" };
  if (hasType) {
    if (input.targetType !== "plant" && input.targetType !== "tent") {
      return { ok: false, reason: "invalid_changes" };
    }
    if (!isNonEmptyString(input.targetId)) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.target_type = input.targetType;
    changes.target_id = input.targetId;
  }
  if (input.volumeMl !== undefined) {
    if (!isCorrectionVolumeMl(input.volumeMl, input.volumeKind)) {
      return { ok: false, reason: "invalid_changes" };
    }
    changes.volume_ml = input.volumeMl;
  }
  if (input.doseAmount !== undefined) {
    if (!isCorrectionDoseAmount(input.doseAmount)) return { ok: false, reason: "invalid_changes" };
    changes.dose_amount = input.doseAmount;
  }
  if (input.sensorValues !== undefined) {
    const sensor = normalizeCorrectionSensorValues(input.sensorValues);
    if (!sensor) return { ok: false, reason: "invalid_changes" };
    changes.sensor_values = sensor;
  }
  if (Object.keys(changes).length === 0) {
    return { ok: false, reason: "no_changes" };
  }
  return { ok: true, changes };
}

function isCorrectionVolumeMl(
  value: unknown,
  kind: QuickLogCorrectionChanges["volumeKind"],
): value is number {
  const max =
    kind === "watering"
      ? QUICKLOG_CORRECTION_WATERING_VOLUME_MAX_ML
      : QUICKLOG_CORRECTION_VOLUME_MAX_ML;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
}

function isCorrectionDoseAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= QUICKLOG_CORRECTION_DOSE_MAX
  );
}

function normalizeCorrectionSensorValues(
  input: QuickLogCorrectionSensorValues | null,
): QuickLogCorrectionSensorValues | null {
  if (!input || typeof input !== "object") return null;
  const next: QuickLogCorrectionSensorValues = {};
  if (input.temperature_c !== undefined) {
    if (!isTemperatureValid(input.temperature_c) || input.temperature_c === null) return null;
    next.temperature_c = input.temperature_c;
  }
  if (input.humidity_pct !== undefined) {
    if (!isHumidityValid(input.humidity_pct) || input.humidity_pct === null) return null;
    next.humidity_pct = input.humidity_pct;
  }
  if (input.vpd_kpa !== undefined) {
    if (!isVpdValid(input.vpd_kpa) || input.vpd_kpa === null) return null;
    next.vpd_kpa = input.vpd_kpa;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function doseFromDetails(details: Record<string, unknown>): number | null {
  const feeding = isPlainObject(details.feeding) ? details.feeding : null;
  const products = feeding && Array.isArray(feeding.products) ? feeding.products : null;
  const firstProduct = products && isPlainObject(products[0]) ? products[0] : null;
  if (firstProduct) {
    const amount = finiteOrNull(firstProduct.amount);
    if (amount !== null) return amount;
  }
  const nutrients = Array.isArray(details.nutrients) ? details.nutrients : null;
  const firstNutrient = nutrients && isPlainObject(nutrients[0]) ? nutrients[0] : null;
  return firstNutrient ? finiteOrNull(firstNutrient.amount) : null;
}

function sensorFromDetails(
  details: Record<string, unknown>,
): QuickLogCorrectionSensorValues | null {
  const snapshot = isPlainObject(details.sensor_snapshot)
    ? details.sensor_snapshot
    : isPlainObject(details.manual_sensor_snapshot)
      ? details.manual_sensor_snapshot
      : null;
  const metrics = snapshot && isPlainObject(snapshot.metrics) ? snapshot.metrics : snapshot;
  if (!metrics) return null;
  const sensor: QuickLogCorrectionSensorValues = {};
  // PlantQuickLog V2 persists manual_sensor_snapshot as temp_f / humidity_percent.
  const tempF = finiteOrNull(metrics.temp_f);
  const temperature =
    finiteOrNull(metrics.temperature_c) ??
    (tempF === null ? null : Math.round(fahrenheitToCelsius(tempF) * 10) / 10);
  const humidity = finiteOrNull(metrics.humidity_pct) ?? finiteOrNull(metrics.humidity_percent);
  const vpd = finiteOrNull(metrics.vpd_kpa);
  if (temperature !== null) sensor.temperature_c = temperature;
  if (humidity !== null) sensor.humidity_pct = humidity;
  if (vpd !== null) sensor.vpd_kpa = vpd;
  return Object.keys(sensor).length > 0 ? sensor : null;
}

export const QUICKLOG_CORRECTION_ENVIRONMENT_CHECK_READINGS_NOTE =
  "Temperature and humidity on this Environment check can't be corrected yet. You can still correct the note, time, or plant.";

/**
 * Explains why the correction dialog shows no temperature or humidity fields
 * for an Environment Check whose readings live only in
 * details.environment_check (no sensor snapshot). The correction RPC rejects
 * sensor changes for those entries (20261014210000, "unsupported_change"), so
 * fields there could never save. Null for every other entry.
 */
export function quickLogCorrectionEnvironmentCheckReadingsNote(details: unknown): string | null {
  if (!isPlainObject(details)) return null;
  const check = details.environment_check;
  if (!isPlainObject(check)) return null;
  if (finiteOrNull(check.temp_c) === null && finiteOrNull(check.humidity_pct) === null) {
    return null;
  }
  if (sensorFromDetails(details)) return null;
  return QUICKLOG_CORRECTION_ENVIRONMENT_CHECK_READINGS_NOTE;
}

/**
 * Which value the correction dialog can edit for one saved Quick Log entry.
 * Returns null for notes, photos, and any other entry type.
 */
export function correctionValuesForTimelineAction(
  action: {
    kind: string;
    volumeMl?: number | null;
    aiDoctorPhase1Evidence?: { details?: unknown } | null;
  },
  readings?: ReadonlyArray<{ field: string; value: number }>,
): QuickLogCorrectionValueContext | null {
  const sensor = sensorFromReadings(readings);
  if (action.kind === "water") {
    const volumeMl =
      typeof action.volumeMl === "number" && Number.isFinite(action.volumeMl)
        ? action.volumeMl
        : null;
    // A watering log saved with readings has an environment sibling; the
    // dialog corrects the volume and those readings together.
    return sensor ? { kind: "watering", volumeMl, sensor } : { kind: "watering", volumeMl };
  }
  const fromEvidence = correctionValuePropsFromDiaryDetails(action.aiDoctorPhase1Evidence?.details);
  if (fromEvidence?.kind === "feeding") return fromEvidence;
  return sensor ? { kind: "sensor", sensor } : null;
}

function sensorFromReadings(
  readings: ReadonlyArray<{ field: string; value: number }> | undefined,
): QuickLogCorrectionSensorValues | null {
  const sensor: QuickLogCorrectionSensorValues = {};
  for (const reading of readings ?? []) {
    if (reading.field === "air_temp_c") sensor.temperature_c = reading.value;
    if (reading.field === "humidity_pct") sensor.humidity_pct = reading.value;
    if (reading.field === "vpd_kpa") sensor.vpd_kpa = reading.value;
  }
  return Object.keys(sensor).length > 0 ? sensor : null;
}

export function correctionValuePropsFromDiaryDetails(
  details: unknown,
): QuickLogCorrectionValueContext | null {
  if (!isPlainObject(details)) return null;
  const eventType = typeof details.event_type === "string" ? details.event_type : "";
  if (eventType === "watering") {
    const watering = isPlainObject(details.watering) ? details.watering : null;
    const structured = finiteOrNull(watering?.volume_ml);
    const flat = finiteOrNull(details.watering_amount_ml) ?? finiteOrNull(details.wateringAmountMl);
    return { kind: "watering", volumeMl: structured ?? flat };
  }
  if (eventType === "feeding") {
    const feeding = isPlainObject(details.feeding) ? details.feeding : null;
    const structured = finiteOrNull(feeding?.volume_ml);
    const flat = finiteOrNull(details.watering_amount_ml) ?? finiteOrNull(details.wateringAmountMl);
    const volumeMl = structured ?? flat;
    const doseAmount = doseFromDetails(details);
    return volumeMl == null
      ? { kind: "feeding", doseAmount }
      : { kind: "feeding", doseAmount, volumeMl };
  }
  if (
    eventType === "environment" ||
    eventType === "environment_check" ||
    eventType === "manual_sensor_snapshot"
  ) {
    // The correction RPC writes sensor values into sensor_snapshot.metrics.
    // An Environment Check keeps its readings only in details.environment_check,
    // so blank fields here would save a revision that changes nothing.
    const sensor = sensorFromDetails(details);
    return sensor ? { kind: "sensor", sensor } : null;
  }
  // V2 Fast Check stores the action as an observation and the measurements
  // on the environment companion. Timeline merge keeps those metrics on the
  // same details object while the spine event_type stays observation.
  if (eventType === "observation") {
    const sensor = sensorFromDetails(details);
    if (sensor) return { kind: "sensor", sensor };
  }
  return null;
}

interface TimelineEnvironmentChild {
  temperature_c?: unknown;
  humidity_pct?: unknown;
  vpd_kpa?: unknown;
}

interface TimelineEnvironmentSibling {
  id?: string;
  event_type?: unknown;
  source?: unknown;
  plant_id?: string | null;
  occurred_at?: unknown;
  created_at?: unknown;
  environment_events?: TimelineEnvironmentChild | readonly TimelineEnvironmentChild[] | null;
}

function sensorFromEnvironmentChild(
  child: TimelineEnvironmentChild | null | undefined,
): QuickLogCorrectionSensorValues | null {
  if (!child) return null;
  const sensor: QuickLogCorrectionSensorValues = {};
  const temperature = finiteOrNull(child.temperature_c);
  const humidity = finiteOrNull(child.humidity_pct);
  const vpd = finiteOrNull(child.vpd_kpa);
  if (temperature !== null) sensor.temperature_c = temperature;
  if (humidity !== null) sensor.humidity_pct = humidity;
  if (vpd !== null) sensor.vpd_kpa = vpd;
  return Object.keys(sensor).length > 0 ? sensor : null;
}

/** Readings on the manual environment row saved in the same request as `root`. */
function sensorFromExactEnvironmentSibling(
  root: TimelineEnvironmentSibling,
  rows: readonly TimelineEnvironmentSibling[],
): QuickLogCorrectionSensorValues | null {
  if (typeof root.created_at !== "string") return null;
  const companion = rows.find(
    (row) =>
      row.id !== root.id &&
      row.event_type === "environment" &&
      row.source === "manual" &&
      row.created_at === root.created_at,
  );
  if (!companion) return null;
  const child = Array.isArray(companion.environment_events)
    ? companion.environment_events[0]
    : companion.environment_events;
  return sensorFromEnvironmentChild(child);
}

/**
 * Timeline diary cards for a V2 Fast Check keep the note on the observation
 * row. The temperature, humidity, and VPD live on the same-instant manual
 * environment sibling, not in diary details.
 */
export function correctionValuesForTimelineDiaryEntry(
  entry: { details?: unknown; plant_id?: string | null; entry_at?: string | null },
  growEvents?: readonly TimelineEnvironmentSibling[],
): QuickLogCorrectionValueContext | null {
  const fromDetails = correctionValuePropsFromDiaryDetails(entry?.details);
  const details = isPlainObject(entry?.details) ? entry.details : null;
  const linkedId = details ? nonEmpty(details.linked_grow_event_id) : null;
  if (fromDetails?.kind === "watering" && linkedId) {
    // A watering log saved with readings has an exact manual environment
    // sibling (same created_at as its root). Tied backdated waterings share an
    // occurred_at, so only that exact sibling may supply the readings.
    const root = (growEvents ?? []).find((row) => row.id === linkedId);
    const sensor = root ? sensorFromExactEnvironmentSibling(root, growEvents ?? []) : null;
    return sensor ? { ...fromDetails, sensor } : fromDetails;
  }
  if (fromDetails) return fromDetails;
  if (!details) return null;
  // Quick Log V2 diary companions link to their spine root: PlantQuickLog
  // stamps event_type "quick_log", the Fast Check sheet stamps none. Resolve
  // any linked companion through that root, like an observation row.
  const isLinkedEnvelope = details.event_type !== "observation" && linkedId !== null;
  if (details.event_type !== "observation" && !isLinkedEnvelope) return null;
  const entryAt = entry?.entry_at;
  if (typeof entryAt !== "string") return null;
  const entryMs = Date.parse(entryAt);
  if (!Number.isFinite(entryMs)) return null;
  const plantId = entry?.plant_id ?? null;
  const rows = growEvents ?? [];
  if (linkedId) {
    const root = rows.find((row) => row.id === linkedId);
    // Only an observation root accepts sensor corrections server-side.
    if (isLinkedEnvelope && root?.event_type !== "observation") return null;
    if (root && typeof root.created_at === "string") {
      const sensor = sensorFromExactEnvironmentSibling(root, rows);
      return sensor ? { kind: "sensor", sensor } : null;
    }
    // A persisted link whose root is not loaded yet (or failed to load) must
    // not borrow a same-time sibling; only unlinked legacy rows use the matcher.
    return null;
  }
  for (const row of rows) {
    if (row.event_type !== "environment" || row.source !== "manual") continue;
    if ((row.plant_id ?? null) !== plantId) continue;
    if (typeof row.occurred_at !== "string" || Date.parse(row.occurred_at) !== entryMs) continue;
    const child = Array.isArray(row.environment_events)
      ? row.environment_events[0]
      : row.environment_events;
    const sensor = sensorFromEnvironmentChild(child);
    if (sensor) return { kind: "sensor", sensor };
  }
  return null;
}

export interface QuickLogEntryHandleRef {
  growEventId?: string;
  diaryEntryId?: string;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the correction/retraction handle for one loose raw entry as seen
 * by the history panels. Returns null for rows that cannot be identified as
 * Quick Log entries — those keep their existing Edit/Remove controls and get
 * no new affordances (legacy-safe default).
 */
export function resolveQuickLogEntryHandle(
  raw: { id?: unknown; details?: unknown } | null | undefined,
): QuickLogEntryHandleRef | null {
  if (!raw) return null;
  const id = nonEmpty(raw.id);
  const details = isPlainObject(raw.details) ? raw.details : null;
  if (!details) return null;
  const origin = nonEmpty(details.origin_grow_event_id);
  if (origin) return { growEventId: origin };
  const linked = nonEmpty(details.linked_grow_event_id) ?? nonEmpty(details.grow_event_id);
  if (linked) return { growEventId: linked };
  if (!id) return null;
  if (
    "quick_log_version" in details ||
    details.event_type === "quicklog_photo_attachment" ||
    details.event_type === "quicklog_video_attachment" ||
    details.kind === "pheno_evidence_receipt" ||
    // Standalone Photo activity writes event_type "photo"; the compound
    // check keeps ordinary diary photo entries (no Quick Log envelope)
    // out of scope.
    (details.event_type === "photo" &&
      details.source === "manual" &&
      "attached_to_action" in details)
  ) {
    return { diaryEntryId: id };
  }
  return null;
}

/**
 * Index raw entries by their row id so history rows (which only keep the id)
 * can look their handle back up. Rows without a handle are simply absent.
 */
export function buildQuickLogEntryHandleIndex(
  rawEntries: readonly unknown[] | null | undefined,
): Map<string, QuickLogEntryHandleRef> {
  const index = new Map<string, QuickLogEntryHandleRef>();
  for (const raw of rawEntries ?? []) {
    if (!isPlainObject(raw)) continue;
    const id = nonEmpty(raw.id);
    if (!id) continue;
    const handle = resolveQuickLogEntryHandle(raw);
    if (handle) index.set(id, handle);
  }
  return index;
}

/** Root id used for badge lookups: the spine id when present, else the diary id. */
export function handleRootId(handle: QuickLogEntryHandleRef): string {
  return handle.growEventId ?? handle.diaryEntryId ?? "";
}

/** Calm copy for expected RPC failure reasons. */
export const QUICKLOG_REVISION_FAILURE_COPY: Record<string, string> = {
  not_authenticated: "Sign in to change this entry.",
  missing_root: "This entry could not be identified.",
  not_found_or_not_owned: "This entry could not be found in your diary.",
  not_quicklog: "Only Quick Log entries can be changed here.",
  already_retracted: "This entry was already retracted.",
  invalid_reason: "Pick a reason for the change.",
  invalid_note: "The note is too long.",
  no_changes: "Nothing to change yet.",
  unsupported_change: "That change is not supported for this entry.",
  invalid_changes: "Those changes could not be applied.",
  target_not_owned: "That plant or tent is not in your grows.",
  grow_not_owned: "That grow is not yours.",
  // PGRST202/42883: the RPC does not exist on the server, so nothing ran.
  // Production served a client ahead of its migration (QA 2026-09-24,
  // BUG-021; again 2026-10-21). The grower must know the entry is unchanged
  // and that retrying cannot help until the server is updated.
  rpc_unavailable:
    "Correcting or retracting entries isn't set up on the server yet. Nothing was changed. Trying again won't help until the server is updated.",
  forbidden: "You do not have permission to change this entry.",
  invalid_idempotency_key: "This change could not be identified. Close and reopen the entry.",
  idempotency_conflict: "This change could not be confirmed. Close and reopen the entry.",
  receipt_mismatch:
    "This change could not be confirmed for this entry. Refresh the page before trying again.",
  rpc_error:
    "We could not confirm whether this change saved. Try again to confirm the same change.",
};

export function quickLogRevisionFailureCopy(reason: string | null | undefined): string {
  if (reason && QUICKLOG_REVISION_FAILURE_COPY[reason]) {
    return QUICKLOG_REVISION_FAILURE_COPY[reason];
  }
  return QUICKLOG_REVISION_FAILURE_COPY.rpc_error;
}
