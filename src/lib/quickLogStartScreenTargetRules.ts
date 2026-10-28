/**
 * Returning sign-in destination for the saved Quick Log start screen.
 *
 * Quick Log may auto-open only when an active plant, its tent, and its grow
 * are already known. Setup still lands on `/plants/:id?open=quick-log`.
 * A later sign-in uses the same plant route when one active plant can be
 * chosen, and the Dashboard with no open marker when none can.
 */
import { isInactiveQuickLogPlant, type MinimalQuickLogPlant } from "@/lib/quickLogPlantOptionRules";
import { plantDetailQuickLogHref } from "@/lib/startYourRoomRules";
import { routeForStartScreen, type StartScreenChoice } from "@/lib/startScreenPreferences";

export const DASHBOARD_WITHOUT_QUICK_LOG_ROUTE = "/dashboard" as const;

/** Hung room read falls closed to the Dashboard instead of a blank /auth. */
export const QUICK_LOG_START_ROOM_TIMEOUT_MS = 4_000;

export interface QuickLogStartPlant extends MinimalQuickLogPlant {
  updated_at?: string | null;
  created_at?: string | null;
}

export interface QuickLogStartTent {
  id: string;
  grow_id?: string | null;
  is_archived?: boolean | null;
}

export interface QuickLogStartGrow {
  id: string;
  is_archived?: boolean | null;
}

export interface QuickLogStartTarget {
  route: string;
  plantId: string | null;
  tentId: string | null;
  growId: string | null;
  opensQuickLog: boolean;
}

function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function recencyMs(plant: QuickLogStartPlant): number {
  const raw = plant.updated_at ?? plant.created_at ?? null;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

/**
 * Active plants whose tent row exists, is not archived, and belongs to a
 * grow row that exists and is not archived. A stored id alone is not enough.
 */
export function eligibleQuickLogStartPlants(
  plants: readonly QuickLogStartPlant[] | null | undefined,
  tents: readonly QuickLogStartTent[] | null | undefined,
  grows: readonly QuickLogStartGrow[] | null | undefined,
): QuickLogStartPlant[] {
  if (!plants || !tents || !grows) return [];
  const activeTents = new Map(
    tents
      .filter((tent) => nonEmpty(tent.id) && tent.is_archived !== true)
      .map((tent) => [tent.id, tent]),
  );
  const activeGrowIds = new Set(
    grows.filter((grow) => nonEmpty(grow.id) && grow.is_archived !== true).map((grow) => grow.id),
  );
  return plants.filter((plant) => {
    if (
      !nonEmpty(plant.id) ||
      !nonEmpty(plant.tent_id) ||
      !nonEmpty(plant.grow_id) ||
      isInactiveQuickLogPlant(plant)
    ) {
      return false;
    }
    const tent = activeTents.get(plant.tent_id);
    if (!tent || tent.grow_id !== plant.grow_id || !activeGrowIds.has(plant.grow_id)) return false;
    return true;
  });
}

function pickMostRecent(plants: readonly QuickLogStartPlant[]): QuickLogStartPlant {
  return [...plants].sort((a, b) => {
    const earlier = recencyMs(a);
    const later = recencyMs(b);
    // Subtracting two missing timestamps is NaN, which skips the id tie-break.
    if (earlier !== later) return later > earlier ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * One active plant, or the most recently updated active plant among several.
 * No eligible plant → Dashboard, and Quick Log stays closed.
 */
export function resolveReturningQuickLogStartTarget(input: {
  plants: readonly QuickLogStartPlant[] | null | undefined;
  tents: readonly QuickLogStartTent[] | null | undefined;
  grows: readonly QuickLogStartGrow[] | null | undefined;
}): QuickLogStartTarget {
  const eligible = eligibleQuickLogStartPlants(input.plants, input.tents, input.grows);
  if (eligible.length === 0) {
    return {
      route: DASHBOARD_WITHOUT_QUICK_LOG_ROUTE,
      plantId: null,
      tentId: null,
      growId: null,
      opensQuickLog: false,
    };
  }
  const plant = eligible.length === 1 ? eligible[0] : pickMostRecent(eligible);
  const tent = (input.tents ?? []).find((row) => row.id === plant.tent_id);
  return {
    route: plantDetailQuickLogHref(plant.id),
    plantId: plant.id,
    tentId: tent?.id ?? plant.tent_id ?? null,
    growId: tent?.grow_id ?? plant.grow_id ?? null,
    opensQuickLog: true,
  };
}

export function resolveReturningSignInRoute(input: {
  explicitRedirect?: string | null;
  savedChoice: StartScreenChoice | null;
  plants?: readonly QuickLogStartPlant[] | null;
  tents?: readonly QuickLogStartTent[] | null;
  grows?: readonly QuickLogStartGrow[] | null;
}): string {
  if (input.explicitRedirect) return input.explicitRedirect;
  if (!input.savedChoice) return "/onboarding";
  if (input.savedChoice !== "quickLog") return routeForStartScreen(input.savedChoice);
  return resolveReturningQuickLogStartTarget({
    plants: input.plants,
    tents: input.tents,
    grows: input.grows,
  }).route;
}
