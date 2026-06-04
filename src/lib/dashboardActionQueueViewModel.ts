/**
 * dashboardActionQueueViewModel — pure presentation helpers for the
 * Dashboard's Approval-Required Action Queue section.
 *
 * Hard constraints:
 *  - No I/O. No Supabase. No React. No hooks. No timers.
 *  - Read-only: never mutates input.
 *  - Approval-required by construction. Nothing here executes equipment
 *    commands, schedules automation, or implies device control.
 *  - Severity tone is presentation-only — it does NOT change rules,
 *    targets, alert logic, or AI Doctor behavior.
 */
import type { PendingAction } from "@/hooks/useDashboardScopedData";

/** Display-ready row built from a `pending_approval` action_queue record. */
export interface ApprovalQueueViewItem {
  id: string;
  title: string;
  reason: string;
  riskLevelLabel: string;
  severity: "critical" | "warning" | "info";
  tentName: string | null;
  plantLabel: string | null;
  /** Lineage label for the row's source (e.g. ai_doctor, alert, manual). */
  sourceLabel: string | null;
  status: string;
  createdAt: string;
}

export interface ApprovalQueueLookups {
  /** Map of tent_id → friendly tent name (built from already-loaded tents). */
  tentsById?: Record<string, { name: string } | undefined>;
  /** Map of plant_id → friendly label (built from already-loaded plants). */
  plantsById?: Record<string, { strain?: string | null; nickname?: string | null } | undefined>;
}

/** Risk level → presentation severity. Bias toward "warning" by default. */
export function mapRiskToSeverity(risk: unknown): "critical" | "warning" | "info" {
  if (typeof risk !== "string") return "warning";
  const r = risk.trim().toLowerCase();
  if (r === "high" || r === "critical" || r === "danger") return "critical";
  if (r === "low" || r === "info" || r === "informational") return "info";
  return "warning";
}

function formatPlantLabel(
  p: { strain?: string | null; nickname?: string | null } | undefined,
): string | null {
  if (!p) return null;
  if (typeof p.nickname === "string" && p.nickname.trim()) return p.nickname.trim();
  if (typeof p.strain === "string" && p.strain.trim()) return p.strain.trim();
  return null;
}

/**
 * Pure helper. Builds display rows from raw pending action items + the
 * tent / plant lookups the Dashboard already loaded.
 */
export function buildApprovalQueueViewItems(
  items: ReadonlyArray<
    PendingAction & {
      tent_id?: string | null;
      plant_id?: string | null;
      source?: string | null;
      status?: string | null;
    }
  >,
  lookups: ApprovalQueueLookups = {},
): ApprovalQueueViewItem[] {
  if (!Array.isArray(items)) return [];
  const tents = lookups.tentsById ?? {};
  const plants = lookups.plantsById ?? {};

  return items.map((a) => {
    const tentName =
      a.tent_id && tents[a.tent_id]?.name ? tents[a.tent_id]!.name : null;
    const plantLabel =
      a.plant_id && plants[a.plant_id] ? formatPlantLabel(plants[a.plant_id]) : null;
    const source =
      typeof a.source === "string" && a.source.trim() ? a.source.trim() : null;

    return {
      id: a.id,
      title: a.suggested_change ?? "Recommendation",
      reason: a.reason ?? "",
      riskLevelLabel:
        typeof a.risk_level === "string" && a.risk_level.trim()
          ? a.risk_level.trim()
          : "unspecified",
      severity: mapRiskToSeverity(a.risk_level),
      tentName,
      plantLabel,
      sourceLabel: source,
      status: typeof a.status === "string" && a.status ? a.status : "pending_approval",
      createdAt: a.created_at,
    };
  });
}

/**
 * Constant copy used wherever Verdant surfaces sensor intelligence or
 * suggested actions. Centralised so the static safety scanner can
 * verify it appears near recommendation UI.
 */
export const SAFE_BY_DESIGN_COPY = {
  badge: "Safe by Design",
  readOnly: "Read-Only",
  approvalRequired: "Approval Required",
  /** Long-form explainer rendered near recommendations. */
  explainer:
    "Verdant suggests. Grower approves. No device control is executed from this screen.",
} as const;

/** Honest empty-state copy. */
export const APPROVAL_QUEUE_EMPTY_COPY = {
  title: "No recommendations awaiting approval.",
  hint: "When Verdant detects something worth your attention, suggestions show up here for you to review before any change is made.",
} as const;
