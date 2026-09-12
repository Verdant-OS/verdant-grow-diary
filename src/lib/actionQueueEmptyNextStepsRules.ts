/**
 * actionQueueEmptyNextStepsRules — canonical empty-state CTAs on /actions.
 *
 * Pure module. Presenter-only destinations for the Needs Review (0) next-step
 * links. Never invents live data, never auto-creates Action Queue items, never
 * touches device control.
 *
 * Destinations are the grower-intended One-Tent Loop surfaces:
 *   - View Timeline → grow-scoped Timeline (never /onboarding)
 *   - Add Sensor Snapshot → Sensors manual-reading anchor (never /plants)
 */

import { sensorsPath, timelinePath } from "@/lib/routes";

export const ACTION_QUEUE_EMPTY_TIMELINE_CTA_LABEL = "View Timeline" as const;
export const ACTION_QUEUE_EMPTY_SENSORS_CTA_LABEL = "Add Sensor Snapshot" as const;

/** Sensors page anchor for the manual snapshot affordance. */
export const ACTION_QUEUE_EMPTY_SENSORS_SNAPSHOT_HASH = "manual-reading" as const;

export interface ActionQueueEmptyNextStepsIds {
  /** Optional grow scope. Blank/null yields the bare index path. */
  growId?: string | null;
}

function normalizeGrowId(growId: unknown): string | null {
  if (typeof growId !== "string") return null;
  const trimmed = growId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Timeline empty-CTA href. Prefer a grow-scoped Timeline URL when a grow id is
 * known so the destination does not depend on mutable active-store fallbacks.
 */
export function buildActionQueueEmptyTimelineHref(ids: ActionQueueEmptyNextStepsIds = {}): string {
  return timelinePath(normalizeGrowId(ids.growId));
}

/**
 * Sensor Snapshot empty-CTA href. Lands on Sensors focused on the manual
 * reading / snapshot entry (hash), optionally grow-scoped.
 */
export function buildActionQueueEmptySensorsHref(ids: ActionQueueEmptyNextStepsIds = {}): string {
  return `${sensorsPath(normalizeGrowId(ids.growId))}#${ACTION_QUEUE_EMPTY_SENSORS_SNAPSHOT_HASH}`;
}

/** Forbidden fallbacks that previously misled empty-state CTAs. */
export const ACTION_QUEUE_EMPTY_FORBIDDEN_HREFS = ["/onboarding", "/plants"] as const;

export function isForbiddenActionQueueEmptyHref(href: string): boolean {
  if (typeof href !== "string" || href.length === 0) return true;
  const pathOnly = href.split(/[?#]/, 1)[0] ?? "";
  return (ACTION_QUEUE_EMPTY_FORBIDDEN_HREFS as readonly string[]).includes(pathOnly);
}
