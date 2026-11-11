import {
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2Action,
  type QuickLogV2FormState,
} from "@/lib/quickLogV2Rules";
import {
  EMPTY_STRUCTURED_READING_INPUT,
  type StructuredReadingTextInput,
} from "@/lib/quickLogStructuredReadingRules";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import {
  EMPTY_FEEDING_PRODUCT_ROW,
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_FORM_PRODUCT_CAP,
  isFeedingFormPristine,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import { WATER_ENTRY_UNITS, type WaterEntryUnit } from "@/lib/quickLogWaterVolumeUnitRules";
import {
  ROOT_ZONE_DRAINAGE_OBSERVATIONS,
  ROOT_ZONE_MEDIUM_SURFACES,
  ROOT_ZONE_POT_WEIGHT_FEELS,
} from "@/lib/rootZoneManualObservationRules";
import {
  RESPONSE_CHECK_STATUSES,
  removeChipAuthoredResponseLine,
  type ResponseCheckStatus,
} from "@/lib/tenSecondQuickCheckRules";

export const QUICK_LOG_OBSERVATION_DRAFT_FORM_ID = "quick-log-v2-observation";

const ACTIONS: readonly QuickLogV2Action[] = ["water", "feed", "note"];

function isAction(value: unknown): value is QuickLogV2Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface QuickLogObservationDraft {
  form: QuickLogV2FormState;
  saveFailed: boolean;
  /** Same logical save across a remount. Server accepts 8..200 characters. */
  idempotencyKey: string | null;
  /** Unit the manual temperature was typed in, so a preference change cannot relabel it. */
  tempEntryUnit: TemperatureUnitPreference | null;
  /** Status whose response line a chip wrote, so a retarget can still remove it. */
  chipStatus: ResponseCheckStatus | null;
  /** Note structured readings as typed (grower bug item 14). Absent in older drafts. */
  structured?: StructuredReadingTextInput;
  /** Unit the soil temperature was typed in, so a preference change cannot reinterpret it. */
  soilTempEntryUnit?: TemperatureUnitPreference | null;
  /** Water details as typed, only while Water is the action. Absent in older drafts. */
  watering?: QuickLogWateringFormState;
  /** Unit the water temperature was typed in. */
  wateringTempEntryUnit?: TemperatureUnitPreference | null;
  /** Feed recipe and readings as typed, only while Feed is the action. Absent in older drafts. */
  feeding?: QuickLogFeedingFormState;
  /** Unit the feed water temperature was typed in. */
  feedingTempEntryUnit?: TemperatureUnitPreference | null;
}

const WATERING_TEXT_FIELDS = [
  "volumeMl",
  "ph",
  "ec",
  "ppm",
  "runoffMl",
  "runoffPh",
  "runoffEc",
  "runoffPpm",
  "waterTempC",
] as const;

const FEEDING_TEXT_FIELDS = [
  "lineId",
  "volumeMl",
  "ph",
  "ecIn",
  "ppmIn",
  "ecOut",
  "ppmOut",
  "runoffMl",
  "runoffPh",
  "runoffEc",
  "runoffPpm",
  "waterTempC",
] as const;

function readChoice<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readWatering(value: unknown): QuickLogWateringFormState | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const out: QuickLogWateringFormState = { ...EMPTY_QUICKLOG_WATERING_FORM };
  for (const key of WATERING_TEXT_FIELDS) out[key] = readText(record[key]);
  out.potWeightFeel = readChoice(record.potWeightFeel, ROOT_ZONE_POT_WEIGHT_FEELS);
  out.mediumSurface = readChoice(record.mediumSurface, ROOT_ZONE_MEDIUM_SURFACES);
  out.drainage = readChoice(record.drainage, ROOT_ZONE_DRAINAGE_OBSERVATIONS);
  const unit = readChoice<WaterEntryUnit>(record.volumeEntryUnit, WATER_ENTRY_UNITS);
  if (unit) out.volumeEntryUnit = unit;
  if (typeof record.volumeEntryText === "string") out.volumeEntryText = record.volumeEntryText;
  if (typeof record.runoffEntryText === "string") out.runoffEntryText = record.runoffEntryText;
  return out;
}

