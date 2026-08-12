/**
 * lineageOrphanRules — pure helpers for grow-lineage orphans.
 *
 * Orphans:
 *   - tents with null grow_id
 *   - plants with null grow_id
 *
 * Used by the Dashboard chip and bulk "assign to active grow" flow.
 * No React, no Supabase, no side effects.
 */

export interface LineageOrphanCounts {
  unboundTentCount: number;
  unboundPlantCount: number;
}

export interface DashboardLineageOrphansView {
  visible: boolean;
  unboundTentCount: number;
  unboundPlantCount: number;
  totalCount: number;
  title: string;
  description: string;
  repairHref: string;
  repairLabel: string;
  canBulkAssign: boolean;
  bulkCtaLabel: string | null;
  bulkDisabledReason: string | null;
  activeGrowLabel: string | null;
}

export const LINEAGE_REPAIR_HREF = "/grow-lineage" as const;

export function normalizeCount(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function totalOrphanCount(input: LineageOrphanCounts): number {
  return normalizeCount(input.unboundTentCount) + normalizeCount(input.unboundPlantCount);
}

export function hasLineageOrphans(input: LineageOrphanCounts): boolean {
  return totalOrphanCount(input) > 0;
}

export function canBulkAssignOrphansToActiveGrow(input: {
  activeGrowId: string | null | undefined;
  unboundTentCount: number;
  unboundPlantCount: number;
}): boolean {
  if (!input.activeGrowId) return false;
  return hasLineageOrphans({
    unboundTentCount: input.unboundTentCount,
    unboundPlantCount: input.unboundPlantCount,
  });
}

/**
 * Dashboard card view-model. Hidden when there are no orphans.
 * Bulk assign requires an active grow; otherwise only the repair link shows.
 */
export function buildDashboardLineageOrphansView(input: {
  unboundTentCount: number;
  unboundPlantCount: number;
  activeGrowId?: string | null;
  activeGrowName?: string | null;
}): DashboardLineageOrphansView {
  const unboundTentCount = normalizeCount(input.unboundTentCount);
  const unboundPlantCount = normalizeCount(input.unboundPlantCount);
  const total = unboundTentCount + unboundPlantCount;
  const activeGrowId = input.activeGrowId ?? null;
  const activeGrowLabel = input.activeGrowName?.trim() || null;
  const canBulk = canBulkAssignOrphansToActiveGrow({
    activeGrowId,
    unboundTentCount,
    unboundPlantCount,
  });

  const parts: string[] = [];
  if (unboundTentCount > 0) {
    parts.push(`${unboundTentCount} tent${unboundTentCount === 1 ? "" : "s"}`);
  }
  if (unboundPlantCount > 0) {
    parts.push(`${unboundPlantCount} plant${unboundPlantCount === 1 ? "" : "s"}`);
  }
  const list = parts.join(" · ");

  return {
    visible: total > 0,
    unboundTentCount,
    unboundPlantCount,
    totalCount: total,
    title: total === 1 ? "1 item missing grow link" : `${total} items missing grow links`,
    description:
      total > 0
        ? `${list} have no grow_id. Quick Log and Action Queue need grow context. Assign them to your active setup, or open Lineage Repair for per-row control.`
        : "All tents and plants are linked to a grow.",
    repairHref: LINEAGE_REPAIR_HREF,
    repairLabel: "Open Lineage Repair",
    canBulkAssign: canBulk,
    bulkCtaLabel: canBulk
      ? activeGrowLabel
        ? `Assign all to active grow (${activeGrowLabel})`
        : "Assign all to active grow"
      : null,
    bulkDisabledReason:
      total > 0 && !activeGrowId
        ? "Set an active grow first, then assign orphans in one click."
        : null,
    activeGrowLabel,
  };
}

/** Summarize bulk assign result for toast copy. */
export function formatBulkAssignResult(input: {
  tentsUpdated: number;
  plantsUpdated: number;
}): string {
  const t = normalizeCount(input.tentsUpdated);
  const p = normalizeCount(input.plantsUpdated);
  if (t === 0 && p === 0) return "No unbound tents or plants to assign.";
  const parts: string[] = [];
  if (t > 0) parts.push(`${t} tent${t === 1 ? "" : "s"}`);
  if (p > 0) parts.push(`${p} plant${p === 1 ? "" : "s"}`);
  return `Assigned ${parts.join(" and ")} to active grow.`;
}
