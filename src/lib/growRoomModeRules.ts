/**
 * Grow-Room Mode — pure aggregation rules.
 *
 * Reduces existing per-tent data (latest snapshot, persisted alerts,
 * pending Action Queue items) into a deterministic operator view.
 *
 * READ-ONLY. NO I/O. NO REACT. NO SUPABASE. NOT AUTOMATION.
 *  - Never produces a write.
 *  - Never produces a device command.
 *  - Never invents data: missing/unknown is reported honestly.
 *  - Never labels demo / manual / stale data as live.
 *  - Caller (UI) does the rendering only — no business logic in JSX.
 *
 * Pure: deterministic, no clock reads (caller passes `now`).
 */
import type { SensorSnapshot, SnapshotSource } from "@/lib/sensorSnapshot";

// ---------- Inputs --------------------------------------------------------

export type GrowRoomAlertSeverity = "info" | "watch" | "warning" | "critical";
export type GrowRoomAlertStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";
export type GrowRoomActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface GrowRoomTentInput {
  id: string;
  name: string;
  grow_id: string | null;
}

export interface GrowRoomAlertInput {
  id: string;
  tent_id: string | null;
  grow_id: string | null;
  severity: GrowRoomAlertSeverity;
  status: GrowRoomAlertStatus;
  title: string;
  created_at: string;
}

export interface GrowRoomActionInput {
  id: string;
  tent_id: string | null;
  grow_id: string | null;
  status: GrowRoomActionStatus;
}

export interface GrowRoomAggregationInput {
  tents: GrowRoomTentInput[];
  /** Map of tent id → latest snapshot. Caller may omit a tent → "missing". */
  snapshotsByTentId?: Record<string, SensorSnapshot | null | undefined>;
  alerts: GrowRoomAlertInput[];
  actions: GrowRoomActionInput[];
  /** Now in ms since epoch. Pass explicitly for determinism. */
  now: number;
  /**
   * If a snapshot's caller-side `isDemoData` flag is true, pass the tent id
   * here so it is labeled honestly instead of as live/manual data.
   */
  demoTentIds?: string[];
  /** Override stale threshold (default 30 minutes). */
  staleMinutes?: number;
  /** Override recent-alert window (default 24h). */
  recentAlertWindowHours?: number;
}

// ---------- Outputs -------------------------------------------------------

export type SnapshotState =
  | "live"
  | "manual"
  | "diary"
  | "stale"
  | "missing"
  | "demo";

export type DataHealth =
  | "healthy"
  | "attention"
  | "warning"
  | "critical"
  | "stale"
  | "missing";

export type PrimaryRecommendation =
  | "review_alert"
  | "review_action_queue"
  | "check_stale_data"
  | "no_action";

export type SeverityOrNone = GrowRoomAlertSeverity | "none";

export interface GrowRoomTentCard {
  tentId: string;
  tentName: string;
  growId: string | null;
  snapshot: SensorSnapshot | null;
  snapshotAgeMinutes: number | null;
  snapshotState: SnapshotState;
  openAlertCount: number;
  recentAlertCount: number;
  highestSeverity: SeverityOrNone;
  pendingActionCount: number;
  dataHealth: DataHealth;
  primaryRecommendation: PrimaryRecommendation;
}

// ---------- Constants -----------------------------------------------------

const SEVERITY_RANK: Record<SeverityOrNone, number> = {
  critical: 4,
  warning: 3,
  watch: 2,
  info: 1,
  none: 0,
};

const HEALTH_FROM_SEVERITY: Record<SeverityOrNone, DataHealth> = {
  critical: "critical",
  warning: "warning",
  watch: "attention",
  info: "attention",
  none: "healthy",
};

const HEALTH_RANK: Record<DataHealth, number> = {
  critical: 5,
  warning: 4,
  stale: 3,
  missing: 3,
  attention: 2,
  healthy: 1,
};

const DEFAULT_STALE_MINUTES = 30;
const DEFAULT_RECENT_HOURS = 24;

// ---------- Helpers (pure) -------------------------------------------------

function snapshotAgeMinutes(snapshot: SensorSnapshot, now: number): number | null {
  if (!snapshot.ts) return null;
  const ts = Date.parse(snapshot.ts);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((now - ts) / 60000));
}

function classifySnapshot(
  snapshot: SensorSnapshot | null | undefined,
  now: number,
  staleMinutes: number,
  isDemo: boolean,
): { state: SnapshotState; ageMinutes: number | null } {
  if (!snapshot || snapshot.source === "unavailable") {
    return { state: "missing", ageMinutes: null };
  }
  if (isDemo) {
    return {
      state: "demo",
      ageMinutes: snapshotAgeMinutes(snapshot, now),
    };
  }
  const age = snapshotAgeMinutes(snapshot, now);
  if (age === null || age > staleMinutes) {
    return { state: "stale", ageMinutes: age };
  }
  const src: SnapshotSource = snapshot.source;
  if (src === "manual" || src === "diary" || src === "live") {
    return { state: src, ageMinutes: age };
  }
  // Unknown source falls back to missing so we never claim "live" by accident.
  return { state: "missing", ageMinutes: null };
}

function highestSeverity(alerts: GrowRoomAlertInput[]): SeverityOrNone {
  let best: SeverityOrNone = "none";
  for (const a of alerts) {
    if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[best]) {
      best = a.severity;
    }
  }
  return best;
}