function readFeeding(value: unknown): QuickLogFeedingFormState | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const out: QuickLogFeedingFormState = {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    // The note travels in form.note; the sheet hands it to the Feed field.
    note: "",
  };
  for (const key of FEEDING_TEXT_FIELDS) out[key] = readText(record[key]);
  const products = (Array.isArray(record.products) ? record.products : [])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
    .slice(0, FEEDING_FORM_PRODUCT_CAP)
    .map((row) => ({
      name: readText(row.name),
      amount: readText(row.amount),
      unit: readText(row.unit) || EMPTY_FEEDING_PRODUCT_ROW.unit,
    }));
  out.products = products.length > 0 ? products : [{ ...EMPTY_FEEDING_PRODUCT_ROW }];
  return out;
}

function isWateringFormEmpty(form: QuickLogWateringFormState): boolean {
  return (
    WATERING_TEXT_FIELDS.every((key) => form[key].trim() === "") &&
    form.potWeightFeel === "" &&
    form.mediumSurface === "" &&
    form.drainage === ""
  );
}

/**
 * The Water details worth keeping in a draft, or null. A volume that only the
 * last-watering prefill wrote is not the grower's entry: on its own it must not
 * create a draft, or every reopen would claim to restore one.
 */
export function quickLogWateringDraftFields(
  form: QuickLogWateringFormState,
  prefilledVolumeMl: string | null,
): QuickLogWateringFormState | null {
  if (isWateringFormEmpty(form)) return null;
  const onlyPrefill =
    prefilledVolumeMl !== null &&
    form.volumeMl === prefilledVolumeMl &&
    form.volumeEntryText === undefined &&
    isWateringFormEmpty({ ...form, volumeMl: "" });
  return onlyPrefill ? null : form;
}

function feedingRecipeAndReadingsEqual(
  a: QuickLogFeedingFormState,
  b: QuickLogFeedingFormState,
): boolean {
  return (
    FEEDING_TEXT_FIELDS.every((key) => a[key] === b[key]) &&
    a.products.length === b.products.length &&
    a.products.every((row, index) => {
      const other = b.products[index];
      return row.name === other.name && row.amount === other.amount && row.unit === other.unit;
    })
  );
}

/**
 * The Feed recipe and readings worth keeping in a draft, or null. The note is
 * left out (it travels in form.note). A form that still equals the last-used
 * defaults the sheet applied is not the grower's entry.
 */
export function quickLogFeedingDraftFields(
  form: QuickLogFeedingFormState,
  appliedDefaults: QuickLogFeedingFormState | null,
): QuickLogFeedingFormState | null {
  const withoutNote = { ...form, note: "" };
  if (isFeedingFormPristine(withoutNote)) return null;
  if (appliedDefaults && feedingRecipeAndReadingsEqual(withoutNote, appliedDefaults)) return null;
  return withoutNote;
}

function readTemperatureUnit(value: unknown): TemperatureUnitPreference | null {
  return value === "celsius" || value === "fahrenheit" ? value : null;
}

function readStructured(value: unknown): StructuredReadingTextInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_STRUCTURED_READING_INPUT;
  }
  const record = value as Record<string, unknown>;
  const out = { ...EMPTY_STRUCTURED_READING_INPUT };
  for (const key of Object.keys(out) as (keyof StructuredReadingTextInput)[]) {
    out[key] = readText(record[key]);
  }
  return out;
}

/** True when no structured reading has any typed text. */
export function isStructuredReadingInputEmpty(
  structured: StructuredReadingTextInput | null | undefined,
): boolean {
  if (!structured) return true;
  return Object.values(structured).every((value) => value.trim().length === 0);
}

export function readQuickLogObservationIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 200) return null;
  return key;
}

export const QUICK_LOG_OBSERVATION_SAVE_ERROR =
  "Verdant could not save this observation. Your note is still here. Retry saves it once.";

export const QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY =
  "Restored your unsaved entry for this target.";

export const QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY =
  "Restored your unsaved entry. Choose a plant or tent before you save.";

/**
 * A stored draft is restored into the target it was typed for. When the sheet
 * opens with no target, the words come back but the target does not: target
 * selection stays explicit or route-derived, so a draft never picks one. The
 * failed flag and its key belonged to the old target's save and stay behind;
 * only definitive rejections are stored, so nothing committed under that key.
 */
