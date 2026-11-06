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
import { RESPONSE_CHECK_STATUSES, type ResponseCheckStatus } from "@/lib/tenSecondQuickCheckRules";

export const QUICK_LOG_OBSERVATION_DRAFT_FORM_ID = "quick-log-v2-observation";

/** Session-storage id for one plant, one tent, or an entry that has no target yet. */
export function quickLogObservationDraftStorageId(targetKey: string | null | undefined): string {
  const target = normalizeQuickLogObservationDraftTarget(targetKey);
  return target
    ? `${QUICK_LOG_OBSERVATION_DRAFT_FORM_ID}.target.${target}`
    : `${QUICK_LOG_OBSERVATION_DRAFT_FORM_ID}.target.none`;
}

/** A plant or tent key. Anything else is "no target". */
export function normalizeQuickLogObservationDraftTarget(
  targetKey: string | null | undefined,
): string | null {
  if (typeof targetKey !== "string") return null;
  const trimmed = targetKey.trim();
  if (!/^(plant|tent):[^\s]+$/.test(trimmed) || trimmed.length > 200) return null;
  return trimmed;
}

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

/** Cancel, Back, and refresh ask this while the open entry is not empty. */
export const QUICK_LOG_OBSERVATION_DRAFT_LEAVE_WARNING =
  "This Quick Log note is not saved yet. It stays with this plant or tent if you leave, and it is not written to the timeline.";

/**
 * Which stored draft the sheet may show. Only an exact target match restores.
 * A draft written for one plant or tent stays there when the sheet opens for
 * another, or with no target at all. An entry that has no target yet restores
 * only when the sheet also has none. An empty draft restores nothing.
 */
export function restorableQuickLogObservationDraft(
  stored: QuickLogObservationDraft | null,
  defaultTargetKey: string | null | undefined,
): QuickLogObservationDraft | null {
  if (!stored || isQuickLogObservationDraftEmpty(stored.form, stored.structured)) return null;
  const openTarget = normalizeQuickLogObservationDraftTarget(defaultTargetKey);
  const storedTarget = normalizeQuickLogObservationDraftTarget(stored.form.selectedKey);
  if (storedTarget !== openTarget) return null;
  return stored;
}

/**
 * Leaving or cancelling an open Quick Log asks first when the entry still has
 * something to keep. An empty form does not ask.
 */
export function shouldWarnBeforeLeavingQuickLogObservation(
  form: QuickLogV2FormState,
  structured: StructuredReadingTextInput | null | undefined,
): boolean {
  return !isQuickLogObservationDraftEmpty(form, structured);
}

/**
 * A note typed before any plant or tent was chosen may move onto the first
 * target the grower picks, when that target has no draft of its own. A note
 * that already belongs to a target never moves onto a different one.
 */
export function quickLogObservationDraftTargetMove(input: {
  fromTarget: string | null;
  toTarget: string | null;
  fromEmpty: boolean;
  toEmpty: boolean;
}): "move-onto-target" | "stay" {
  const from = normalizeQuickLogObservationDraftTarget(input.fromTarget);
  const to = normalizeQuickLogObservationDraftTarget(input.toTarget);
  if (from === null && to !== null && !input.fromEmpty && input.toEmpty) return "move-onto-target";
  return "stay";
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
): boolean {
  if (!form) return true;
  return (
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
