/**
 * Pure rules for selecting one genuinely connected Grow -> Tent -> Plant
 * graph and summarizing the persisted manual evidence attached to it.
 *
 * This module intentionally performs no I/O. Callers must supply rows already
 * constrained by the signed-in grower's RLS-scoped reads.
 */
import { QUICK_LOG_ACTIVITY_LIST } from "@/constants/quickLogActivityTypes";
import { buildSensorsTentRouteHref, SENSORS_TENT_ROUTE } from "@/lib/sensorRouteTentIntentRules";

export interface ConnectedActivationGrowRow {
  id?: string | null;
}

export interface ConnectedActivationTentRow {
  id?: string | null;
  growId?: string | null;
}

export interface ConnectedActivationPlantRow {
  id?: string | null;
  growId?: string | null;
  tentId?: string | null;
}

export interface SelectConnectedOneTentGraphInput {
  grows?: ReadonlyArray<ConnectedActivationGrowRow | null | undefined> | null;
  tents?: ReadonlyArray<ConnectedActivationTentRow | null | undefined> | null;
  plants?: ReadonlyArray<ConnectedActivationPlantRow | null | undefined> | null;
  preferredGrowId?: string | null;
}

export interface ConnectedOneTentGraph {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
  hasGrow: boolean;
  hasTent: boolean;
  hasPlant: boolean;
}

export interface ConnectedActivationScope {
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
}

export interface ConnectedActivationRoutes {
  createGrow: string;
  addTent: string;
  addPlant: string;
  quickLog: string;
  sensors: string;
}

export interface ConnectedActivationDiaryEntryRow {
  id?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  grow_event_id?: string | null;
  linked_grow_event_id?: string | null;
  details?: unknown;
}

export interface ConnectedActivationGrowEventRow {
  id?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  event_type?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface ConnectedActivationEvidenceInput extends ConnectedActivationScope {
  diaryEntries?: ReadonlyArray<ConnectedActivationDiaryEntryRow | null | undefined> | null;
  growEvents?: ReadonlyArray<ConnectedActivationGrowEventRow | null | undefined> | null;
}

export type ConnectedActivationEvidenceSource = "grow_events" | "diary_entries";

export interface ConnectedActivationEvidenceSummary {
  count: number;
  hasEvidence: boolean;
  latestAt: string | null;
  latestSource: ConnectedActivationEvidenceSource | null;
}

export const ONE_TENT_ACTIVATION_INTENT = "one_tent_activation" as const;

export function isOneTentActivationIntent(value: unknown): boolean {
  return value === ONE_TENT_ACTIVATION_INTENT;
}

interface NormalizedTent {
  id: string;
  growId: string;
}

interface NormalizedPlant {
  id: string;
  growId: string;
  tentId: string;
}

interface EvidenceCandidate {
  key: string;
  id: string;
  at: string;
  epochMs: number;
  source: ConnectedActivationEvidenceSource;
}

const MANUAL_GROW_EVENT_TYPES: ReadonlySet<string> = new Set(
  QUICK_LOG_ACTIVITY_LIST.flatMap((activity) => {
    if (!activity.enabled) return [];
    if (activity.eventType) return [activity.eventType];
    if (activity.saveRoute === "manual_note") return ["observation"];
    if (activity.saveRoute === "manual_water") return ["watering"];
    return [];
  }),
);

function nonBlankId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function uniqueSortedIds(
  rows: ReadonlyArray<ConnectedActivationGrowRow | null | undefined> | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const id = nonBlankId(row?.id);
    if (id) ids.add(id);
  }
  return [...ids].sort(compareText);
}

function normalizeTents(rows: SelectConnectedOneTentGraphInput["tents"]): NormalizedTent[] {
  const byKey = new Map<string, NormalizedTent>();
  for (const row of rows ?? []) {
    const id = nonBlankId(row?.id);
    const growId = nonBlankId(row?.growId);
    if (!id || !growId) continue;
    const key = `${growId}\u0000${id}`;
    byKey.set(key, { id, growId });
  }
  return [...byKey.values()].sort(
    (a, b) => compareText(a.growId, b.growId) || compareText(a.id, b.id),
  );
}

function normalizePlants(rows: SelectConnectedOneTentGraphInput["plants"]): NormalizedPlant[] {
  const byKey = new Map<string, NormalizedPlant>();
  for (const row of rows ?? []) {
    const id = nonBlankId(row?.id);
    const growId = nonBlankId(row?.growId);
    const tentId = nonBlankId(row?.tentId);
    // Legacy null relationships are intentionally not inferred.
    if (!id || !growId || !tentId) continue;
    const key = `${growId}\u0000${tentId}\u0000${id}`;
    byKey.set(key, { id, growId, tentId });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      compareText(a.growId, b.growId) || compareText(a.tentId, b.tentId) || compareText(a.id, b.id),
  );
}

