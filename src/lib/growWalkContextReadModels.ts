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
import {
  extractSourceAlertId,
  isActionDerivedFromAlert,
  stripBackPointerTokens,
} from "./actionQueueProvenanceRules";
import { selectWithRetractionCompat } from "./quick-log/retractionFilterCompat";
import { readResponseCheckStatus } from "./tenSecondQuickCheckRules";

const GROW_COLUMNS = "id,name,grow_type,stage,is_archived" as const;
const TENT_COLUMNS = "id,name,grow_id,stage,is_archived" as const;
const PLANT_COLUMNS =
  "id,name,strain,tent_id,grow_id,stage,health,is_archived,medium,pot_size,plant_type" as const;
const EVENT_COLUMNS =
  "id,grow_id,tent_id,plant_id,event_type,source,occurred_at,note,created_at,is_deleted" as const;
const DIARY_PHOTO_COLUMNS =
  "id,grow_id,tent_id,plant_id,entry_at,photo_url,details,retracted_at" as const;
/** Pre-migration fallback: no retracted_at projection exists yet. */
const LEGACY_DIARY_PHOTO_COLUMNS =
  "id,grow_id,tent_id,plant_id,entry_at,photo_url,details" as const;
const ALERT_COLUMNS =
  "id,grow_id,tent_id,plant_id,title,reason,severity,status,metric,source,last_seen_at" as const;
const AI_DOCTOR_COLUMNS =
  "id,grow_id,tent_id,plant_id,created_at,displayed_confidence,context_confidence_ceiling,context_sufficiency,sensor_snapshot_status,sensor_snapshot_reason_code" as const;
const ACTION_QUEUE_COLUMNS =
  "id,grow_id,tent_id,plant_id,source,status,risk_level,reason,created_at" as const;
const ACTION_QUEUE_AUDIT_COLUMNS =
  "id,action_queue_id,grow_id,event_type,previous_status,new_status,note,created_at" as const;
const TENT_RELATION_PLANT_COLUMNS = "id,grow_id,tent_id" as const;

const DEFAULT_LOOKBACK_HOURS = 72;
const MIN_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 168;
const EVENT_LIMIT = 100;
const EVENT_FETCH_LIMIT = EVENT_LIMIT + 1;
const PHOTO_LIMIT = 100;
const PHOTO_FETCH_LIMIT = PHOTO_LIMIT + 1;
const ALERT_LIMIT = 50;
const ALERT_FETCH_LIMIT = ALERT_LIMIT + 1;
const AI_DOCTOR_LIMIT = 1;
const AI_DOCTOR_FETCH_LIMIT = AI_DOCTOR_LIMIT + 1;
const ACTION_QUEUE_LIMIT = 20;
const ACTION_QUEUE_FETCH_LIMIT = ACTION_QUEUE_LIMIT + 1;
const ACTION_QUEUE_AUDIT_LIMIT = 100;
const ACTION_QUEUE_AUDIT_FETCH_LIMIT = ACTION_QUEUE_AUDIT_LIMIT + 1;
const TENT_RELATION_PLANT_LIMIT = 100;
const TENT_RELATION_PLANT_FETCH_LIMIT = TENT_RELATION_PLANT_LIMIT + 1;
const HOUR_MS = 60 * 60 * 1000;

interface GrowRow {
  readonly id: string;
  readonly name: string;
  readonly grow_type: string | null;
  readonly stage: string | null;
  readonly is_archived: boolean | null;
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

/** Raw photo references remain inside this adapter and are never projected. */
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
  readonly source: string | null;
  readonly status: string;
  readonly risk_level: string;
  readonly reason: string;
  readonly created_at: string;
}

interface ActionQueueAuditRow {
  readonly id: string;
  readonly action_queue_id: string;
  readonly grow_id: string;
  readonly event_type: string;
  readonly previous_status: string | null;
  readonly new_status: string | null;
  readonly note: string | null;
  readonly created_at: string;
}

