import {
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2Action,
  type QuickLogV2FormState,
} from "@/lib/quickLogV2Rules";
import type { TemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
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
  if (!stored || isQuickLogObservationDraftEmpty(stored.form)) return null;
  const target = defaultTargetKey || null;
  if (stored.form.selectedKey === target) return stored;
  if (target !== null) return null;
  // The chip's response line belonged to the old plant; it does not follow the
  // words into a target the grower has not picked yet.
  const note = stored.chipStatus
    ? removeChipAuthoredResponseLine(stored.form.note, stored.chipStatus)
    : stored.form.note;
  const form = { ...stored.form, selectedKey: null, note };
  if (isQuickLogObservationDraftEmpty(form)) return null;
  return { ...stored, form, saveFailed: false, idempotencyKey: null, chipStatus: null };
}

export function quickLogObservationDraftRestoredCopy(restored: QuickLogObservationDraft): string {
  return restored.form.selectedKey
    ? QUICK_LOG_OBSERVATION_DRAFT_RESTORED_COPY
    : QUICK_LOG_OBSERVATION_DRAFT_RESTORED_NO_TARGET_COPY;
}

/**
 * The sheet is showing another target's words without adopting that target.
 * The stored draft still belongs to the original plant or tent until the
 * grower edits this view.
 */
export function quickLogObservationDraftDetachedFromStoredTarget(
  stored: QuickLogObservationDraft | null,
  restored: QuickLogObservationDraft | null,
): boolean {
  if (!stored || !restored) return false;
  const storedKey = stored.form.selectedKey;
  return typeof storedKey === "string" && storedKey.length > 0 && restored.form.selectedKey == null;
}

export function quickLogObservationFormMatches(
  current: QuickLogV2FormState,
  snapshot: QuickLogV2FormState,
): boolean {
  return (
    current.selectedKey === snapshot.selectedKey &&
    current.action === snapshot.action &&
    current.note === snapshot.note &&
    current.volumeMl === snapshot.volumeMl &&
    current.temperatureC === snapshot.temperatureC &&
    current.humidityPct === snapshot.humidityPct &&
    current.vpdKpa === snapshot.vpdKpa
  );
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
  const tempEntryUnit =
    wrapper.tempEntryUnit === "celsius" || wrapper.tempEntryUnit === "fahrenheit"
      ? wrapper.tempEntryUnit
      : null;
  const chipStatus = (RESPONSE_CHECK_STATUSES as readonly unknown[]).includes(wrapper.chipStatus)
    ? (wrapper.chipStatus as ResponseCheckStatus)
    : null;
  return {
    saveFailed,
    idempotencyKey,
    tempEntryUnit,
    chipStatus,
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
): boolean {
  if (!form) return true;
  return (
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
