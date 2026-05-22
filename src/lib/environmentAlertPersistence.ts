/**
 * Pure rules for promoting derived environment alerts into persistent
 * `public.alerts` rows.
 *
 * Strict constraints:
 *   - No I/O. No Supabase calls. No React. No timers.
 *   - No AI calls. No plant-health diagnosis. No device control.
 *   - No elevated keys.
 *   - Read-only logic; just decides which alerts SHOULD be saved and
 *     produces deterministic idempotency keys. The hook layer performs
 *     the actual writes, scoped to `auth.uid()` via RLS + DB defaults.
 *
 * Only alerts derived from REAL, VALID sensor readings are eligible:
 *   - snapshot must exist
 *   - snapshot.source must be "live" or "manual" (never "diary", "unavailable")
 *   - snapshot must not be stale
 *   - quality must not be "unavailable"
 *   - the alert must not itself be a "data unavailable / stale / missing
 *     targets" synthetic signal (those describe missing data, not real
 *     environment problems)
 *   - demo/fallback/mock data is explicitly rejected
 */
import { isStale, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQuality } from "@/lib/sensorQuality";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";

/** IDs produced by buildEnvironmentAlerts that describe missing/degraded
 * data rather than real environment conditions. These must never persist. */
const SYNTHETIC_ALERT_IDS = new Set<string>([
  "snapshot:unavailable",
  "snapshot:stale",
  "targets:missing",
]);

export interface PersistenceContext {
  snapshot: SensorSnapshot | null;
  quality: SensorQuality;
  /** True if the upstream data layer flagged this as demo/fallback/mock. */
  isDemoData?: boolean;
  /** Defaults to Date.now(); injectable for tests. */
  now?: number;
}

/** Returns true only when the snapshot is real and valid enough to back a
 * persisted alert. */
export function isSnapshotPersistable(ctx: PersistenceContext): boolean {
  const { snapshot, quality } = ctx;
  if (ctx.isDemoData === true) return false;
  if (!snapshot) return false;
  if (snapshot.source !== "live" && snapshot.source !== "manual") return false;
  if (quality === "unavailable") return false;
  const now = ctx.now ?? Date.now();
  if (isStale(snapshot.ts, now)) return false;
  return true;
}

/** Pick only the derived alerts that should be persisted under ctx. */
export function selectPersistableAlerts(
  alerts: readonly EnvironmentAlert[],
  ctx: PersistenceContext,
): EnvironmentAlert[] {
  if (!isSnapshotPersistable(ctx)) return [];
  return alerts.filter((a) => !SYNTHETIC_ALERT_IDS.has(a.id));
}

/** Deterministic idempotency key for an environment alert within a grow.
 * Stable across renders so dedupe against existing open `alerts` rows works. */
export function alertRuleKey(args: {
  metric: string | null | undefined;
  source: string;
  reason: string;
}): string {
  const metric = (args.metric ?? "").toString().trim().toLowerCase();
  const source = args.source.trim().toLowerCase();
  const reason = args.reason.trim();
  return `${source}::${metric}::${reason}`;
}

/** Build a key from an in-memory derived alert. */
export function derivedAlertKey(
  alert: EnvironmentAlert,
  source = "environment_alerts",
): string {
  return alertRuleKey({
    metric: typeof alert.metric === "string" ? alert.metric : null,
    source,
    reason: alert.reason,
  });
}

/** Build a key from a persisted alerts row shape. */
export function persistedAlertKey(row: {
  metric: string | null;
  source: string | null;
  reason: string;
}): string {
  return alertRuleKey({
    metric: row.metric,
    source: row.source ?? "environment_alerts",
    reason: row.reason,
  });
}

/** Filter a list of derived persistable alerts to ones not already represented
 * by an open persisted alert row. */
export function dedupeAgainstOpen(
  persistable: readonly EnvironmentAlert[],
  openRows: readonly { metric: string | null; source: string | null; reason: string }[],
  source = "environment_alerts",
): EnvironmentAlert[] {
  const existing = new Set(openRows.map((r) => persistedAlertKey(r)));
  return persistable.filter((a) => !existing.has(derivedAlertKey(a, source)));
}
