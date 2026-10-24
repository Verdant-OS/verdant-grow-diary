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

export interface QuickLogStartPlant extends MinimalQuickLogPlant {
  updated_at?: string | null;
  created_at?: string | null;
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

/** Active plants that already carry a tent and a grow. */
export function eligibleQuickLogStartPlants(
  plants: readonly QuickLogStartPlant[] | null | undefined,
): QuickLogStartPlant[] {
  if (!plants) return [];
  return plants.filter(
    (plant) =>
      nonEmpty(plant.id) &&
      nonEmpty(plant.tent_id) &&
      nonEmpty(plant.grow_id) &&
      !isInactiveQuickLogPlant(plant),
  );
}

function pickMostRecent(plants: readonly QuickLogStartPlant[]): QuickLogStartPlant {
  return [...plants].sort((a, b) => {
    const byTime = recencyMs(b) - recencyMs(a);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  })[0];
}

/**
 * One active plant, or the most recently updated active plant among several.
 * No eligible plant → Dashboard, and Quick Log stays closed.
 */
export function resolveReturningQuickLogStartTarget(
  plants: readonly QuickLogStartPlant[] | null | undefined,
): QuickLogStartTarget {
  const eligible = eligibleQuickLogStartPlants(plants);
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
  return {
    route: plantDetailQuickLogHref(plant.id),
    plantId: plant.id,
    tentId: plant.tent_id ?? null,
    growId: plant.grow_id ?? null,
    opensQuickLog: true,
  };
}

export function resolveReturningSignInRoute(input: {
  explicitRedirect?: string | null;
  savedChoice: StartScreenChoice | null;
  plants?: readonly QuickLogStartPlant[] | null;
}): string {
  if (input.explicitRedirect) return input.explicitRedirect;
  if (!input.savedChoice) return "/onboarding";
  if (input.savedChoice !== "quickLog") return routeForStartScreen(input.savedChoice);
  return resolveReturningQuickLogStartTarget(input.plants).route;
}