function graphDepth(
  growId: string,
  tents: readonly NormalizedTent[],
  plants: readonly NormalizedPlant[],
): number {
  const growTents = tents.filter((tent) => tent.growId === growId);
  if (growTents.length === 0) return 0;
  return growTents.some((tent) =>
    plants.some((plant) => plant.growId === growId && plant.tentId === tent.id),
  )
    ? 2
    : 1;
}

/**
 * Select one connected graph. The preferred grow wins when it exists.
 * Otherwise the deepest available graph wins, with lexical ID tie-breakers.
 */
export function selectConnectedOneTentGraph(
  input: SelectConnectedOneTentGraphInput,
): ConnectedOneTentGraph {
  const growIds = uniqueSortedIds(input?.grows);
  const tents = normalizeTents(input?.tents);
  const plants = normalizePlants(input?.plants);
  const preferredGrowId = nonBlankId(input?.preferredGrowId);

  let growId = preferredGrowId && growIds.includes(preferredGrowId) ? preferredGrowId : null;

  if (!growId && growIds.length > 0) {
    growId = [...growIds].sort((a, b) => {
      const depthDifference = graphDepth(b, tents, plants) - graphDepth(a, tents, plants);
      return depthDifference || compareText(a, b);
    })[0];
  }

  if (!growId) {
    return {
      growId: null,
      tentId: null,
      plantId: null,
      hasGrow: false,
      hasTent: false,
      hasPlant: false,
    };
  }

  const growTents = tents.filter((tent) => tent.growId === growId);
  const tentId =
    [...growTents].sort((a, b) => {
      const aHasPlant = plants.some((plant) => plant.growId === growId && plant.tentId === a.id);
      const bHasPlant = plants.some((plant) => plant.growId === growId && plant.tentId === b.id);
      if (aHasPlant !== bHasPlant) return aHasPlant ? -1 : 1;
      return compareText(a.id, b.id);
    })[0]?.id ?? null;

  const plantId = tentId
    ? (plants.find((plant) => plant.growId === growId && plant.tentId === tentId)?.id ?? null)
    : null;

  return {
    growId,
    tentId,
    plantId,
    hasGrow: true,
    hasTent: tentId !== null,
    hasPlant: plantId !== null,
  };
}

