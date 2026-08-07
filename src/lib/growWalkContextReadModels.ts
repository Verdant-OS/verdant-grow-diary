import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../integrations/supabase/types";
import { deriveGrowWalkAttentionBand } from "./growWalkAttentionRules";
import {
  GROW_WALK_CONTEXT_VERSION,
  GROW_WALK_MISSING_EVIDENCE_CODES,
  type GrowWalkActionQueueEvidence,
  type GrowWalkAiDoctorEvidence,
  type GrowWalkAlertEvidence,
  type GrowWalkContext,
  type GrowWalkEvidenceLane,
  type GrowWalkEventEvidence,
  type GrowWalkMissingEvidenceCode,
  type GrowWalkPhotoMetadata,
  type GrowWalkSensorEvidence,
  type GrowWalkTargetType,
} from "./growWalkContracts";
import { deriveGrowWalkEvidence } from "./growWalkEvidenceRules";
import {
  getLatestSensorSnapshotForOwnedTent,
  type OwnerScopedReadModelResult,
} from "./operatorAccountReadModels";

const GROW_COLUMNS = "id,name,grow_type,stage" as const;
const TENT_COLUMNS = "id,name,grow_id,stage,is_archived" as const;
const PLANT_COLUMNS =
  "id,name,strain,tent_id,grow_id,stage,health,is_archived,medium,pot_size,plant_type" as const;
const EVENT_COLUMNS =
  "id,grow_id,tent_id,plant_id,event_type,source,occurred_at,note,created_at,is_deleted" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;
const AI_DOCTOR_COLUMNS =
  "id,grow_id,tent_id,plant_id,created_at,displayed_confidence,context_confidence_ceiling,context_sufficiency,sensor_snapshot_status,sensor_snapshot_reason_code" as const;
const ACTION_QUEUE_COLUMNS =
  "id,grow_id,tent_id,plant_id,status,risk_level,reason,created_at" as const;

const DEFAULT_LOOKBACK_HOURS = 72;
const MIN_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 168;
const EVENT_LIMIT = 100;
const ALERT_LIMIT = 50;
const ACTION_QUEUE_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

interface GrowRow {
  readonly id: string;
  readonly name: string;
  readonly grow_type: string | null;
  readonly stage: string | null;
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

interface AiDoctorRow {
  readonly id: string;
  readonly grow_id: string | null;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly created_at: string;
  readonly displayed_confidence: number | null;
  readonly context_confidence_ceiling: string | null;
  readonly context_sufficiency: unknown;
  readonly sensor_snapshot_status: string | null;
  readonly sensor_snapshot_reason_code: string | null;
}

interface ActionQueueRow {
  readonly id: string;
  readonly grow_id: string;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly status: string;
  readonly risk_level: string;
  readonly reason: string;
  readonly created_at: string;
}

interface OwnedScope {
  readonly grow: GrowRow;
  readonly tent: TentRow | null;
  readonly plant: PlantRow | null;
}

interface LaneRows<T> {
  readonly rows: readonly T[];
  readonly failed: boolean;
  readonly truncated: boolean;
}

export interface GetGrowWalkContextInput {
  readonly targetType: GrowWalkTargetType;
  readonly targetId: string;
  readonly lookbackHours?: number;
}

export interface GetGrowWalkContextOptions {
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
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLookback(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(MAX_LOOKBACK_HOURS, Math.max(MIN_LOOKBACK_HOURS, Math.trunc(value as number)));
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

function confidenceBand(row: AiDoctorRow): GrowWalkAiDoctorEvidence["confidenceBand"] {
  const ceiling = normalize(row.context_confidence_ceiling);
  if (ceiling === "low" || ceiling === "medium" || ceiling === "high") return ceiling;
  const value = row.displayed_confidence;
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value < 0.4) return "low";
  if (value < 0.75) return "medium";
  return "high";
}

function missingInformationCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  for (const key of ["missing_information", "missingInformation", "missing"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
}

function toAiDoctorEvidence(row: AiDoctorRow | undefined): GrowWalkAiDoctorEvidence | null {
  if (!row) return null;
  return {
    sessionId: row.id,
    completedAt: row.created_at,
    confidenceBand: confidenceBand(row),
    riskLevel: "unknown",
    missingInformationCount: missingInformationCount(row.context_sufficiency),
    summaryExcerpt: null,
  };
}

function isOpenActionStatus(status: string): boolean {
  const value = normalize(status);
  return value !== "completed" && value !== "rejected" && value !== "cancelled";
}

function toActionQueueEvidence(rows: readonly ActionQueueRow[]): GrowWalkActionQueueEvidence {
  const items = rows
    .filter((row) => isOpenActionStatus(row.status))
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      status: row.status,
      riskLevel: row.risk_level,
      reasonExcerpt: excerpt(row.reason) ?? "Existing suggestion requires review.",
      createdAt: row.created_at,
    }));
  return { openCount: items.length, items: Object.freeze(items) };
}