function recommendationFor(
  openAlertCount: number,
  pendingActionCount: number,
  snapshotState: SnapshotState,
): PrimaryRecommendation {
  if (openAlertCount > 0) return "review_alert";
  if (pendingActionCount > 0) return "review_action_queue";
  if (snapshotState === "stale" || snapshotState === "missing") {
    return "check_stale_data";
  }
  return "no_action";
}

function dataHealthFor(
  openAlertCount: number,
  snapshotState: SnapshotState,
  severity: SeverityOrNone,
): DataHealth {
  if (snapshotState === "missing") return "missing";
  if (snapshotState === "stale") return "stale";
  if (openAlertCount === 0) return "healthy";
  return HEALTH_FROM_SEVERITY[severity];
}

// ---------- Public API ----------------------------------------------------

/**
 * Aggregate operator-facing per-tent cards.
 *
 * Deterministic ordering:
 *   1) Highest open-alert severity (critical → warning → watch → info → none)
 *   2) Pending action count, descending
 *   3) Data health rank (critical/warning > stale/missing > attention > healthy)
 *   4) Tent name (lexical, case-insensitive)
 *   5) Tent id (stable tie-break)
 *
 * Read-only and pure. The caller must provide `now`.
 */
export function buildGrowRoomTentCards(
  input: GrowRoomAggregationInput,
): GrowRoomTentCard[] {
  const stale = input.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const recentMs = (input.recentAlertWindowHours ?? DEFAULT_RECENT_HOURS) * 3600_000;
  const demoSet = new Set(input.demoTentIds ?? []);
  const snapshots = input.snapshotsByTentId ?? {};

  // Pre-bucket by tent_id for O(n) aggregation.
  const alertsByTent = new Map<string, GrowRoomAlertInput[]>();
  for (const a of input.alerts) {
    if (!a.tent_id) continue;
    const list = alertsByTent.get(a.tent_id) ?? [];
    list.push(a);
    alertsByTent.set(a.tent_id, list);
  }
  const actionsByTent = new Map<string, GrowRoomActionInput[]>();
  for (const ac of input.actions) {
    if (!ac.tent_id) continue;
    const list = actionsByTent.get(ac.tent_id) ?? [];
    list.push(ac);
    actionsByTent.set(ac.tent_id, list);
  }

  const cards: GrowRoomTentCard[] = input.tents.map((tent) => {
    const tentAlerts = alertsByTent.get(tent.id) ?? [];
    const openAlerts = tentAlerts.filter((a) => a.status === "open");
    const recentAlerts = tentAlerts.filter((a) => {
      const ts = Date.parse(a.created_at);
      if (Number.isNaN(ts)) return false;
      return input.now - ts <= recentMs;
    });
    const tentActions = actionsByTent.get(tent.id) ?? [];
    const pending = tentActions.filter((a) => a.status === "pending_approval");

    const snapshot = snapshots[tent.id] ?? null;
    const { state: snapshotState, ageMinutes } = classifySnapshot(
      snapshot,
      input.now,
      stale,
      demoSet.has(tent.id),
    );

    const severity = highestSeverity(openAlerts);
    const health = dataHealthFor(openAlerts.length, snapshotState, severity);

    return {
      tentId: tent.id,
      tentName: tent.name,
      growId: tent.grow_id ?? null,
      snapshot: snapshot ?? null,
      snapshotAgeMinutes: ageMinutes,
      snapshotState,
      openAlertCount: openAlerts.length,
      recentAlertCount: recentAlerts.length,
      highestSeverity: severity,
      pendingActionCount: pending.length,
      dataHealth: health,
      primaryRecommendation: recommendationFor(
        openAlerts.length,
        pending.length,
        snapshotState,
      ),
    };
  });

  cards.sort((a, b) => {
    const s = SEVERITY_RANK[b.highestSeverity] - SEVERITY_RANK[a.highestSeverity];
    if (s !== 0) return s;
    const p = b.pendingActionCount - a.pendingActionCount;
    if (p !== 0) return p;
    const h = HEALTH_RANK[b.dataHealth] - HEALTH_RANK[a.dataHealth];
    if (h !== 0) return h;
    const n = a.tentName.toLowerCase().localeCompare(b.tentName.toLowerCase());
    if (n !== 0) return n;
    return a.tentId.localeCompare(b.tentId);
  });

  return cards;
}

// Copy presented to UI for the recommendation chip. Centralized so the page
// never invents per-tent copy in JSX.
export const RECOMMENDATION_LABEL: Record<PrimaryRecommendation, string> = {
  review_alert: "Review alert",
  review_action_queue: "Review action queue",
  check_stale_data: "Check stale sensor data",
  no_action: "No immediate action",
};

export const SNAPSHOT_STATE_LABEL: Record<SnapshotState, string> = {
  live: "Live",
  manual: "Manual entry",
  diary: "From diary",
  stale: "Stale",
  missing: "No data",
  demo: "Demo data",
};

export const DATA_HEALTH_LABEL: Record<DataHealth, string> = {
  healthy: "Healthy",
  attention: "Needs review",
  warning: "Warning",
  critical: "Critical",
  stale: "Stale data",
  missing: "Missing data",
};
