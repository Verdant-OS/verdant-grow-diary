import { createGrowIdsEqual } from "@/lib/createDialogGrowBindingRules";

/**
 * startYourRoomRules — pure step machine for the first-session
 * "Start your room" wizard.
 *
 * Goal: one guided path that creates grow → tent → plant with guaranteed
 * grow_id binding, then lands on Plant Detail for the first Quick Log.
 *
 * Pure: no React, no Supabase, no side effects. The page owns writes and
 * only submits when canProceed* is true. Payloads only include fields the
 * existing create dialogs already write (no schema expansion).
 */

export type StartYourRoomStep = "grow" | "tent" | "plant" | "done";

export interface StartYourRoomIds {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
}

export interface StartYourRoomForm {
  growName: string;
  tentName: string;
  plantName: string;
  plantStage: string;
}

export interface StartYourRoomState {
  step: StartYourRoomStep;
  form: StartYourRoomForm;
  ids: StartYourRoomIds;
}

export const START_YOUR_ROOM_STEPS: readonly StartYourRoomStep[] = [
  "grow",
  "tent",
  "plant",
  "done",
] as const;

export const START_YOUR_ROOM_COPY = {
  pageTitle: "Start your room",
  pageSubtitle:
    "One guided path: grow → tent → plant. Everything is linked so Quick Log works on the first try.",
  growTitle: "Name your grow",
  growHelp: "A grow is your current run or setup. You can archive it later.",
  tentTitle: "Name your tent",
  tentHelp: "Environment and sensors live on the tent. It will bind to this grow automatically.",
  plantTitle: "Name your first plant",
  plantHelp: "Plant memory starts here. This plant is bound to the grow and tent you just created.",
  doneTitle: "Your room is ready",
  doneHelp: "Open Plant Detail to log your first note. Grow context is already linked.",
  ctaGrow: "Create grow & continue",
  ctaTent: "Create tent & continue",
  ctaPlant: "Create plant & finish",
  ctaDone: "Open plant & Quick Log",
  skipToStartScreen: "Choose start screen instead",
} as const;

/** Plant stages the setup form offers; a restored draft must hold one of them. */
export const START_YOUR_ROOM_PLANT_STAGES = ["seedling", "veg", "flower"] as const;

export const DEFAULT_START_YOUR_ROOM_FORM: StartYourRoomForm = {
  growName: "",
  tentName: "",
  plantName: "",
  plantStage: "seedling",
};

export const EMPTY_START_YOUR_ROOM_IDS: StartYourRoomIds = {
  growId: null,
  tentId: null,
  plantId: null,
};

