import {
  EMPTY_QUICKLOG_V2_FORM,
  type QuickLogV2Action,
  type QuickLogV2FormState,
} from "@/lib/quickLogV2Rules";

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

/**
 * A stored draft is restored only into the target it was typed for. Target
 * selection stays explicit or route-derived: a draft never picks a target.
 */
export function restorableQuickLogObservationDraft(
  stored: QuickLogObservationDraft | null,
  defaultTargetKey: string | null | undefined,
): QuickLogObservationDraft | null {
  if (!stored || isQuickLogObservationDraftEmpty(stored.form)) return null;
  return stored.form.selectedKey === (defaultTargetKey ?? null) ? stored : null;
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
  return {
    saveFailed,
    idempotencyKey,
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
