import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../integrations/supabase/types";
import { buildGrowScopedPlantsOrFilter } from "./growAttributionRules";
import { deriveGrowWalkAttentionBand, sortGrowWalkTargets } from "./growWalkAttentionRules";
import {
  GROW_WALK_CONTRADICTION_CODES,
  GROW_WALK_MISSING_EVIDENCE_CODES,
  type GrowWalkAlertEvidence,
  type GrowWalkContradictionCode,
  type GrowWalkEvidenceDerivation,
  type GrowWalkEventEvidence,
  type GrowWalkMissingEvidenceCode,
  type GrowWalkPhotoMetadata,
  type GrowWalkSensorEvidence,
  type GrowWalkTarget,
  type GrowWalkTargetListReceipt,
} from "./growWalkContracts";
import { deriveGrowWalkEvidence } from "./growWalkEvidenceRules";
import type { OwnerScopedReadModelResult } from "./operatorAccountReadModels";
import { selectWithRetractionCompat } from "./quick-log/retractionFilterCompat";
import { readResponseCheckStatus } from "./tenSecondQuickCheckRules";

const GROW_COLUMNS = "id,name,is_archived" as const;
const TENT_COLUMNS = "id,name,grow_id,stage,is_archived" as const;
const PLANT_COLUMNS =
  "id,name,strain,tent_id,grow_id,stage,health,is_archived,medium,pot_size,plant_type,started_at" as const;
const EVENT_COLUMNS =
  "id,grow_id,tent_id,plant_id,event_type,source,occurred_at,note,created_at,is_deleted" as const;
const DIARY_PHOTO_COLUMNS =
  "id,grow_id,tent_id,plant_id,entry_at,photo_url,details,retracted_at" as const;
/** Pre-migration fallback: no retracted_at projection exists yet. */
const LEGACY_DIARY_PHOTO_COLUMNS =
  "id,grow_id,tent_id,plant_id,entry_at,photo_url,details" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;

const TARGET_SUMMARY_LOOKBACK_HOURS = 72;
const TARGET_SUMMARY_ROW_LIMIT = 500;
/** One extra row makes each lane's truncation receipt authoritative. */
const TARGET_SUMMARY_FETCH_LIMIT = TARGET_SUMMARY_ROW_LIMIT + 1;
/** Bounds the target-list pass; exact context performs the detailed sensor read. */
const TARGET_CANDIDATE_LIMIT = 100;
const HOUR_MS = 60 * 60 * 1000;

interface GrowRow {
  readonly id: string;
  readonly name: string;
  readonly is_archived: boolean | null;
}

type PublicGrow = Pick<GrowRow, "id" | "name">;

interface TentRow {
  readonly id: string;
  readonly name: string;
  readonly grow_id: string | null;
  readonly stage: string | null;
  readonly is_archived: boolean | null;
}

interface PlantRow {
  readonly id: string;
  readonly name: string;
  readonly strain: string | null;
  readonly tent_id: string | null;
  readonly grow_id: string | null;
  readonly stage: string | null;
  readonly health: string | null;
  readonly is_archived: boolean | null;
  readonly medium: string | null;
  readonly pot_size: string | null;
  readonly plant_type: string | null;
  readonly started_at: string | null;
}

interface EventRow {
  readonly id: string;
  readonly grow_id: string;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly event_type: string;
  readonly source: string;
  readonly occurred_at: string;
  readonly note: string | null;
  readonly created_at: string;
  readonly is_deleted: boolean | null;
}

/** The raw photo reference is used only as a presence signal and is never projected. */
interface DiaryPhotoRow {
  readonly id: string;
  readonly grow_id: string;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly entry_at: string;
  readonly photo_url: unknown;
  readonly details: unknown;
  readonly retracted_at: string | null;
}

interface AlertRow {
  readonly id: string;
  readonly grow_id: string;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly title: string;
  readonly reason: string;
  readonly severity: string;
  readonly status: string;
  readonly metric: string | null;
  readonly source: string;
  readonly last_seen_at: string;
}

export interface ListGrowWalkTargetsOptions {
  readonly includeInactivePlants?: boolean;
  readonly limit?: number;
  /** Injectable clock for deterministic callers and focused tests. */
  readonly now?: Date;
}

