import {
  DEFAULT_START_YOUR_ROOM_FORM,
  EMPTY_START_YOUR_ROOM_IDS,
  START_YOUR_ROOM_STEPS,
  type StartYourRoomForm,
  type StartYourRoomIds,
  type StartYourRoomStep,
} from "@/lib/startYourRoomRules";
import { isUuid } from "@/lib/isUuid";

export const START_YOUR_ROOM_DRAFT_FORM_ID = "start-your-room";

export const START_YOUR_ROOM_SAVE_RETRY_COPY =
  "Verdant could not save this step. Your typing is still here. Retry saves this same step once.";

export interface StartYourRoomPendingRowIds {
  grow: string | null;
  tent: string | null;
  plant: string | null;
}

export interface StartYourRoomDraft {
  step: Exclude<StartYourRoomStep, "done">;
  form: StartYourRoomForm;
  ids: StartYourRoomIds;
  pendingRowIds: StartYourRoomPendingRowIds;
  saveError: string | null;
}

export const EMPTY_START_YOUR_ROOM_PENDING_ROW_IDS: StartYourRoomPendingRowIds = {
  grow: null,
  tent: null,
  plant: null,
};

function isStep(value: unknown): value is Exclude<StartYourRoomStep, "done"> {
  return value === "grow" || value === "tent" || value === "plant";
}

function readName(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.slice(0, 80) : fallback;
}

function readId(value: unknown): string | null {
  return typeof value === "string" && isUuid(value) ? value.toLowerCase() : null;
}

export function parseStartYourRoomDraft(value: unknown): StartYourRoomDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!isStep(record.step)) return null;
  if (!START_YOUR_ROOM_STEPS.includes(record.step)) return null;
  const formRecord =
    record.form && typeof record.form === "object" && !Array.isArray(record.form)
      ? (record.form as Record<string, unknown>)
      : null;
  const idsRecord =
    record.ids && typeof record.ids === "object" && !Array.isArray(record.ids)
      ? (record.ids as Record<string, unknown>)
      : null;
  const pendingRecord =
    record.pendingRowIds &&
    typeof record.pendingRowIds === "object" &&
    !Array.isArray(record.pendingRowIds)
      ? (record.pendingRowIds as Record<string, unknown>)
      : null;
  if (!formRecord || !idsRecord || !pendingRecord) return null;
  return {
    step: record.step,
    form: {
      growName: readName(formRecord.growName, DEFAULT_START_YOUR_ROOM_FORM.growName),
      tentName: readName(formRecord.tentName, DEFAULT_START_YOUR_ROOM_FORM.tentName),
      plantName: readName(formRecord.plantName, DEFAULT_START_YOUR_ROOM_FORM.plantName),
      plantStage: readName(formRecord.plantStage, DEFAULT_START_YOUR_ROOM_FORM.plantStage),
    },
    ids: {
      growId: readId(idsRecord.growId) ?? EMPTY_START_YOUR_ROOM_IDS.growId,
      tentId: readId(idsRecord.tentId) ?? EMPTY_START_YOUR_ROOM_IDS.tentId,
      plantId: readId(idsRecord.plantId) ?? EMPTY_START_YOUR_ROOM_IDS.plantId,
    },
    pendingRowIds: {
      grow: readId(pendingRecord.grow),
      tent: readId(pendingRecord.tent),
      plant: readId(pendingRecord.plant),
    },
    saveError: typeof record.saveError === "string" ? record.saveError.slice(0, 280) : null,
  };
}

/** Confirmed names come back from the room record. The draft keeps unsent typing. */
export function startYourRoomDraftForm(
  form: StartYourRoomForm,
  ids: StartYourRoomIds,
): StartYourRoomForm {
  return {
    ...form,
    growName: ids.growId ? "" : form.growName,
    tentName: ids.tentId ? "" : form.tentName,
    plantName: ids.plantId ? "" : form.plantName,
  };
}

export function plainStartRoomSaveError(entity: "grow" | "tent" | "plant"): string {
  return `Verdant could not save this ${entity}. Your typing is still here. Retry saves this same ${entity} once.`;
}