export function trimName(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidRoomName(value: string | null | undefined): boolean {
  const t = trimName(value);
  return t.length >= 1 && t.length <= 80;
}

export function canProceedGrow(form: StartYourRoomForm): boolean {
  return isValidRoomName(form.growName);
}

export function canProceedTent(form: StartYourRoomForm, ids: StartYourRoomIds): boolean {
  return isValidRoomName(form.tentName) && !!ids.growId;
}

export function canProceedPlant(form: StartYourRoomForm, ids: StartYourRoomIds): boolean {
  return isValidRoomName(form.plantName) && !!ids.growId && !!ids.tentId;
}

export function canFinish(ids: StartYourRoomIds): boolean {
  return !!ids.plantId && !!ids.growId;
}

/** Build grow insert fields (caller adds user_id). */
export function buildStartRoomGrowPayload(form: StartYourRoomForm): {
  name: string;
  grow_type: string;
  stage: string;
} | null {
  if (!canProceedGrow(form)) return null;
  return {
    name: trimName(form.growName),
    grow_type: "tent",
    stage: "seedling",
  };
}

/** Tent always carries grow_id from prior step — never unbound. */
export function buildStartRoomTentPayload(
  form: StartYourRoomForm,
  ids: StartYourRoomIds,
): { name: string; grow_id: string; stage: string } | null {
  if (!canProceedTent(form, ids) || !ids.growId) return null;
  return {
    name: trimName(form.tentName),
    grow_id: ids.growId,
    stage: "seedling",
  };
}

/** Plant always carries grow_id + tent_id from prior steps. */
export function buildStartRoomPlantPayload(
  form: StartYourRoomForm,
  ids: StartYourRoomIds,
): { name: string; grow_id: string; tent_id: string; stage: string } | null {
  if (!canProceedPlant(form, ids) || !ids.growId || !ids.tentId) return null;
  const stage = trimName(form.plantStage) || "seedling";
  return {
    name: trimName(form.plantName),
    grow_id: ids.growId,
    tent_id: ids.tentId,
    stage,
    // No health: a new plant is not assessed; the column default applies
    // (QA 2026-09-24, BUG-009).
  };
}

export function nextStepAfter(step: StartYourRoomStep): StartYourRoomStep {
  switch (step) {
    case "grow":
      return "tent";
    case "tent":
      return "plant";
    case "plant":
      return "done";
    case "done":
      return "done";
  }
}

export function stepIndex(step: StartYourRoomStep): number {
  return START_YOUR_ROOM_STEPS.indexOf(step);
}

export function progressLabel(step: StartYourRoomStep): string {
  const i = stepIndex(step);
  const total = START_YOUR_ROOM_STEPS.length - 1; // done is completion
  if (step === "done") return "Complete";
  return `Step ${i + 1} of ${total}`;
}

/** Plant Detail deep link that opens Quick Log once. */
export function plantDetailQuickLogHref(plantId: string): string {
  return `/plants/${encodeURIComponent(plantId)}?open=quick-log`;
}

export interface StartYourRoomResumeGrow {
  id: string;
  name?: string | null;
}

export interface StartYourRoomResumeTent {
  id: string;
  grow_id?: string | null;
  name?: string | null;
}

export interface StartYourRoomResumePlant {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  name?: string | null;
}

export interface StartYourRoomResumeInput {
  grows: readonly StartYourRoomResumeGrow[] | null | undefined;
  tents: readonly StartYourRoomResumeTent[] | null | undefined;
  plants: readonly StartYourRoomResumePlant[] | null | undefined;
  activeGrowId: string | null | undefined;
}

export interface StartYourRoomResume {
  step: "tent" | "plant" | "done";
  growId: string;
  growName: string;
  tentId: string | null;
  tentName: string;
  plantId: string | null;
  plantName: string;
}

/**
 * Reload opens the next missing step for the single active grow.
 * No tent → tent. One tent and no plant → plant. One tent and one plant → done.
 * Unread, empty, or ambiguous rooms return null so the wizard stays on grow.
 */
export function resolveStartYourRoomResume(
  input: StartYourRoomResumeInput,
): StartYourRoomResume | null {
  if (input.plants == null || input.grows == null || input.tents == null) return null;
  if (input.grows.length !== 1) return null;
  const grow = input.grows[0];
  if (!grow?.id) return null;
  if (input.activeGrowId != null && !createGrowIdsEqual(input.activeGrowId, grow.id)) {
    return null;
  }

  const growName = trimName(grow.name);
  const tents = input.tents.filter(
    (tent) => createGrowIdsEqual(tent.grow_id, grow.id) && !!tent.id,
  );
  if (tents.length === 0) {
    return {
      step: "tent",
      growId: grow.id,
      growName,
      tentId: null,
      tentName: "",
      plantId: null,
      plantName: "",
    };
  }
  if (tents.length !== 1) return null;
  const tent = tents[0];
  const tentName = trimName(tent.name);

  const plants = input.plants.filter(
    (plant) =>
      createGrowIdsEqual(plant.grow_id, grow.id) &&
      createGrowIdsEqual(plant.tent_id, tent.id) &&
      !!plant.id,
  );
  if (plants.length === 0) {
    return {
      step: "plant",
      growId: grow.id,
      growName,
      tentId: tent.id,
      tentName,
      plantId: null,
      plantName: "",
    };
  }
  if (plants.length !== 1) return null;

  return {
    step: "done",
    growId: grow.id,
    growName,
    tentId: tent.id,
    tentName,
    plantId: plants[0].id,
    plantName: trimName(plants[0].name),
  };
}

/**
 * Whether first-session should prefer Start your room over start-screen choice.
 * True when the account has zero grows (empty room).
 */
export function shouldPreferStartYourRoom(growCount: number): boolean {
  return (growCount ?? 0) <= 0;
}