/** Build dependency-safe, query-encoded routes for the guided handoff. */
export function buildConnectedActivationRoutes(
  scope: ConnectedActivationScope | null | undefined,
): ConnectedActivationRoutes {
  const growId = nonBlankId(scope?.growId);
  const tentId = nonBlankId(scope?.tentId);
  const createGrow = `/grows?intent=${ONE_TENT_ACTIVATION_INTENT}`;
  const addTent = growId
    ? `/tents?growId=${encodeURIComponent(growId)}&intent=${ONE_TENT_ACTIVATION_INTENT}`
    : createGrow;
  const addPlant =
    growId && tentId
      ? `/plants?growId=${encodeURIComponent(growId)}&tentId=${encodeURIComponent(tentId)}&intent=${ONE_TENT_ACTIVATION_INTENT}`
      : addTent;
  const quickLog = growId
    ? `/dashboard?growId=${encodeURIComponent(growId)}&open=quick-log`
    : createGrow;
  const sensorTentRoute = buildSensorsTentRouteHref(tentId, { requireExactMatch: true });
  const sensors =
    growId && tentId && sensorTentRoute !== SENSORS_TENT_ROUTE
      ? `${sensorTentRoute}#manual-reading`
      : addTent;

  return { createGrow, addTent, addPlant, quickLog, sensors };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseTimestamp(
  primary: unknown,
  fallback: unknown,
): { at: string; epochMs: number } | null {
  const at = nonBlankId(primary) ?? nonBlankId(fallback);
  if (!at) return null;
  const epochMs = Date.parse(at);
  return Number.isFinite(epochMs) ? { at, epochMs } : null;
}

function matchesConnectedScope(
  row: { grow_id?: string | null; tent_id?: string | null; plant_id?: string | null },
  scope: { growId: string; tentId: string; plantId: string },
): boolean {
  const growId = nonBlankId(row.grow_id);
  const tentId = nonBlankId(row.tent_id);
  const plantId = nonBlankId(row.plant_id);
  if (growId !== scope.growId) return false;
  if (tentId !== null && tentId !== scope.tentId) return false;
  if (plantId !== null && plantId !== scope.plantId) return false;
  return true;
}

function diaryLinks(row: ConnectedActivationDiaryEntryRow): string[] {
  const details = asObject(row.details);
  const links = new Set<string>();
  for (const candidate of [
    row.linked_grow_event_id,
    row.grow_event_id,
    details?.linked_grow_event_id,
    details?.grow_event_id,
  ]) {
    const id = nonBlankId(candidate);
    if (id) links.add(id);
  }
  return [...links].sort(compareText);
}

function compareEvidence(a: EvidenceCandidate, b: EvidenceCandidate): number {
  if (a.epochMs !== b.epochMs) return b.epochMs - a.epochMs;
  if (a.source !== b.source) return a.source === "grow_events" ? -1 : 1;
  return compareText(a.id, b.id);
}

function growEventIdentityRank(row: ConnectedActivationGrowEventRow): string {
  const timestamp = parseTimestamp(row.occurred_at, row.created_at);
  // The remaining fields make equal-time duplicate IDs deterministic even
  // when an upstream array is reordered.
  const inverseTime = String(Number.MAX_SAFE_INTEGER - (timestamp?.epochMs ?? -1)).padStart(
    16,
    "0",
  );
  return [
    inverseTime,
    nonBlankId(row.grow_id) ?? "",
    nonBlankId(row.tent_id) ?? "",
    nonBlankId(row.plant_id) ?? "",
    nonBlankId(row.event_type) ?? "",
    nonBlankId(row.source) ?? "",
    row.is_deleted === true ? "1" : "0",
    nonBlankId(row.deleted_at) ?? "",
  ].join("\u0000");
}

/**
 * Count canonical persisted evidence for one connected graph.
 *
 * Plant-null tent/grow events are allowed because Quick Log supports broad
 * observations. An explicit different tent/plant is never allowed. Companion
 * diary rows are removed whenever their known parent grow_event is present,
 * including when that parent is deleted or outside the selected plant, so a
 * broad companion cannot resurrect or misattribute that event.
 */
export function summarizeConnectedActivationEvidence(
  input: ConnectedActivationEvidenceInput,
): ConnectedActivationEvidenceSummary {
  const growId = nonBlankId(input?.growId);
  const tentId = nonBlankId(input?.tentId);
  const plantId = nonBlankId(input?.plantId);
  if (!growId || !tentId || !plantId) {
    return { count: 0, hasEvidence: false, latestAt: null, latestSource: null };
  }

  const scope = { growId, tentId, plantId };
  const allGrowEventsById = new Map<string, ConnectedActivationGrowEventRow>();
  for (const row of input?.growEvents ?? []) {
    if (!row) continue;
    const id = nonBlankId(row.id);
    if (!id) continue;
    const existing = allGrowEventsById.get(id);
    if (!existing) {
      allGrowEventsById.set(id, row);
      continue;
    }
    if (compareText(growEventIdentityRank(row), growEventIdentityRank(existing)) < 0) {
      allGrowEventsById.set(id, row);
    }
  }

  const candidates: EvidenceCandidate[] = [];
  const eligibleGrowEventIds = new Set<string>();
  for (const [id, row] of allGrowEventsById) {
    if (!matchesConnectedScope(row, scope)) continue;
    if (row.source !== "manual") continue;
    if (row.is_deleted === true || nonBlankId(row.deleted_at) !== null) continue;
    if (!MANUAL_GROW_EVENT_TYPES.has(nonBlankId(row.event_type) ?? "")) continue;
    const timestamp = parseTimestamp(row.occurred_at, row.created_at);
    if (!timestamp) continue;
    eligibleGrowEventIds.add(id);
    candidates.push({
      key: `grow_events:${id}`,
      id,
      at: timestamp.at,
      epochMs: timestamp.epochMs,
      source: "grow_events",
    });
  }

  for (const row of input?.diaryEntries ?? []) {
    if (!row) continue;
    const id = nonBlankId(row.id);
    if (!id || !matchesConnectedScope(row, scope)) continue;

    const links = diaryLinks(row);
    // A known parent owns the logical evidence. Eligible parents are already
    // counted; ineligible/different-scope parents must not be resurrected.
    if (links.some((link) => allGrowEventsById.has(link))) continue;
    // Kept as a separate assertion-friendly guard if callers provide a
    // pre-filtered grow-event list in a future refactor.
    if (links.some((link) => eligibleGrowEventIds.has(link))) continue;

    const timestamp = parseTimestamp(row.entry_at, row.created_at);
    if (!timestamp) continue;
    candidates.push({
      key: `diary_entries:${id}`,
      id,
      at: timestamp.at,
      epochMs: timestamp.epochMs,
      source: "diary_entries",
    });
  }

  candidates.sort(compareEvidence);
  const unique: EvidenceCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    unique.push(candidate);
  }
  const latest = unique[0] ?? null;

  return {
    count: unique.length,
    hasEvidence: unique.length > 0,
    latestAt: latest?.at ?? null,
    latestSource: latest?.source ?? null,
  };
}