async function settleRows<T>(
  operation: () => PromiseLike<{ data: unknown; error: unknown }>,
  limit: number,
): Promise<LaneRows<T>> {
  try {
    const result = await operation();
    if (result.error) return { rows: [], failed: true, truncated: false };
    const rows = Array.isArray(result.data) ? (result.data as T[]) : [];
    return { rows, failed: false, truncated: rows.length >= limit };
  } catch {
    return { rows: [], failed: true, truncated: false };
  }
}

function notFound(): OwnerScopedReadModelResult<never> {
  return {
    ok: false,
    reason: "not_found",
    message: "Grow Walk target not found for the signed-in grower.",
  };
}

function unavailable(): OwnerScopedReadModelResult<never> {
  return {
    ok: false,
    reason: "unavailable",
    message: "Grow Walk context unavailable.",
  };
}

async function fetchGrow(client: OwnerScopedClient, growId: string): Promise<GrowRow | null | "error"> {
  const { data, error } = await client
    .from("grows")
    .select(GROW_COLUMNS)
    .eq("id", growId)
    .maybeSingle();
  if (error) return "error";
  return data ? (data as GrowRow) : null;
}

async function resolvePlantScope(
  client: OwnerScopedClient,
  targetId: string,
): Promise<OwnerScopedReadModelResult<OwnedScope>> {
  const { data: plantData, error: plantError } = await client
    .from("plants")
    .select(PLANT_COLUMNS)
    .eq("id", targetId)
    .eq("is_archived", false)
    .maybeSingle();
  if (plantError) return unavailable();
  if (!plantData) return notFound();
  const plant = plantData as PlantRow;
  if (plant.is_archived) return notFound();

  let tent: TentRow | null = null;
  if (plant.tent_id) {
    const { data: tentData, error: tentError } = await client
      .from("tents")
      .select(TENT_COLUMNS)
      .eq("id", plant.tent_id)
      .eq("is_archived", false)
      .maybeSingle();
    if (tentError) return unavailable();
    if (!tentData) return notFound();
    tent = tentData as TentRow;
    if (tent.is_archived) return notFound();
  }

  const growId = clean(plant.grow_id) ?? clean(tent?.grow_id);
  if (!growId) return notFound();
  if (plant.grow_id && plant.grow_id !== growId) return notFound();
  if (tent && tent.grow_id !== growId) return notFound();

  const grow = await fetchGrow(client, growId);
  if (grow === "error") return unavailable();
  if (!grow) return notFound();
  return { ok: true, data: { grow, tent, plant } };
}

async function resolveTentScope(
  client: OwnerScopedClient,
  targetId: string,
): Promise<OwnerScopedReadModelResult<OwnedScope>> {
  const { data: tentData, error: tentError } = await client
    .from("tents")
    .select(TENT_COLUMNS)
    .eq("id", targetId)
    .eq("is_archived", false)
    .maybeSingle();
  if (tentError) return unavailable();
  if (!tentData) return notFound();
  const tent = tentData as TentRow;
  if (tent.is_archived || !tent.grow_id) return notFound();
  const grow = await fetchGrow(client, tent.grow_id);
  if (grow === "error") return unavailable();
  if (!grow) return notFound();
  return { ok: true, data: { grow, tent, plant: null } };
}