type OwnerScopedClient = SupabaseClient<Database>;

const MAJOR_CHANGE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "watering",
  "feeding",
  "training",
  "transplant",
  "treatment",
  "flush",
  "environment_change",
  "light_change",
  "irrigation_change",
]);

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 ? result : null;
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(1, Math.trunc(value as number)));
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestIso(values: readonly (string | null | undefined)[]): string | null {
  let latestValue: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = toMs(value);
    if (ms !== null && ms > latestMs) {
      latestMs = ms;
      latestValue = value ?? null;
    }
  }
  return latestValue;
}

function excerpt(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, 240) : null;
}

function eventResponse(eventType: string, note: string | null): GrowWalkEventEvidence["response"] {
  const type = normalize(eventType);
  if (type === "better" || type.endsWith("_better")) return "better";
  if (type === "same" || type.endsWith("_same")) return "same";
  if (type === "worse" || type.endsWith("_worse")) return "worse";
  const response = readResponseCheckStatus(note ?? "");
  if (response === "Better") return "better";
  if (response === "Same") return "same";
  if (response === "Worse") return "worse";
  return null;
}

function toEventEvidence(row: EventRow): GrowWalkEventEvidence {
  const type = normalize(row.event_type);
  return {
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    source: row.source,
    noteExcerpt: excerpt(row.note),
    isMajorChange: MAJOR_CHANGE_EVENT_TYPES.has(type),
    response: eventResponse(type, row.note),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonBlankString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Top-level is canonical; details is the legacy Quick Log fallback. */
function hasDiaryPhotoReference(row: DiaryPhotoRow): boolean {
  if (hasNonBlankString(row.photo_url)) return true;
  return isRecord(row.details) && hasNonBlankString(row.details.photo_url);
}

function isRetracted(row: DiaryPhotoRow): boolean {
  return hasNonBlankString(row.retracted_at);
}

function toDiaryPhotoMetadata(row: DiaryPhotoRow): GrowWalkPhotoMetadata {
  return {
    id: row.id,
    capturedAt: row.entry_at,
    // diary_entries does not carry a trustworthy origin field. Preserve that
    // limitation rather than copying untrusted metadata into the receipt.
    source: "diary",
    inspectedInThisRun: false,
  };
}

function normalizeSeverity(value: string): GrowWalkAlertEvidence["severity"] {
  const severity = normalize(value);
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "warning" || severity === "medium") return "medium";
  return "low";
}

function activeAlertStatus(value: string): "open" | "acknowledged" | null {
  const status = normalize(value);
  return status === "open" || status === "acknowledged" ? status : null;
}

function toAlertEvidence(row: AlertRow): GrowWalkAlertEvidence | null {
  const status = activeAlertStatus(row.status);
  if (!status) return null;
  return {
    id: row.id,
    title: excerpt(row.title) ?? "Alert",
    reasonExcerpt: excerpt(row.reason) ?? "Alert requires review.",
    severity: normalizeSeverity(row.severity),
    status,
    metric: row.metric,
    source: row.source,
    lastSeenAt: row.last_seen_at,
  };
}

function highestSeverity(
  alerts: readonly GrowWalkAlertEvidence[],
): "low" | "medium" | "high" | null {
  if (alerts.some((alert) => alert.severity === "high")) return "high";
  if (alerts.some((alert) => alert.severity === "medium")) return "medium";
  if (alerts.some((alert) => alert.severity === "low")) return "low";
  return null;
}

function emptySensorEvidence(): GrowWalkSensorEvidence {
  return { available: false, readings: {}, contradictionMetrics: [] };
}

function latestSensorTime(sensors: GrowWalkSensorEvidence): string | null {
  return latestIso(
    Object.values(sensors.readings).map((reading) => reading.captured_at ?? reading.ts),
  );
}

function orderedMissing(
  codes: ReadonlySet<GrowWalkMissingEvidenceCode>,
): readonly GrowWalkMissingEvidenceCode[] {
  return Object.freeze(GROW_WALK_MISSING_EVIDENCE_CODES.filter((code) => codes.has(code)));
}

function orderedContradictions(
  codes: ReadonlySet<GrowWalkContradictionCode>,
): readonly GrowWalkContradictionCode[] {
  return Object.freeze(GROW_WALK_CONTRADICTION_CODES.filter((code) => codes.has(code)));
}

function augmentDerivation(
  source: GrowWalkEvidenceDerivation,
  options: {
    readonly missing?: readonly GrowWalkMissingEvidenceCode[];
    readonly contradictions?: readonly GrowWalkContradictionCode[];
  },
): GrowWalkEvidenceDerivation {
  const missing = new Set(source.missingEvidenceCodes);
  for (const code of options.missing ?? []) missing.add(code);
  const contradictions = new Set(source.contradictionCodes);
  for (const code of options.contradictions ?? []) contradictions.add(code);
  return {
    ...source,
    missingEvidenceCodes: orderedMissing(missing),
    contradictionCodes: orderedContradictions(contradictions),
    evidenceConfidence:
      contradictions.size > 0 || source.evidenceConfidence === "low"
        ? "low"
        : source.evidenceConfidence,
  };
}

function plantEvents(
  rows: readonly EventRow[],
  plantId: string,
  tentId: string | null,
): readonly EventRow[] {
  return rows.filter(
    (row) =>
      !row.is_deleted &&
      (row.plant_id === plantId ||
        (tentId !== null &&
          row.plant_id === null &&
          row.tent_id === tentId &&
          normalize(row.event_type) === "environment")),
  );
}

function tentEvents(
  rows: readonly EventRow[],
  tentId: string,
  plantIds: ReadonlySet<string>,
): readonly EventRow[] {
  return rows.filter(
    (row) =>
      !row.is_deleted &&
      (row.tent_id === tentId || (row.plant_id !== null && plantIds.has(row.plant_id))),
  );
}

function plantPhotos(rows: readonly DiaryPhotoRow[], plantId: string): readonly DiaryPhotoRow[] {
  return rows.filter(
    (row) => row.plant_id === plantId && !isRetracted(row) && hasDiaryPhotoReference(row),
  );
}

function tentPhotos(
  rows: readonly DiaryPhotoRow[],
  tentId: string,
  plantIds: ReadonlySet<string>,
): readonly DiaryPhotoRow[] {
  return rows.filter(
    (row) =>
      !isRetracted(row) &&
      hasDiaryPhotoReference(row) &&
      (row.tent_id === tentId || (row.plant_id !== null && plantIds.has(row.plant_id))),
  );
}

function plantAlerts(
  rows: readonly AlertRow[],
  plantId: string,
  tentId: string | null,
): readonly AlertRow[] {
  return rows.filter(
    (row) =>
      activeAlertStatus(row.status) !== null &&
      (row.plant_id === plantId || (row.plant_id === null && row.tent_id === tentId)),
  );
}

function tentAlerts(
  rows: readonly AlertRow[],
  tentId: string,
  plantIds: ReadonlySet<string>,
): readonly AlertRow[] {
  return rows.filter(
    (row) =>
      activeAlertStatus(row.status) !== null &&
      (row.tent_id === tentId || (row.plant_id !== null && plantIds.has(row.plant_id))),
  );
}

function buildTarget(input: {
  readonly targetType: "tent" | "plant";
  readonly targetId: string;
  readonly growId: string;
  readonly targetArchived: boolean;
  readonly tentId: string | null;
  readonly displayName: string;
  readonly strain: string | null;
  readonly stage: string | null;
  readonly status: string | null;
  readonly plantCount: number | null;
  readonly plantType: string | null;
  readonly medium: string | null;
  readonly potSize: string | null;
  readonly events: readonly EventRow[];
  readonly photos: readonly DiaryPhotoRow[];
  readonly alerts: readonly AlertRow[];
  readonly sensors: GrowWalkSensorEvidence;
  readonly now: Date;
  readonly extraMissing?: readonly GrowWalkMissingEvidenceCode[];
  readonly extraContradictions?: readonly GrowWalkContradictionCode[];
}): GrowWalkTarget {
  const events = input.events.map(toEventEvidence);
  const photos = input.photos.map(toDiaryPhotoMetadata);
  const alerts = input.alerts.flatMap((row) => {
    const evidence = toAlertEvidence(row);
    return evidence ? [evidence] : [];
  });
  const derived = augmentDerivation(
    deriveGrowWalkEvidence({
      now: input.now,
      stage: input.stage,
      plantStatus: input.status,
      plantType: input.plantType,
      medium: input.medium,
      potSize: input.potSize,
      recentEvents: events,
      sensors: input.sensors,
      photos,
      alerts,
      aiDoctor: null,
    }),
    { missing: input.extraMissing, contradictions: input.extraContradictions },
  );
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    growId: input.growId,
    targetArchived: input.targetArchived,
    tentId: input.tentId,
    displayName: input.displayName,
    strain: input.strain,
    stage: input.stage,
    status: input.status,
    plantCount: input.plantCount,
    lastLogAt: latestIso(input.events.map((event) => event.occurred_at)),
    lastPhotoEventAt: latestIso(input.photos.map((photo) => photo.entry_at)),
    latestSensorCapturedAt: latestSensorTime(input.sensors),
    activeAlertCount: alerts.length,
    highestAlertSeverity: highestSeverity(alerts),
    recentMajorChangeCount48h: derived.recentMajorChangeCount48h,
    attentionBand: deriveGrowWalkAttentionBand(derived),
    reasonCodes: derived.reasonCodes,
    missingEvidenceCodes: derived.missingEvidenceCodes,
    latestAdverseEvidenceAt: derived.latestAdverseEvidenceAt,
    summaryComplete: false,
  };
}

