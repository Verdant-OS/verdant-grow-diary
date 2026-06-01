/**
 * Pure presentation helpers for Action Queue rows.
 *
 * Read-only. No React. No Supabase. No I/O.
 *
 * Keeps display/formatting logic outside JSX so it can be unit-tested
 * and reused for accessibility-related labels.
 */

import { getActionQueueSourceLabel } from "@/lib/actionQueueProvenanceRules";

type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

export const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending review",
  simulated: "Simulated",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function formatActionTypeLabel(actionType: string | null | undefined): string {
  const raw = (actionType ?? "").trim();
  if (!raw) return "Suggested action";
  return raw
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function formatRiskLabel(risk: string | null | undefined): string {
  if (!risk) return "Unknown risk";
  return RISK_LABEL[risk as RiskLevel] ?? "Unknown risk";
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pending review";
  return STATUS_LABEL[status] ?? "Pending review";
}

export interface ActionRowAriaInput {
  action_type: string | null | undefined;
  risk_level: string | null | undefined;
  status: string | null | undefined;
  source: string | null | undefined;
}

/**
 * Compact accessible description for an Action Queue row.
 *
 * Format: "<Risk>: <Action>. <Status>. Source: <Source>. Grower approval required."
 *
 * Never includes internal IDs, raw back-pointer tokens, or device fields.
 */
export function buildActionRowAriaLabel(input: ActionRowAriaInput): string {
  const risk = formatRiskLabel(input.risk_level);
  const action = formatActionTypeLabel(input.action_type);
  const status = formatStatusLabel(input.status);
  const source = getActionQueueSourceLabel({ source: input.source ?? "" });
  return `${risk}: ${action}. ${status}. Source: ${source}. Grower approval required.`;
}
