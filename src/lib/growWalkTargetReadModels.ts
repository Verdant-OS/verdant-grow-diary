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
} from "./growWalkContracts";
import { deriveGrowWalkEvidence } from "./growWalkEvidenceRules";
import {
  selectLatestMcpSensorReadings,
  type McpSensorQueryRow,
  type OwnerScopedReadModelResult,
} from "./operatorAccountReadModels";

const GROW_COLUMNS = "id,name" as const;
const TENT_COLUMNS = "id,name,grow_id,stage,is_archived" as const;
const PLANT_COLUMNS =
  "id,name,strain,tent_id,grow_id,stage,health,is_archived,medium,pot_size,plant_type,started_at" as const;
const EVENT_COLUMNS =
  "id,grow_id,tent_id,plant_id,event_type,source,occurred_at,note,created_at,is_deleted" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;
const SENSOR_COLUMNS =
  "id,tent_id,metric,value,quality,source,ts,captured_at,created_at,raw_payload" as const;

const TARGET_SUMMARY_LOOKBACK_HOURS = 72;
const TARGET_SUMMARY_ROW_LIMIT = 500;
const HOUR_MS = 60 * 60 * 1000;

interface GrowRow {
  readonly id: string;
  readonly name: string;
}

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
  if (!normalized) return null;
  return normalized.slice(0, 240);
}

function eventResponse(eventType: string): GrowWalkEventEvidence["response"] {
  const type = normalize(eventType);
  if (type === "better" || type.endsWith("_better")) return "better";
  if (type === "same" || type.endsWith("_same")) return "same";
  if (type === "worse" || type.endsWith("_worse")) return "worse";
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
    response: eventResponse(type),
  };
}

function isPhotoEvent(row: EventRow): boolean {
  return normalize(row.event_type).includes("photo");
}

function toPhotoMetadata(row: EventRow): GrowWalkPhotoMetadata {
  return {
    id: row.id,
    capturedAt: row.occurred_at,
    source: row.source,
    inspectedInThisRun: false,
  };
}

function normalizeSeverity(value: string): GrowWalkAlertEvidence["severity"] {
  const severity = normalize(value);
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "warning" || severity === "medium") return "medium";
  return "low";
}

function isOpenAlert(row: AlertRow): boolean {
  const status = normalize(row.status);
  return status !== "resolved" && status !== "closed" && status !== "dismissed";
}

function toAlertEvidence(row: AlertRow): GrowWalkAlertEvidence {
  return {
    id: row.id,
    title: excerpt(row.title) ?? "Alert",
    reasonExcerpt: excerpt(row.reason) ?? "Alert requires review.",
    severity: normalizeSeverity(row.severity),
    status: row.status,
    metric: row.metric,
    source: row.source,
    lastSeenAt: row.last_seen_at,
  };
}

function highestSeverity(alerts: readonly GrowWalkAlertEvidence[]): "low" | "medium" | "high" | null {
  if (alerts.some((alert) => alert.severity === "high")) return "high";
  if (alerts.some((alert) => alert.severity === "medium")) return "medium";
  if (alerts.some((alert) => alert.severity === "low")) return "low";
  return null;
}

function sensorEvidenceForTent(
  rows: readonly McpSensorQueryRow[],
  tentId: string | null,
  now: Date,
): GrowWalkSensorEvidence {
  if (!tentId) return { available: false, readings: {}, contradictionMetrics: [] };
  const readings = selectLatestMcpSensorReadings(
    rows.filter((row) => row.tent_id === tentId),
    { now },
  );
  return { available: true, readings, contradictionMetrics: [] };
}

function latestSensorTime(sensors: GrowWalkSensorEvidence): string | null {
  return latestIso(
    Object.values(sensors.readings).map((reading) => reading.captured_at ?? reading.ts),
  );
}

function orderedMissing(codes: ReadonlySet<GrowWalkMissingEvidenceCode>): readonly GrowWalkMissingEvidenceCode[] {
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
): readonly EventRow[] {
  return rows.filter((row) => row.plant_id === plantId && !row.is_deleted);
}