function targetEvidenceUnavailable(): OwnerScopedReadModelResult<never> {
  return { ok: false, reason: "unavailable", message: "Grow Walk target evidence unavailable." };
}

/**
 * List owned tents and plants for a physical Grow Walk. RLS proves the grow
 * first; child lanes are queried only after that successful ownership lookup.
 */
export async function listGrowWalkTargetsForOwnedGrow(
  client: OwnerScopedClient,
  growId: string,
  options: ListGrowWalkTargetsOptions = {},
): Promise<
  OwnerScopedReadModelResult<{
    grow: PublicGrow;
    targets: readonly GrowWalkTarget[];
    generatedAt: string;
    receipt: GrowWalkTargetListReceipt;
  }>
> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const limit = normalizeLimit(options.limit);
  const includeInactivePlants = options.includeInactivePlants === true;
  const cutoff = new Date(now.getTime() - TARGET_SUMMARY_LOOKBACK_HOURS * HOUR_MS).toISOString();

  const { data: growData, error: growError } = await client
    .from("grows")
    .select(GROW_COLUMNS)
    .eq("id", growId)
    .maybeSingle();
  if (growError) return targetEvidenceUnavailable();
  if (!growData) {
    return { ok: false, reason: "not_found", message: "Grow not found for the signed-in grower." };
  }
  const grow = growData as GrowRow;

  const tentsResult = await client
    .from("tents")
    .select(TENT_COLUMNS)
    .eq("grow_id", growId)
    .eq("is_archived", false)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(TARGET_CANDIDATE_LIMIT + 1);
  if (tentsResult.error) return targetEvidenceUnavailable();
  const tentRows = (tentsResult.data ?? []) as TentRow[];
  const tentsTruncated = tentRows.length > TARGET_CANDIDATE_LIMIT;
  const tents = tentRows.slice(0, TARGET_CANDIDATE_LIMIT);
  const tentIds = tents.map((tent) => tent.id);
  const targetTentById = new Map(tents.map((tent) => [tent.id, tent] as const));

  let plantQuery = client
    .from("plants")
    .select(PLANT_COLUMNS)
    .or(buildGrowScopedPlantsOrFilter(growId, tentIds));
  if (!includeInactivePlants) plantQuery = plantQuery.eq("is_archived", false);
  const plantsResult = await plantQuery
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(TARGET_CANDIDATE_LIMIT + 1);
  if (plantsResult.error) return targetEvidenceUnavailable();
  const candidatePlantRows = (plantsResult.data ?? []) as PlantRow[];
  const plantsTruncated = candidatePlantRows.length > TARGET_CANDIDATE_LIMIT;
  const candidatePlants = candidatePlantRows.slice(0, TARGET_CANDIDATE_LIMIT);
  // The active target-tent list is intentionally capped. A directly attributed
  // plant can still reference an archived or omitted owned tent, so resolve
  // only the already-bounded candidate parent IDs separately. This keeps the
  // plant's historical label and shared tent Quick Log scope aligned with its
  // exact context lookup without broadening the target-tent list.
  const candidateTentIds = [
    ...new Set(candidatePlants.flatMap((plant) => (plant.tent_id ? [plant.tent_id] : []))),
  ];
  let relationTentRows: readonly TentRow[] = [];
  if (candidateTentIds.length > 0) {
    const relationTentsResult = await client
      .from("tents")
      .select(TENT_COLUMNS)
      .eq("grow_id", growId)
      .in("id", candidateTentIds)
      .order("id", { ascending: true })
      // There are at most one hundred distinct candidate IDs, so this exact
      // bound cannot silently truncate the relationship lookup.
      .limit(TARGET_CANDIDATE_LIMIT);
    if (relationTentsResult.error) return targetEvidenceUnavailable();
    relationTentRows = (relationTentsResult.data ?? []) as TentRow[];
  }
  const ownedTentById = new Map(
    relationTentRows
      .filter((tent) => candidateTentIds.includes(tent.id) && tent.grow_id === growId)
      .map((tent) => [tent.id, tent] as const),
  );
  const plants = candidatePlants.filter((plant) => {
    if (!includeInactivePlants && plant.is_archived) return false;
    const plantGrowId = clean(plant.grow_id);
    const tentId = plant.tent_id;
    const ownedTent = tentId ? (ownedTentById.get(tentId) ?? null) : null;
    // A direct grow attribution is valid without a tent, but any referenced
    // tent must be owned by the same grow. This mirrors exact context scope
    // resolution and prevents a mismatched tent from entering the list.
    if (plantGrowId) return plantGrowId === growId && (tentId === null || ownedTent !== null);
    return ownedTent !== null;
  });

  const eventsQuery = client
    .from("grow_events")
    .select(EVENT_COLUMNS)
    .eq("grow_id", growId)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TARGET_SUMMARY_FETCH_LIMIT);
  const diaryPhotoQuery = selectWithRetractionCompat((withRetractionFilter) => {
    let query = client
      .from("diary_entries")
      .select(withRetractionFilter ? DIARY_PHOTO_COLUMNS : LEGACY_DIARY_PHOTO_COLUMNS)
      .eq("grow_id", growId);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return query
      .gte("entry_at", cutoff)
      .order("entry_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(TARGET_SUMMARY_FETCH_LIMIT);
  });
  const alertsQuery = client
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("grow_id", growId)
    // An unresolved alert is current state, not historical evidence, so its
    // last observation must not make it disappear from target selection.
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(TARGET_SUMMARY_FETCH_LIMIT);
  let eventsResult: Awaited<typeof eventsQuery>;
  let diaryPhotoResult: Awaited<typeof diaryPhotoQuery>;
  let alertsResult: Awaited<typeof alertsQuery>;
  try {
    [eventsResult, diaryPhotoResult, alertsResult] = await Promise.all([
      eventsQuery,
      diaryPhotoQuery,
      alertsQuery,
    ]);
  } catch {
    return targetEvidenceUnavailable();
  }
  if (eventsResult.error || diaryPhotoResult.error || alertsResult.error)
    return targetEvidenceUnavailable();

  const eventRows = (eventsResult.data ?? []) as EventRow[];
  // The deploy-order compatibility query may use the legacy select list,
  // which intentionally omits retracted_at. Treat absent as unretracted.
  const diaryPhotoRows = (diaryPhotoResult.data ?? []) as unknown as DiaryPhotoRow[];
  const alertRows = (alertsResult.data ?? []) as AlertRow[];
  const eventsTruncated = eventRows.length > TARGET_SUMMARY_ROW_LIMIT;
  const photosTruncated = diaryPhotoRows.length > TARGET_SUMMARY_ROW_LIMIT;
  const alertsTruncated = alertRows.length > TARGET_SUMMARY_ROW_LIMIT;
  const events = eventRows.slice(0, TARGET_SUMMARY_ROW_LIMIT);
  const diaryPhotos = diaryPhotoRows.slice(0, TARGET_SUMMARY_ROW_LIMIT);
  const alerts = alertRows.slice(0, TARGET_SUMMARY_ROW_LIMIT);
  const truncatedLanes = [
    ...(eventsTruncated ? (["events"] as const) : []),
    ...(photosTruncated ? (["photos"] as const) : []),
    ...(alertsTruncated ? (["alerts"] as const) : []),
  ];
  const candidateTargetsTruncated = tentsTruncated || plantsTruncated;
  // The target-list pass intentionally omits the detailed sensor lane; only
  // get_grow_walk_context can mark a selected target's sensor evidence read.
  const summaryComplete = false;

  const plantsByTent = new Map<string, PlantRow[]>();
  for (const plant of plants) {
    if (!plant.tent_id || !targetTentById.has(plant.tent_id)) continue;
    const rows = plantsByTent.get(plant.tent_id) ?? [];
    rows.push(plant);
    plantsByTent.set(plant.tent_id, rows);
  }

  const targets: GrowWalkTarget[] = [];
  for (const tent of tents) {
    const tentPlants = plantsByTent.get(tent.id) ?? [];
    const tentPlantIds = new Set(tentPlants.map((plant) => plant.id));
    targets.push(
      buildTarget({
        targetType: "tent",
        targetId: tent.id,
        growId,
        targetArchived: grow.is_archived === true || tent.is_archived === true,
        tentId: tent.id,
        displayName: tent.name,
        strain: null,
        stage: tent.stage,
        status: null,
        plantCount: tentPlants.length,
        plantType: null,
        medium: null,
        potSize: null,
        events: tentEvents(events, tent.id, tentPlantIds),
        photos: tentPhotos(diaryPhotos, tent.id, tentPlantIds),
        alerts: tentAlerts(alerts, tent.id, tentPlantIds),
        // Target lists deliberately skip per-tent sensor snapshots so a large
        // grow cannot turn one list request into an unbounded sensor fan-out.
        // The exact context endpoint owns the detailed source-labeled read.
        sensors: emptySensorEvidence(),
        now,
      }),
    );
  }

  for (const plant of plants) {
    const ownedTent = plant.tent_id ? (ownedTentById.get(plant.tent_id) ?? null) : null;
    const legacyTentAttribution = plant.grow_id === null && ownedTent?.grow_id === growId;
    targets.push(
      buildTarget({
        targetType: "plant",
        targetId: plant.id,
        growId,
        targetArchived:
          grow.is_archived === true ||
          plant.is_archived === true ||
          ownedTent?.is_archived === true,
        tentId: ownedTent?.id ?? null,
        displayName: plant.name,
        strain: clean(plant.strain),
        stage: clean(plant.stage),
        status: clean(plant.health),
        plantCount: null,
        plantType: clean(plant.plant_type),
        medium: clean(plant.medium),
        potSize: clean(plant.pot_size),
        events: plantEvents(events, plant.id, ownedTent?.id ?? null),
        photos: plantPhotos(diaryPhotos, plant.id),
        alerts: plantAlerts(alerts, plant.id, ownedTent?.id ?? null),
        sensors: emptySensorEvidence(),
        now,
        extraMissing: legacyTentAttribution ? ["plant_profile_incomplete"] : [],
      }),
    );
  }

  const sortedTargets = sortGrowWalkTargets(targets);
  const returnedTargetsTruncated = sortedTargets.length > limit;
  const rankedTargets = sortedTargets
    .slice(0, limit)
    .map((target) => ({ ...target, summaryComplete }));

  return {
    ok: true,
    data: {
      grow: { id: grow.id, name: grow.name },
      targets: Object.freeze(rankedTargets),
      generatedAt,
      receipt: {
        candidateTargetLimit: TARGET_CANDIDATE_LIMIT,
        candidateTargetsTruncated,
        returnedTargetsTruncated,
        truncatedLanes: Object.freeze(truncatedLanes),
        omittedLanes: Object.freeze(["sensors"]),
      },
    },
  };
}
