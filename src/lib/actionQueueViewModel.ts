/**
 * actionQueueViewModel — pure helpers that map an Action Queue row to
 * a safe drawer view model.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no AI calls.
 *  - Never surfaces internal UUIDs, raw `[alert:<id>]` / `[session:<id>]`
 *    back-pointer tokens, bridge tokens, service-role keys, or raw
 *    payload internals.
 *  - Treats missing related diary context with a calm empty-state
 *    message — never classifies unknown context as healthy.
 */

import {
  formatActionTypeLabel,
  formatRiskLabel,
  formatStatusLabel,
  formatActionTargetLabel,
  sanitizeActionCopy,
} from "@/lib/actionQueueRowView";
import {
  getActionQueueSourceLabel,
  stripBackPointerTokens,
} from "@/lib/actionQueueProvenanceRules";

export interface ActionDrawerInput {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  source?: string | null;
  action_type?: string | null;
  target_metric?: string | null;
  target_device?: string | null;
  suggested_change?: string | null;
  reason?: string | null;
  risk_level?: string | null;
  status?: string | null;
}

export interface DrawerContextLookups {
  tentsById?: Record<string, { name?: string | null } | undefined>;
  plantsById?: Record<
    string,
    { strain?: string | null; nickname?: string | null } | undefined
  >;
  growsById?: Record<string, { name?: string | null } | undefined>;
}

export interface ActionDrawerViewModel {
  titleLabel: string;
  recommendationText: string;
  reasonText: string;
  riskLabel: string;
  statusLabel: string;
  sourceLabel: string;
  targetLabel: string;
  growLabel: string | null;
  tentLabel: string | null;
  plantLabel: string | null;
  hasRelatedContext: boolean;
  /** Visible only when no related diary context exists. */
  noContextHelpText: string;
  /** Constant safety reminder rendered in every drawer body. */
  safetyReminder: string;
}

export const ACTION_DRAWER_SAFETY_REMINDER =
  "Verdant suggests. Grower approves. No equipment is controlled from this action.";

export const ACTION_DRAWER_NO_CONTEXT_HELP =
  "No related diary context found yet.";

function tentLabelFor(
  tent_id: string | null | undefined,
  lookups: DrawerContextLookups | undefined,
): string | null {
  if (!tent_id) return null;
  const name = lookups?.tentsById?.[tent_id]?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
}

function plantLabelFor(
  plant_id: string | null | undefined,
  lookups: DrawerContextLookups | undefined,
): string | null {
  if (!plant_id) return null;
  const p = lookups?.plantsById?.[plant_id];
  if (!p) return null;
  if (typeof p.nickname === "string" && p.nickname.trim()) return p.nickname.trim();
  if (typeof p.strain === "string" && p.strain.trim()) return p.strain.trim();
  return null;
}

function growLabelFor(
  grow_id: string | null | undefined,
  lookups: DrawerContextLookups | undefined,
): string | null {
  if (!grow_id) return null;
  const name = lookups?.growsById?.[grow_id]?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return null;
}

export function buildActionDrawerViewModel(
  row: ActionDrawerInput,
  lookups: DrawerContextLookups = {},
): ActionDrawerViewModel {
  const recommendationText = sanitizeActionCopy(row.suggested_change ?? "");
  const reasonText = sanitizeActionCopy(
    stripBackPointerTokens(row.reason ?? ""),
  );
  const titleLabel = recommendationText || formatActionTypeLabel(row.action_type);
  const growLabel = growLabelFor(row.grow_id, lookups);
  const tentLabel = tentLabelFor(row.tent_id, lookups);
  const plantLabel = plantLabelFor(row.plant_id, lookups);
  const hasRelatedContext = Boolean(growLabel || tentLabel || plantLabel);

  return {
    titleLabel,
    recommendationText,
    reasonText,
    riskLabel: formatRiskLabel(row.risk_level),
    statusLabel: formatStatusLabel(row.status),
    sourceLabel: getActionQueueSourceLabel({ source: row.source ?? "" }),
    targetLabel: formatActionTargetLabel(row.target_metric, row.target_device),
    growLabel,
    tentLabel,
    plantLabel,
    hasRelatedContext,
    noContextHelpText: ACTION_DRAWER_NO_CONTEXT_HELP,
    safetyReminder: ACTION_DRAWER_SAFETY_REMINDER,
  };
}