function tentEvents(
  rows: readonly EventRow[],
  tentId: string,
  plantIds: ReadonlySet<string>,
): readonly EventRow[] {
  return rows.filter(
    (row) => !row.is_deleted && (row.tent_id === tentId || (row.plant_id !== null && plantIds.has(row.plant_id))),
  );
}

function plantAlerts(rows: readonly AlertRow[], plantId: string, tentId: string | null): readonly AlertRow[] {
  return rows.filter(
    (row) => isOpenAlert(row) && (row.plant_id === plantId || (row.plant_id === null && row.tent_id === tentId)),
  );
}

function tentAlerts(
  rows: readonly AlertRow[],
  tentId: string,
  plantIds: ReadonlySet<string>,
): readonly AlertRow[] {
  return rows.filter(
    (row) =>
      isOpenAlert(row) &&
      (row.tent_id === tentId || (row.plant_id !== null && plantIds.has(row.plant_id))),
  );
}

function buildTarget(input: {
  readonly targetType: "tent" | "plant";
  readonly targetId: string;
  readonly growId: string;
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
  readonly alerts: readonly AlertRow[];
  readonly sensors: GrowWalkSensorEvidence;
  readonly now: Date;
  readonly extraMissing?: readonly GrowWalkMissingEvidenceCode[];
  readonly extraContradictions?: readonly GrowWalkContradictionCode[];
}): GrowWalkTarget {
  const events = input.events.map(toEventEvidence);
  const alerts = input.alerts.map(toAlertEvidence);
  const photos = input.events.filter(isPhotoEvent).map(toPhotoMetadata);
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
  const attentionBand = deriveGrowWalkAttentionBand(derived);
  return {
    targetType: input.targetType,
    targetId: input.targetId,
    growId: input.growId,
    tentId: input.tentId,
    displayName: input.displayName,
    strain: input.strain,
    stage: input.stage,
    status: input.status,
    plantCount: input.plantCount,
    lastLogAt: latestIso(input.events.map((event) => event.occurred_at)),
    lastPhotoEventAt: latestIso(
      input.events.filter(isPhotoEvent).map((event) => event.occurred_at),
    ),
    latestSensorCapturedAt: latestSensorTime(input.sensors),
    activeAlertCount: alerts.length,
    highestAlertSeverity: highestSeverity(alerts),
    recentMajorChangeCount48h: derived.recentMajorChangeCount48h,
    attentionBand,
    reasonCodes: derived.reasonCodes,
    missingEvidenceCodes: derived.missingEvidenceCodes,
    latestAdverseEvidenceAt: derived.latestAdverseEvidenceAt,
  };
}

/**
 * List owned tents and plants for a physical Grow Walk. Every child query is
 * made only after the grow is proven visible through the caller's RLS session.
 */
export async function listGrowWalkTargetsForOwnedGrow(
  client: OwnerScopedClient,
  growId: string,
  options: ListGrowWalkTargetsOptions = {},
): Promise<
  OwnerScopedReadModelResult<{
    grow: GrowRow;
    targets: readonly GrowWalkTarget[];
    generatedAt: string;
  }>
> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const limit = normalizeLimit(options.limit);
  const includeInactivePlants = options.includeInactivePlants === true;
  const cutoff = new Date(now.getTime() - TARGET_SUMMARY_LOOKBACK_HOURS * HOUR_MS).toISOString();

  const { data: grow, error: growError } = await client
    .from("grows")
    .select(GROW_COLUMNS)
    .eq("id", growId)
    .maybeSingle();
  if (growError) {
    return { ok: false, reason: "unavailable", message: "Grow Walk target evidence unavailable." };
  }
  if (!grow) {
    return {
      ok: false,
      reason: "not_found",
      message: "Grow not found for the signed-in grower.",
    };
  }

  const tentsResult = await client
    .from("tents")
    .select(TENT_COLUMNS)
    .eq("grow_id", growId)
    .eq("is_archived", false)
    .order("name", { ascending: true });
  if (tentsResult.error) {
    return { ok: false, reason: "unavailable", message: "Grow Walk target evidence unavailable." };
  }
  const tents = (tentsResult.data ?? []) as TentRow[];
  const tentIds = tents.map((tent) => tent.id);
  const tentById = new Map(tents.map((tent) => [tent.id, tent] as const));

  let plantQuery = client
    .from("plants")
    .select(PLANT_COLUMNS)
    .or(buildGrowScopedPlantsOrFilter(growId, tentIds));
  if (!includeInactivePlants) plantQuery = plantQuery.eq("is_archived", false);
  const plantsResult = await plantQuery.order("name", { ascending: true });
  if (plantsResult.error) {
    return { ok: false, reason: "unavailable", message: "Grow Walk target evidence unavailable." };
  }
  const candidatePlants = (plantsResult.data ?? []) as PlantRow[];
  const plants = candidatePlants.filter((plant) => {
    if (!includeInactivePlants && plant.is_archived) return false;
    if (plant.grow_id) return plant.grow_id === growId;
    return plant.tent_id !== null && tentById.has(plant.tent_id);
  });
  const plantIds = plants.map((plant) => plant.id);

  const eventsQuery = client
    .from("grow_events")
    .select(EVENT_COLUMNS)
    .eq("grow_id", growId)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(TARGET_SUMMARY_ROW_LIMIT);
  const alertsQuery = client
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("grow_id", growId)
    .neq("status", "resolved")
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(TARGET_SUMMARY_ROW_LIMIT);
  const sensorQuery =
    tentIds.length === 0
      ? Promise.resolve({ data: [] as McpSensorQueryRow[], error: null })
      : client
          .from("sensor_readings")
          .select(SENSOR_COLUMNS)
          .in("tent_id", tentIds)
          .gte("ts", cutoff)
          .order("ts", { ascending: false })
          .limit(TARGET_SUMMARY_ROW_LIMIT);

  const [eventsResult, alertsResult, sensorResult] = await Promise.all([
    eventsQuery,
    alertsQuery,
    sensorQuery,
  ]);
  if (eventsResult.error || alertsResult.error || sensorResult.error) {
    return { ok: false, reason: "unavailable", message: "Grow Walk target evidence unavailable." };
  }

  const events = (eventsResult.data ?? []) as EventRow[];
  const alerts = (alertsResult.data ?? []) as AlertRow[];
  const sensorRows = (sensorResult.data ?? []) as McpSensorQueryRow[];
  const plantsByTent = new Map<string, PlantRow[]>();
  for (const plant of plants) {
    if (!plant.tent_id || !tentById.has(plant.tent_id)) continue;
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
        alerts: tentAlerts(alerts, tent.id, tentPlantIds),
        sensors: sensorEvidenceForTent(sensorRows, tent.id, now),
        now,
      }),
    );
  }

  for (const plant of plants) {
    const ownedTent = plant.tent_id ? tentById.get(plant.tent_id) ?? null : null;
    const scopeInvalid = plant.tent_id !== null && ownedTent === null;
    const legacyTentAttribution = plant.grow_id === null && ownedTent?.grow_id === growId;
    targets.push(
      buildTarget({
        targetType: "plant",
        targetId: plant.id,
        growId,
        tentId: ownedTent?.id ?? null,
        displayName: plant.name,
        strain: clean(plant.strain),
        stage: clean(plant.stage),
        status: clean(plant.health),
        plantCount: null,
        plantType: clean(plant.plant_type),
        medium: clean(plant.medium),
        potSize: clean(plant.pot_size),
        events: plantEvents(events, plant.id),
        alerts: plantAlerts(alerts, plant.id, ownedTent?.id ?? null),
        sensors: sensorEvidenceForTent(sensorRows, ownedTent?.id ?? null, now),
        now,
        extraMissing: legacyTentAttribution ? ["plant_profile_incomplete"] : [],
        extraContradictions: scopeInvalid ? ["scope_relationship_invalid"] : [],
      }),
    );
  }

  return {
    ok: true,
    data: {
      grow: { id: grow.id, name: grow.name },
      targets: Object.freeze(sortGrowWalkTargets(targets).slice(0, limit)),
      generatedAt,
    },
  };
}
