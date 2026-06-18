/**
 * tentPlantRosterActionTracking — non-invasive client-side tracking helper
 * for Tent Plant Roster row quick-action menu clicks.
 *
 * Dispatches a single browser CustomEvent. Does NOT call fetch /
 * XMLHttpRequest, does NOT write to Supabase, does NOT call AI/model
 * endpoints, does NOT touch alerts, Action Queue, or device control.
 * Tracking failures are swallowed so navigation/handoff is never blocked.
 *
 * Safe event detail intentionally omits private/internal ids
 * (plantId / tentId / growId) and instead surfaces only:
 *   - action kind
 *   - plantName (already displayed in the row)
 *   - hasTentContext flag
 *   - anchorBlocked flag (only meaningful for view_photos fallback)
 */

export const TENT_ROSTER_ACTION_EVENT = "verdant:tent-roster-action" as const;

export type TentPlantRosterTrackingAction =
  | "view_diary"
  | "add_quick_log"
  | "view_photos";

export interface TentPlantRosterTrackingDetail {
  action: TentPlantRosterTrackingAction;
  plantName: string | null;
  hasTentContext: boolean;
  anchorBlocked: boolean;
}

export function trackTentRosterAction(detail: TentPlantRosterTrackingDetail): void {
  if (typeof window === "undefined") return;
  try {
    const safeName =
      typeof detail.plantName === "string" && detail.plantName.trim().length > 0
        ? detail.plantName.trim()
        : null;
    window.dispatchEvent(
      new CustomEvent(TENT_ROSTER_ACTION_EVENT, {
        detail: {
          action: detail.action,
          plantName: safeName,
          hasTentContext: detail.hasTentContext === true,
          anchorBlocked: detail.anchorBlocked === true,
        },
      }),
    );
  } catch {
    /* swallow — tracking must never block navigation/handoff */
  }
}
