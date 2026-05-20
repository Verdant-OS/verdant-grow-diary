/**
 * Read/write helpers for the persistent `public.alerts` table.
 *
 * Strict safety constraints:
 *   - All writes rely on RLS + DB defaults; the client NEVER sends user_id.
 *   - No service_role. No automation. No device commands.
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
