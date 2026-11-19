/**
 * One-shot hand-off from Start your room to the dashboard.
 *
 * Start your room creates the first plant and opens Quick Log on its Plant
 * Detail page. A new grower used to stay on that page after the first log and
 * never saw the dashboard (QA pass 2026-11-19, B1). Start your room now leaves
 * a marker naming the new plant; when AppShell consumes that page's Quick Log
 * intent for the same plant, it takes the marker, and the first time that
 * Quick Log closes (saved or dismissed) the grower lands on the dashboard.
 *
 * The marker is tab-scoped (sessionStorage), names one plant id and is removed
 * the first time it is read, so it can never redirect a later visit. Storage is
 * injected so the rules stay testable; an unavailable store simply means no
 * hand-off (the grower stays on Plant Detail, as before).
 */

export const START_ROOM_DASHBOARD_HANDOFF_KEY = "verdant:startRoomDashboardHandoff";

/** Signed-in "/" renders the dashboard inside AppShell. */
export const START_ROOM_DASHBOARD_HREF = "/";

const PLANT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserSessionStorage(): HandoffStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function validPlantId(value: unknown): value is string {
  return typeof value === "string" && PLANT_ID.test(value);
}

/** Called by Start your room right before it opens the new plant's Quick Log. */
export function markStartRoomDashboardHandoff(
  storage: HandoffStorage | null,
  plantId: string | null | undefined,
): boolean {
  if (!storage || !validPlantId(plantId)) return false;
  try {
    storage.setItem(START_ROOM_DASHBOARD_HANDOFF_KEY, plantId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Called when AppShell consumes a Plant Detail Quick Log intent. Always clears
 * the marker; returns true only when it names the plant in the route.
 */
export function takeStartRoomDashboardHandoff(
  storage: HandoffStorage | null,
  routePlantId: string | null | undefined,
): boolean {
  if (!storage) return false;
  let stored: string | null = null;
  try {
    stored = storage.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY);
  } catch {
    return false;
  }
  if (stored === null) return false;
  try {
    storage.removeItem(START_ROOM_DASHBOARD_HANDOFF_KEY);
  } catch {
    // A marker that cannot be removed would redirect on every later visit.
    return false;
  }
  return validPlantId(stored) && validPlantId(routePlantId) && stored === routePlantId;
}