interface TentRelationPlantRow {
  readonly id: string;
  readonly grow_id: string | null;
  readonly tent_id: string | null;
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
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLookback(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LOOKBACK_HOURS;
  return Math.min(MAX_LOOKBACK_HOURS, Math.max(MIN_LOOKBACK_HOURS, Math.trunc(value as number)));
}

function excerpt(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, 240) : null;
}

function eventResponse(
  eventType: string,
  note: string | null | undefined,
): GrowWalkEventEvidence["response"] {
  const type = normalize(eventType);
  if (type === "better" || type.endsWith("_better")) return "better";
  if (type === "same" || type.endsWith("_same")) return "same";
  if (type === "worse" || type.endsWith("_worse")) return "worse";
  const storedResponse = readResponseCheckStatus(note ?? "");
  if (storedResponse === "Better") return "better";
  if (storedResponse === "Same") return "same";
  if (storedResponse === "Worse") return "worse";
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

function confidenceBand(row: AiDoctorRow): GrowWalkAiDoctorEvidence["confidenceBand"] {
  const ceiling = normalize(row.context_confidence_ceiling);
  if (ceiling === "low" || ceiling === "medium" || ceiling === "high") return ceiling;
  if (typeof row.displayed_confidence !== "number" || !Number.isFinite(row.displayed_confidence)) {
    return "unknown";
  }
  if (row.displayed_confidence < 0.4) return "low";
  if (row.displayed_confidence < 0.75) return "medium";
  return "high";
}

function missingInformationCount(value: unknown): number {
  if (!isRecord(value)) return 0;
  for (const key of ["missing_information", "missingInformation", "missing"]) {
    const candidate = value[key];
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

function openActionStatus(value: string): "pending_approval" | "approved" | "simulated" | null {
  const status = normalize(value);
  return status === "pending_approval" || status === "approved" || status === "simulated"
    ? status
    : null;
}

function relatedAlertId(row: ActionQueueRow): string | null {
  const alertId = extractSourceAlertId(row.reason);
  return isActionDerivedFromAlert(row, alertId) ? alertId : null;
}

function toActionQueueEvidence(
  rows: readonly ActionQueueRow[],
  auditRows: readonly ActionQueueAuditRow[],
): GrowWalkActionQueueEvidence {
  const auditByActionId = new Map<string, ActionQueueAuditRow[]>();
  for (const audit of auditRows) {
    const existing = auditByActionId.get(audit.action_queue_id) ?? [];
    existing.push(audit);
    auditByActionId.set(audit.action_queue_id, existing);
  }
  const items = rows.flatMap((row) => {
    const status = openActionStatus(row.status);
    if (!status) return [];
    return [
      {
        id: row.id,
        growId: row.grow_id,
        tentId: row.tent_id,
        plantId: row.plant_id,
        relatedAlertId: relatedAlertId(row),
        status,
        riskLevel: row.risk_level,
        reasonExcerpt:
          excerpt(stripBackPointerTokens(row.reason)) ?? "Existing item requires review.",
        createdAt: row.created_at,
        auditTrail: Object.freeze(
          (auditByActionId.get(row.id) ?? []).map((audit) => ({
            id: audit.id,
            eventType: audit.event_type,
            previousStatus: clean(audit.previous_status),
            newStatus: clean(audit.new_status),
            noteExcerpt: excerpt(stripBackPointerTokens(audit.note)),
            createdAt: audit.created_at,
          })),
        ),
      },
    ];
  });
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

function trimLookahead<T>(lane: LaneRows<T>, rowLimit: number): LaneRows<T> {
  return {
    rows: Object.freeze(lane.rows.slice(0, rowLimit)),
    failed: lane.failed,
    truncated: lane.truncated,
  };
}

function notFound(): OwnerScopedReadModelResult<never> {
  return {
    ok: false,
    reason: "not_found",
    message: "Grow Walk target not found for the signed-in grower.",
  };
}

function unavailable(): OwnerScopedReadModelResult<never> {
  return { ok: false, reason: "unavailable", message: "Grow Walk context unavailable." };
}

async function fetchGrow(
  client: OwnerScopedClient,
  growId: string,
): Promise<GrowRow | null | "error"> {
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
    .maybeSingle();
  if (plantError) return unavailable();
  if (!plantData) return notFound();
  const plant = plantData as PlantRow;

  let tent: TentRow | null = null;
  if (plant.tent_id) {
    const { data: tentData, error: tentError } = await client
      .from("tents")
      .select(TENT_COLUMNS)
      .eq("id", plant.tent_id)
      .maybeSingle();
    if (tentError) return unavailable();
    if (!tentData) return notFound();
    tent = tentData as TentRow;
  }

  const growId = clean(plant.grow_id) ?? clean(tent?.grow_id);
  if (!growId) return notFound();
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
    .maybeSingle();
  if (tentError) return unavailable();
  if (!tentData) return notFound();
  const tent = tentData as TentRow;
  if (!tent.grow_id) return notFound();
  const grow = await fetchGrow(client, tent.grow_id);
  if (grow === "error") return unavailable();
  if (!grow) return notFound();
  return { ok: true, data: { grow, tent, plant: null } };
}

function resolveScope(
  client: OwnerScopedClient,
  input: GetGrowWalkContextInput,
): Promise<OwnerScopedReadModelResult<OwnedScope>> {
  return input.targetType === "plant"
    ? resolvePlantScope(client, input.targetId)
    : resolveTentScope(client, input.targetId);
}

function scopeQuery<T>(query: T, scope: OwnedScope): T {
  const chain = query as T & { eq: (column: string, value: string) => T };
  if (scope.plant) return chain.eq("plant_id", scope.plant.id);
  if (scope.tent) return chain.eq("tent_id", scope.tent.id);
  return query;
}

function relatedTentPlantIds(
  rows: readonly TentRelationPlantRow[],
  scope: OwnedScope,
): readonly string[] {
  const tentId = scope.tent?.id;
  if (!tentId) return [];
  return Object.freeze(
    [
      ...new Set(
        rows.flatMap((row) =>
          (row.grow_id === scope.grow.id || row.grow_id === null) &&
          row.tent_id === tentId &&
          clean(row.id)
            ? [row.id]
            : [],
        ),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  );
}

async function loadTentRelationPlants(
  client: OwnerScopedClient,
  scope: OwnedScope,
): Promise<LaneRows<TentRelationPlantRow>> {
  const tentId = scope.tent?.id;
  if (scope.plant || !tentId) return { rows: [], failed: false, truncated: false };
  const lane = await settleRows<TentRelationPlantRow>(
    () =>
      client
        .from("plants")
        .select(TENT_RELATION_PLANT_COLUMNS)
        // A plant's own grow_id wins when present, but older rows may rely on
        // their owned tent for grow attribution. Keep that null legacy lane
        // without admitting a plant explicitly assigned to another grow.
        .or(`grow_id.eq.${scope.grow.id},grow_id.is.null`)
        .eq("tent_id", tentId)
        .order("id", { ascending: true })
        .limit(TENT_RELATION_PLANT_FETCH_LIMIT) as unknown as PromiseLike<{
        data: unknown;
        error: unknown;
      }>,
    TENT_RELATION_PLANT_FETCH_LIMIT,
  );
  return trimLookahead(lane, TENT_RELATION_PLANT_LIMIT);
}

function tentAttributionScopeQuery<T>(
  query: T,
  scope: OwnedScope,
  tentPlantIds: readonly string[],
): T {
  const chain = query as T & {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (scope.plant) return chain.eq("plant_id", scope.plant.id);
  const tentId = scope.tent?.id;
  if (!tentId) return query;
  if (tentPlantIds.length === 0) return chain.eq("tent_id", tentId);
  return chain.or(`tent_id.eq.${tentId},plant_id.in.(${tentPlantIds.join(",")})`);
}

/**
 * A plant's Quick Log view includes its own entries plus unassigned
 * environmental entries explicitly recorded against its enclosing tent. It
 * never pulls a tent-wide care log, a sibling's plant-attributed log, or a
 * grow-wide unassigned log into the plant timeline.
 */
function eventAttributionScopeQuery<T>(
  query: T,
  scope: OwnedScope,
  tentPlantIds: readonly string[],
): T {
  const chain = query as T & {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (!scope.plant) return tentAttributionScopeQuery(query, scope, tentPlantIds);
  const tentId = scope.tent?.id;
  if (!tentId) return chain.eq("plant_id", scope.plant.id);
  return chain.or(
    `plant_id.eq.${scope.plant.id},and(plant_id.is.null,tent_id.eq.${tentId},event_type.eq.environment)`,
  );
}

function alertAttributionScopeQuery<T>(
  query: T,
  scope: OwnedScope,
  tentPlantIds: readonly string[],
): T {
  const chain = query as T & {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (!scope.plant) return tentAttributionScopeQuery(query, scope, tentPlantIds);
  const tentId = scope.tent?.id;
  if (!tentId) {
    return chain.or(`plant_id.eq.${scope.plant.id},and(plant_id.is.null,tent_id.is.null)`);
  }
  return chain.or(`plant_id.eq.${scope.plant.id},and(plant_id.is.null,tent_id.eq.${tentId})`);
}

/**
 * A plant walk can surface an unassigned action only when it is explicitly
 * attached to that plant's resolved tent. This retains plant-specific actions
 * while keeping sibling and grow-wide actions out of the target's context.
 */
function actionAttributionScopeQuery<T>(query: T, scope: OwnedScope): T {
  const chain = query as T & {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (!scope.plant) return scopeQuery(query, scope);
  const tentId = scope.tent?.id;
  if (!tentId) return chain.eq("plant_id", scope.plant.id);
  return chain.or(`plant_id.eq.${scope.plant.id},and(plant_id.is.null,tent_id.eq.${tentId})`);
}

function belongsToTentAttributedScope(
  row: Pick<EventRow | DiaryPhotoRow | AlertRow, "tent_id" | "plant_id">,
  scope: OwnedScope,
  tentPlantIds: ReadonlySet<string>,
): boolean {
  if (scope.plant) return row.plant_id === scope.plant.id;
  const tentId = scope.tent?.id;
  return (
    tentId !== undefined &&
    (row.tent_id === tentId || (row.plant_id !== null && tentPlantIds.has(row.plant_id)))
  );
}

function belongsToEventScope(
  row: EventRow,
  scope: OwnedScope,
  tentPlantIds: ReadonlySet<string>,
): boolean {
  if (!scope.plant) return belongsToTentAttributedScope(row, scope, tentPlantIds);
  const tentId = scope.tent?.id;
  return (
    row.plant_id === scope.plant.id ||
    (tentId !== undefined &&
      row.plant_id === null &&
      row.tent_id === tentId &&
      normalize(row.event_type) === "environment")
  );
}

function belongsToAlertScope(
  row: AlertRow,
  scope: OwnedScope,
  tentPlantIds: ReadonlySet<string>,
): boolean {
  if (!scope.plant) return belongsToTentAttributedScope(row, scope, tentPlantIds);
  return (
    row.plant_id === scope.plant.id ||
    (row.plant_id === null && row.tent_id === (scope.tent?.id ?? null))
  );
}

function belongsToActionQueueScope(row: ActionQueueRow, scope: OwnedScope): boolean {
  if (row.grow_id !== scope.grow.id) return false;
  if (!scope.plant) return row.tent_id === (scope.tent?.id ?? null);
  if (row.plant_id === scope.plant.id) return true;
  const tentId = scope.tent?.id;
  return tentId !== undefined && row.plant_id === null && row.tent_id === tentId;
}

async function loadActionQueueAudits(
  client: OwnerScopedClient,
  scope: OwnedScope,
  actionRows: readonly ActionQueueRow[],
): Promise<LaneRows<ActionQueueAuditRow>> {
  const actionIds = Object.freeze([
    ...new Set(actionRows.flatMap((row) => (openActionStatus(row.status) ? [row.id] : []))),
  ]);
  if (actionIds.length === 0) return { rows: [], failed: false, truncated: false };
  const lane = await settleRows<ActionQueueAuditRow>(
    () =>
      client
        .from("action_queue_events")
        .select(ACTION_QUEUE_AUDIT_COLUMNS)
        .eq("grow_id", scope.grow.id)
        .in("action_queue_id", actionIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(ACTION_QUEUE_AUDIT_FETCH_LIMIT) as unknown as PromiseLike<{
        data: unknown;
        error: unknown;
      }>,
    ACTION_QUEUE_AUDIT_FETCH_LIMIT,
  );
  return trimLookahead(lane, ACTION_QUEUE_AUDIT_LIMIT);
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
  return Object.freeze(
    GROW_WALK_MISSING_EVIDENCE_CODES.filter((candidate) => found.has(candidate)),
  );
}

/**
 * Return one bounded, source-labeled context for an owned plant or tent.
 * Scope failures are fatal; evidence-lane failures remain explicit receipts.
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
  const tentRelationLane = await loadTentRelationPlants(client, scope);
  const tentPlantIds = relatedTentPlantIds(tentRelationLane.rows, scope);
  const tentPlantIdSet = new Set(tentPlantIds);

  const eventsBase = client
    .from("grow_events")
    .select(EVENT_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .eq("source", "manual")
    .eq("is_deleted", false)
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(EVENT_FETCH_LIMIT);
  const diaryPhotoQuery = selectWithRetractionCompat((withRetractionFilter) => {
    let query = client
      .from("diary_entries")
      .select(withRetractionFilter ? DIARY_PHOTO_COLUMNS : LEGACY_DIARY_PHOTO_COLUMNS)
      .eq("grow_id", scope.grow.id);
    if (withRetractionFilter) query = query.is("retracted_at", null);
    return tentAttributionScopeQuery(query, scope, tentPlantIds)
      .gte("entry_at", cutoff)
      .order("entry_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PHOTO_FETCH_LIMIT);
  });
  const alertsBase = client
    .from("alerts")
    .select(ALERT_COLUMNS)
    .eq("grow_id", scope.grow.id)
    // An unresolved alert is current state, not historical evidence, so its
    // last observation must not make it disappear from a focused walk.
    .in("status", ["open", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ALERT_FETCH_LIMIT);
  const aiBase = client
    .from("ai_doctor_sessions")
    .select(AI_DOCTOR_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AI_DOCTOR_FETCH_LIMIT);
  // AI evidence remains exact-target only. A plant's Action Queue evidence
  // includes its exact rows plus unassigned rows attached to its resolved tent;
  // it never crosses into a sibling or grow-wide action.
  const actionBase = client
    .from("action_queue")
    .select(ACTION_QUEUE_COLUMNS)
    .eq("grow_id", scope.grow.id)
    .in("status", ["pending_approval", "approved", "simulated"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ACTION_QUEUE_FETCH_LIMIT);

  const [eventFetchLane, photoFetchLane, alertFetchLane, aiFetchLane, actionFetchLane, sensorLane] =
    await Promise.all([
      settleRows<EventRow>(
        () =>
          eventAttributionScopeQuery(eventsBase, scope, tentPlantIds) as unknown as PromiseLike<{
            data: unknown;
            error: unknown;
          }>,
        EVENT_FETCH_LIMIT,
      ),
      settleRows<DiaryPhotoRow>(() => diaryPhotoQuery, PHOTO_FETCH_LIMIT),
      settleRows<AlertRow>(
        () =>
          alertAttributionScopeQuery(alertsBase, scope, tentPlantIds) as unknown as PromiseLike<{
            data: unknown;
            error: unknown;
          }>,
        ALERT_FETCH_LIMIT,
      ),
      settleRows<AiDoctorRow>(
        () =>
          scopeQuery(aiBase, scope) as unknown as PromiseLike<{ data: unknown; error: unknown }>,
        AI_DOCTOR_FETCH_LIMIT,
      ),
      settleRows<ActionQueueRow>(
        () =>
          actionAttributionScopeQuery(actionBase, scope) as unknown as PromiseLike<{
            data: unknown;
            error: unknown;
          }>,
        ACTION_QUEUE_FETCH_LIMIT,
      ),
      (async (): Promise<{ evidence: GrowWalkSensorEvidence; failed: boolean }> => {
        if (!scope.tent)
          return {
            evidence: { available: false, readings: {}, contradictionMetrics: [] },
            failed: true,
          };
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
              contradictionMetrics: result.data.contradictionMetrics ?? [],
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
  const eventLane = trimLookahead(eventFetchLane, EVENT_LIMIT);
  const photoLane = trimLookahead(photoFetchLane, PHOTO_LIMIT);
  const alertLane = trimLookahead(alertFetchLane, ALERT_LIMIT);
  const aiLane = trimLookahead(aiFetchLane, AI_DOCTOR_LIMIT);
  const actionLane = trimLookahead(actionFetchLane, ACTION_QUEUE_LIMIT);
  const actionRows = actionLane.rows.filter((row) => belongsToActionQueueScope(row, scope));
  const actionAuditLane = await loadActionQueueAudits(client, scope, actionRows);

  const partial = new Set<GrowWalkEvidenceLane>();
  const truncated = new Set<GrowWalkEvidenceLane>();
  if (tentRelationLane.failed) {
    partial.add("events");
    partial.add("photos");
    partial.add("alerts");
  }
  if (eventLane.failed) partial.add("events");
  if (photoLane.failed) partial.add("photos");
  if (alertLane.failed) partial.add("alerts");
  if (aiLane.failed) partial.add("ai_doctor");
  if (actionLane.failed) partial.add("action_queue");
  if (actionAuditLane.failed) partial.add("action_queue");
  if (sensorLane.failed) partial.add("sensors");
  if (tentRelationLane.truncated) {
    truncated.add("events");
    truncated.add("photos");
    truncated.add("alerts");
  }
  if (eventLane.truncated) truncated.add("events");
  if (photoLane.truncated) truncated.add("photos");
  if (alertLane.truncated) truncated.add("alerts");
  if (aiLane.truncated) truncated.add("ai_doctor");
  if (actionLane.truncated) truncated.add("action_queue");
  if (actionAuditLane.truncated) truncated.add("action_queue");

  const events = eventLane.rows
    .filter((row) => !row.is_deleted && belongsToEventScope(row, scope, tentPlantIdSet))
    .map(toEventEvidence);
  const photos = photoLane.rows
    .filter(
      (row) =>
        belongsToTentAttributedScope(row, scope, tentPlantIdSet) &&
        !isRetracted(row) &&
        hasDiaryPhotoReference(row),
    )
    .map(toDiaryPhotoMetadata);
  const alerts = alertLane.rows.flatMap((row) => {
    if (!belongsToAlertScope(row, scope, tentPlantIdSet)) return [];
    const evidence = toAlertEvidence(row);
    return evidence ? [evidence] : [];
  });
  const aiDoctor = toAiDoctorEvidence(aiLane.rows[0]);
  const actionQueue = toActionQueueEvidence(actionRows, actionAuditLane.rows);
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

  const context: GrowWalkContext = {
    scope: {
      growId: scope.grow.id,
      growName: scope.grow.name,
      tentId: scope.tent?.id ?? null,
      tentName: scope.tent?.name ?? null,
      plantId: scope.plant?.id ?? null,
      plantName: scope.plant?.name ?? null,
      targetArchived:
        scope.grow.is_archived === true ||
        scope.plant?.is_archived === true ||
        scope.tent?.is_archived === true,
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
    derived: { ...derived, attentionBand: deriveGrowWalkAttentionBand(derived) },
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
