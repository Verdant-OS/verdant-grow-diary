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
 * The marker lives in memory for this page load only (the Start your room →
 * Plant Detail step is a client-side navigation), names one plant id and is
 * removed the first time it is read, so it can never redirect a later visit.
 * Nothing is written to browser storage: Start your room leaves sessionStorage
 * empty once the room is saved. A reload in between simply means no hand-off
 * (the grower stays on Plant Detail, as before). The store is injected so the
 * rules stay testable.
 */

export const START_ROOM_DASHBOARD_HANDOFF_KEY = "verdant:startRoomDashboardHandoff";

/** Signed-in "/" renders the dashboard inside AppShell. */
export const START_ROOM_DASHBOARD_HREF = "/";

const PLANT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memory = new Map<string, string>();

/** The in-memory store the app uses. */
export const startRoomHandoffMemory: HandoffStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

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
