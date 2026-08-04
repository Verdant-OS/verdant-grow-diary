/**
 * Pure presentation helpers for the Alerts route.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Keeps display/formatting logic outside JSX so it can be unit-tested and
 * shared by accessibility-related labels.
 */
import { formatDistanceToNow } from "date-fns";
import type { AlertSeverityRow, AlertStatusRow } from "@/lib/alerts";

export const SEVERITY_LABEL: Record<AlertSeverityRow, string> = {
  critical: "Critical",
  warning: "Warning",
  watch: "Watch",
  info: "Info",
};

export const STATUS_LABEL: Record<AlertStatusRow, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

/**
 * Map a stored source slug (e.g. `environment_alerts`, `ai_doctor`) to a
 * short human-readable label. Unknown values fall back to "Sensor system"
 * so the row never shows a raw machine slug to the user.
 */
export function formatAlertSourceLabel(source: string | null | undefined): string {
  if (!source) return "Sensor system";
  switch (source) {
    case "environment_alerts":
      return "Environment monitor";
    case "ai_doctor":
      return "AI Doctor";
    case "manual":
      return "Manual entry";
    default: {
      // Tokenize unknown machine slugs into a readable Title Case label.
      const cleaned = source.replace(/[_-]+/g, " ").trim();
      if (!cleaned) return "Sensor system";
      return cleaned
        .split(/\s+/)
        .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }
}

/**
 * Human-friendly "X minutes ago" label that swallows parse errors so the row
 * always renders a calm fallback rather than throwing.
 */
export function formatAlertSeenLabel(iso: string | null | undefined): string {
  if (!iso) return "Time unknown";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Time unknown";
  try {
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  } catch {
    return "Time unknown";
  }
}

export interface AlertRowAriaInput {
  severity: AlertSeverityRow;
  status: AlertStatusRow;
  title: string;
  source: string | null | undefined;
  firstSeenAt: string | null | undefined;
}

/**
 * Compact accessible description for an alert row/card. Used as
 * `aria-label` on the surrounding article so screen readers announce
 * severity → status → source → title → time in one breath.
 */
export function buildAlertRowAriaLabel(input: AlertRowAriaInput): string {
  const severity = SEVERITY_LABEL[input.severity] ?? "Info";
  const status = STATUS_LABEL[input.status] ?? "Open";
  const source = formatAlertSourceLabel(input.source);
  const seen = formatAlertSeenLabel(input.firstSeenAt);
  const title = input.title?.trim() || "Untitled alert";
  return `${severity} alert, ${status}. ${title}. Source: ${source}. First seen ${seen}.`;
}
