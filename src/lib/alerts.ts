/**
 * Read/write helpers for the persistent `public.alerts` table.
 *
 * Strict safety constraints:
 *   - All writes rely on RLS + DB defaults; the client NEVER sends user_id.
 *   - Read-only behaviour by default. Suggests nothing automated.
 *   - No Action Queue writes.
 *   - Save/acknowledge/resolve/dismiss are user-initiated only.
 */
import { supabase } from "@/integrations/supabase/client";

export type AlertSeverityRow = "info" | "watch" | "warning" | "critical";
export type AlertStatusRow =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export interface AlertRow {
  id: string;
  user_id: string;
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  source: string;
  severity: AlertSeverityRow;
  metric: string | null;
  title: string;
  reason: string;
  status: AlertStatusRow;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveAlertInput {
  grow_id: string;
  severity: AlertSeverityRow;
  title: string;
  reason: string;
  metric?: string | null;
  source?: string;
  tent_id?: string | null;
  plant_id?: string | null;
}

// The Supabase types file is regenerated after this migration; until then we
// access the table through an untyped client. RLS still enforces ownership.
function alertsTable() {
  return (supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  }).from("alerts");
}

/** Persist a generated alert candidate. Omits user_id (DB default = auth.uid()). */
export async function saveAlert(input: SaveAlertInput): Promise<AlertRow> {
  const payload = {
    grow_id: input.grow_id,
    severity: input.severity,
    title: input.title,
    reason: input.reason,
    metric: input.metric ?? null,
    source: input.source ?? "environment_alerts",
    tent_id: input.tent_id ?? null,
    plant_id: input.plant_id ?? null,
    status: "open" as AlertStatusRow,
  };
  const { data, error } = await alertsTable()
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AlertRow;
}

/** Mark an alert as acknowledged. Only flips status/acknowledged_at. */
export async function acknowledgeAlert(id: string): Promise<AlertRow> {
  const { data, error } = await alertsTable()
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AlertRow;
}

/** Mark an alert as resolved. Only flips status/resolved_at. */
export async function resolveAlert(id: string): Promise<AlertRow> {
  const { data, error } = await alertsTable()
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AlertRow;
}

/** Dismiss an alert. Only flips status. */
export async function dismissAlert(id: string): Promise<AlertRow> {
  const { data, error } = await alertsTable()
    .update({ status: "dismissed" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AlertRow;
}

export interface AlertsQuery {
  growId?: string | null;
  status?: AlertStatusRow | "all";
  severity?: AlertSeverityRow | "all";
}

export async function listAlerts(query: AlertsQuery = {}): Promise<AlertRow[]> {
  let q = alertsTable()
    .select("*")
    .order("first_seen_at", { ascending: false });
  if (query.growId) q = q.eq("grow_id", query.growId);
  if (query.status && query.status !== "all") q = q.eq("status", query.status);
  if (query.severity && query.severity !== "all") {
    q = q.eq("severity", query.severity);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AlertRow[];
}

// ---------------------------------------------------------------------------
// Alert events — immutable audit trail (append-only)
// ---------------------------------------------------------------------------

export type AlertEventType =
  | "created"
  | "acknowledged"
  | "resolved"
  | "dismissed"
  | "reopened";

export interface AlertEventRow {
  id: string;
  user_id: string;
  alert_id: string;
  grow_id: string;
  event_type: AlertEventType;
  previous_status: AlertStatusRow | null;
  new_status: AlertStatusRow | null;
  note: string | null;
  created_at: string;
}

export interface LogAlertEventInput {
  alert_id: string;
  grow_id: string;
  event_type: AlertEventType;
  previous_status?: AlertStatusRow | null;
  new_status?: AlertStatusRow | null;
  note?: string | null;
}

function alertEventsTable() {
  return (supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  }).from("alert_events");
}

/**
 * Append an immutable audit row. user_id is intentionally omitted; the DB
 * default (auth.uid()) plus RLS enforce ownership. Never updates or deletes.
 */
export async function logAlertEvent(
  input: LogAlertEventInput,
): Promise<AlertEventRow> {
  const payload = {
    alert_id: input.alert_id,
    grow_id: input.grow_id,
    event_type: input.event_type,
    previous_status: input.previous_status ?? null,
    new_status: input.new_status ?? null,
    note: input.note ?? null,
  };
  const { data, error } = await alertEventsTable()
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AlertEventRow;
}

/** Read recent audit events for an alert (newest first). RLS enforces ownership. */
export async function listAlertEvents(
  alertId: string,
  limit = 20,
): Promise<AlertEventRow[]> {
  const { data, error } = await alertEventsTable()
    .select("*")
    .eq("alert_id", alertId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as AlertEventRow[];
}