async function resolveScope(
  client: OwnerScopedClient,
  input: GetGrowWalkContextInput,
): Promise<OwnerScopedReadModelResult<OwnedScope>> {
  return input.targetType === "plant"
    ? resolvePlantScope(client, input.targetId)
    : resolveTentScope(client, input.targetId);
}

function scopeQuery<T>(
  query: T,
  scope: OwnedScope,
): T {
  const chain = query as T & { eq: (column: string, value: string) => T };
  if (scope.plant) return chain.eq("plant_id", scope.plant.id);
  if (scope.tent) return chain.eq("tent_id", scope.tent.id);
  return query;
}

function orderedLanes(found: ReadonlySet<GrowWalkEvidenceLane>): readonly GrowWalkEvidenceLane[] {
  const order: readonly GrowWalkEvidenceLane[] = [
    "profile",
    "events",
    "sensors",
    "photos",
    "alerts",
    "ai_doctor",
    "action_queue",
  ];
  return Object.freeze(order.filter((lane) => found.has(lane)));
}

function addMissing(
  current: readonly GrowWalkMissingEvidenceCode[],
  code: GrowWalkMissingEvidenceCode,
): readonly GrowWalkMissingEvidenceCode[] {
  const found = new Set(current);
  found.add(code);
  return Object.freeze(GROW_WALK_MISSING_EVIDENCE_CODES.filter((candidate) => found.has(candidate)));
}

/**
 * Return one bounded, source-labeled context for an owned plant or tent.
 * Scope failures are fatal; evidence-lane failures are explicit partial results.
 */
