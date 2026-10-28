import { createGrowIdsEqual } from "@/lib/createDialogGrowBindingRules";

/**
 * startYourRoomRules — pure step machine for the first-session
 * "Start your room" wizard.
 *
 * Goal: one form and one submit that create grow → tent → plant with
 * guaranteed grow_id binding, then land on Plant Detail for the first Quick
 * Log. The step is derived from which ids already exist (firstMissingStep).
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
    "Name your first plant and you're ready to log. Verdant links it to a grow and tent so Quick Log works on the first try.",
  roomTitle: "Name your first plant",
  roomHelp:
    "Plant memory starts here. One tap creates the plant and the grow and tent it lives in.",
  optionalNamesSummary: "Name your grow and tent (optional)",
  optionalNamesHelp: "Leave these blank to use “My grow” and “Tent 1”. You can rename them later.",
  ctaRoom: "Create plant & open Quick Log",
  oneStepProgress: "One step",
  doneTitle: "Your room is ready",
  doneHelp: "Open Plant Detail to log your first note. Grow context is already linked.",
  ctaDone: "Open plant & Quick Log",
  skipToStartScreen: "Choose start screen instead",
} as const;

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

/** Names used when the grower leaves the optional grow or tent name blank. */
export const START_YOUR_ROOM_DEFAULT_GROW_NAME = "My grow";
export const START_YOUR_ROOM_DEFAULT_TENT_NAME = "Tent 1";

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

/**
 * The one-step form fills a blank grow or tent name with its default so the
 * existing payload builders (which require a name) can be reused unchanged.
 */
export function startRoomFormWithDefaults(form: StartYourRoomForm): StartYourRoomForm {
  return {
    ...form,
    growName: trimName(form.growName) ? form.growName : START_YOUR_ROOM_DEFAULT_GROW_NAME,
    tentName: trimName(form.tentName) ? form.tentName : START_YOUR_ROOM_DEFAULT_TENT_NAME,
  };
}

/** The first room item that still has to be created; "done" when all exist. */
export function firstMissingStep(ids: StartYourRoomIds): StartYourRoomStep {
  if (!ids.growId) return "grow";
  if (!ids.tentId) return "tent";
  if (!ids.plantId) return "plant";
  return "done";
}

/**
 * One submit is valid when the plant name is valid and any grow or tent name
 * the grower typed for an item still to be created fits the name rules.
 */
export function canSubmitRoom(form: StartYourRoomForm, ids: StartYourRoomIds): boolean {
  if (!isValidRoomName(form.plantName)) return false;
  const withDefaults = startRoomFormWithDefaults(form);
  if (!ids.growId && !isValidRoomName(withDefaults.growName)) return false;
  if (!ids.tentId && !isValidRoomName(withDefaults.tentName)) return false;
  return true;
}

/** Progress text for the one-step form. */
export function oneStepProgressLabel(step: StartYourRoomStep): string {
  return step === "done" ? "Complete" : START_YOUR_ROOM_COPY.oneStepProgress;
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