export function restorableQuickLogObservationDraft(
  stored: QuickLogObservationDraft | null,
  defaultTargetKey: string | null | undefined,
): QuickLogObservationDraft | null {
  if (!stored || isQuickLogObservationDraftEmpty(stored.form, stored.structured, stored))
    return null;
  const target = defaultTargetKey || null;
  if (stored.form.selectedKey === target) return stored;
  if (target !== null) return null;
  // The chip's response line belonged to the old plant; it does not follow the
  // words into a target the grower has not picked yet.
  const note = stored.chipStatus
    ? removeChipAuthoredResponseLine(stored.form.note, stored.chipStatus)
    : stored.form.note;
  const form = { ...stored.form, selectedKey: null, note };
  if (isQuickLogObservationDraftEmpty(form, stored.structured, stored)) return null;
  return { ...stored, form, saveFailed: false, idempotencyKey: null, chipStatus: null };
}

/**
 * There is one draft slot. Water or Feed details on their own never take it
 * from an unsaved entry typed for a different target: that entry may hold a
 * failed save and its key, and it must still be there when its target reopens.
 */
export function quickLogDraftSlotHeldByOtherTarget(
  stored: QuickLogObservationDraft | null,
  selectedKey: string | null,
): boolean {
  return stored !== null && stored.form.selectedKey !== selectedKey;
}

export function quickLogObservationDraftRestoredCopy(restored: QuickLogObservationDraft): string {
  return restored.form.selectedKey
    ? QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY
    : QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY;
}

export function parseQuickLogObservationDraft(value: unknown): QuickLogObservationDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const wrapper = value as Record<string, unknown>;
  const record =
    wrapper.form && typeof wrapper.form === "object" && !Array.isArray(wrapper.form)
      ? (wrapper.form as Record<string, unknown>)
      : wrapper;
  const saveFailed = wrapper.saveFailed === true;
  const idempotencyKey = readQuickLogObservationIdempotencyKey(wrapper.idempotencyKey);
  if (!isAction(record.action)) return null;
  const selectedKey = readText(record.selectedKey).trim();
  const tempEntryUnit = readTemperatureUnit(wrapper.tempEntryUnit);
  const structured = readStructured(wrapper.structured);
  const soilTempEntryUnit = structured.soilTemp.trim()
    ? readTemperatureUnit(wrapper.soilTempEntryUnit)
    : null;
  // Details belong to their own action; a stray block for another action is dropped.
  const watering = record.action === "water" ? readWatering(wrapper.watering) : undefined;
  const feeding = record.action === "feed" ? readFeeding(wrapper.feeding) : undefined;
  const chipStatus = (RESPONSE_CHECK_STATUSES as readonly unknown[]).includes(wrapper.chipStatus)
    ? (wrapper.chipStatus as ResponseCheckStatus)
    : null;
  return {
    saveFailed,
    idempotencyKey,
    tempEntryUnit,
    chipStatus,
    structured,
    soilTempEntryUnit,
    ...(watering
      ? { watering, wateringTempEntryUnit: readTemperatureUnit(wrapper.wateringTempEntryUnit) }
      : {}),
    ...(feeding
      ? { feeding, feedingTempEntryUnit: readTemperatureUnit(wrapper.feedingTempEntryUnit) }
      : {}),
    form: {
      selectedKey: selectedKey.length > 0 ? selectedKey : null,
      action: record.action,
      volumeMl: readText(record.volumeMl),
      note: readText(record.note),
      temperatureC: readText(record.temperatureC),
      humidityPct: readText(record.humidityPct),
      vpdKpa: readText(record.vpdKpa),
    },
  };
}

export function isQuickLogObservationDraftEmpty(
  form: QuickLogV2FormState | null | undefined,
  structured?: StructuredReadingTextInput | null,
  /** Water or Feed details already filtered by the draft-field helpers above. */
  details?: {
    watering?: QuickLogWateringFormState | null;
    feeding?: QuickLogFeedingFormState | null;
  } | null,
): boolean {
  if (!form) return true;
  return (
    !details?.watering &&
    !details?.feeding &&
    isStructuredReadingInputEmpty(structured) &&
    form.note.trim().length === 0 &&
    form.volumeMl.trim().length === 0 &&
    form.temperatureC.trim().length === 0 &&
    form.humidityPct.trim().length === 0 &&
    form.vpdKpa.trim().length === 0
  );
}

export function quickLogObservationDraftOrEmpty(
  form: QuickLogV2FormState | null,
  fallback: QuickLogV2FormState = EMPTY_QUICKLOG_V2_FORM,
): QuickLogV2FormState {
  if (!form || isQuickLogObservationDraftEmpty(form)) return fallback;
  return form;
}