export async function getGrowWalkContextForOwnedTarget(
  client: OwnerScopedClient,
  input: GetGrowWalkContextInput,
  options: GetGrowWalkContextOptions = {},
): Promise<OwnerScopedReadModelResult<{ context: GrowWalkContext }>> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const lookbackHours = normalizeLookback(input.lookbackHours);
  const cutoff = new Date(now.getTime() - lookbackHours * HOUR_MS).toISOString();
  const scopeResult = await resolveScope(client, input);
  if (!scopeResult.ok) return scopeResult;
  const scope = scopeResult.data;

  const eventsBase = client
    .from("grow_events")
    .select(EVENT_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(EVENT_LIMIT);
  const alertsBase = client
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .neq("status", "resolved")
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(ALERT_LIMIT);
  const aiBase = client
    .from("ai_doctor_sessions")
    .select(AI_DOCTOR_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  const actionBase = client
    .from("action_queue")
    .select(ACTION_QUEUE_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .in("status", ["suggested", "pending_approval", "approved"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(ACTION_QUEUE_LIMIT);

  const [eventLane, alertLane, aiLane, actionLane, sensorLane] = await Promise.all([
    settleRows<EventRow>(
      () => scopeQuery(eventsBase, scope) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
      EVENT_LIMIT,
    ),
    settleRows<AlertRow>(
      () => scopeQuery(alertsBase, scope) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
      ALERT_LIMIT,
    ),
    settleRows<AiDoctorRow>(
      () => scopeQuery(aiBase, scope) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
      1,
    ),
    settleRows<ActionQueueRow>(
      () => scopeQuery(actionBase, scope) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
      ACTION_QUEUE_LIMIT,
    ),
    (async (): Promise<{ evidence: GrowWalkSensorEvidence; failed: boolean }> => {
      if (!scope.tent) {
        return {
          evidence: { available: false, readings: {}, contradictionMetrics: [] },
          failed: true,
        };
      }
      try {
        const result = await getLatestSensorSnapshotForOwnedTent(client, scope.tent.id, { now });
        if (!result.ok) {
          return {
            evidence: { available: false, readings: {}, contradictionMetrics: [] },
            failed: true,
          };
        }
        return {
          evidence: {
            available: true,
            readings: result.data.snapshot?.readings ?? {},
            contradictionMetrics: [],
          },
          failed: false,
        };
      } catch {
        return {
          evidence: { available: false, readings: {}, contradictionMetrics: [] },
          failed: true,
        };
      }
    })(),
  ]);

  const partial = new Set<GrowWalkEvidenceLane>();
  const truncated = new Set<GrowWalkEvidenceLane>();
  if (eventLane.failed) {
    partial.add("events");
    partial.add("photos");
  }
  if (alertLane.failed) partial.add("alerts");
  if (aiLane.failed) partial.add("ai_doctor");
  if (actionLane.failed) partial.add("action_queue");
  if (sensorLane.failed) partial.add("sensors");
  if (eventLane.truncated) {
    truncated.add("events");
    truncated.add("photos");
  }
  if (alertLane.truncated) truncated.add("alerts");
  if (aiLane.truncated) truncated.add("ai_doctor");
  if (actionLane.truncated) truncated.add("action_queue");

  const events = eventLane.rows.filter((row) => !row.is_deleted).map(toEventEvidence);
  const photos = eventLane.rows
    .filter((row) => normalize(row.event_type).includes("photo") && !row.is_deleted)
    .map(toPhotoMetadata);
  const alerts = alertLane.rows.map(toAlertEvidence);
  const aiDoctor = toAiDoctorEvidence(aiLane.rows[0]);
  const actionQueue = toActionQueueEvidence(actionLane.rows);
  let derived = deriveGrowWalkEvidence({
    now,
    stage: clean(scope.plant?.stage) ?? clean(scope.tent?.stage) ?? clean(scope.grow.stage),
    plantStatus: clean(scope.plant?.health),
    plantType: clean(scope.plant?.plant_type),
    medium: clean(scope.plant?.medium),
    potSize: clean(scope.plant?.pot_size),
    recentEvents: events,
    sensors: sensorLane.evidence,
    photos,
    alerts,
    aiDoctor,
  });

  if (scope.plant?.grow_id === null) {
    derived = {
      ...derived,
      missingEvidenceCodes: addMissing(derived.missingEvidenceCodes, "plant_profile_incomplete"),
    };
  }
  if (partial.size > 0 && derived.evidenceConfidence === "high") {
    derived = { ...derived, evidenceConfidence: "medium" };
  }
  const attentionBand = deriveGrowWalkAttentionBand(derived);

  const context: GrowWalkContext = {
    scope: {
      growId: scope.grow.id,
      growName: scope.grow.name,
      tentId: scope.tent?.id ?? null,
      tentName: scope.tent?.name ?? null,
      plantId: scope.plant?.id ?? null,
      plantName: scope.plant?.name ?? null,
    },
    profile: {
      stage: clean(scope.plant?.stage) ?? clean(scope.tent?.stage) ?? clean(scope.grow.stage),
      strain: clean(scope.plant?.strain),
      medium: clean(scope.plant?.medium),
      potSize: clean(scope.plant?.pot_size),
      growType: clean(scope.plant?.plant_type) ?? clean(scope.grow.grow_type),
      plantStatus: clean(scope.plant?.health),
    },
    evidence: {
      recentEvents: Object.freeze(events),
      sensors: sensorLane.evidence,
      photos: Object.freeze(photos),
      alerts: Object.freeze(alerts),
      aiDoctor,
      actionQueue,
    },
    derived: { ...derived, attentionBand },
    receipt: {
      generatedAt,
      lookbackHours,
      contextVersion: GROW_WALK_CONTEXT_VERSION,
      partialLanes: orderedLanes(partial),
      truncatedLanes: orderedLanes(truncated),
    },
  };

  return { ok: true, data: { context } };
}
