/**
 * diaryEntryRemovalRules — pure helpers and copy constants for the
 * single-entry diary/photo log removal slice.
 *
 * Pure, deterministic, null-safe. No React, no Supabase, no AI.
 *
 * Removal scope (single entry only):
 *   - A diary_entries row owned by the current user.
 *   - May or may not have a photo_url.
 *
 * Out of scope (must never be removable through this path):
 *   - sensor_readings rows (raw telemetry / imported CSV).
 *   - tent-level sensor snapshots.
 *   - Bulk delete of any kind.
 *   - Customer/public/read-only report views.
 */

// ---------------------------------------------------------------------------
// Copy constants — required wording from the task spec.
// ---------------------------------------------------------------------------

export const REMOVE_LOG_BUTTON_LABEL = "Remove log";
export const REMOVE_PHOTO_LOG_BUTTON_LABEL = "Remove photo log";

export const REMOVE_LOG_DIALOG_TITLE = "Remove this log?";
export const REMOVE_LOG_DIALOG_BODY =
  "This removes the log from this plant's timeline. Use this only when it was added to the wrong plant or strain.";
export const REMOVE_PHOTO_LOG_DIALOG_EXTRA =
  "The photo log will no longer appear in this plant's timeline.";

export const REMOVE_LOG_DIALOG_CANCEL = "Cancel";
export const REMOVE_LOG_DIALOG_CONFIRM = "Remove log";

export const REMOVE_LOG_SUCCESS_TOAST = "Log removed.";
export const REMOVE_PHOTO_LOG_SUCCESS_TOAST = "Photo log removed.";
export const REMOVE_LOG_ERROR_TOAST =
  "Couldn't remove this log. Please try again.";

export const REMOVE_LOG_FOLLOWUP_HINT =
  "Add a new Quick Log to the correct plant when ready.";

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export interface DiaryEntryRemovalCandidate {
  /** diary_entries.id */
  id: string | null | undefined;
  /** diary_entries.user_id */
  ownerUserId?: string | null;
  /** diary_entries.photo_url */
  photoUrl?: string | null;
  /**
   * Source kind. Diary entries are always eligible. Raw sensor readings
   * or imported telemetry rows are NOT diary entries and must be rejected
   * by callers via this flag.
   */
  kind?: "diary" | "sensor_reading" | "imported_telemetry" | string | null;
}

export interface DiaryEntryRemovalViewerContext {
  currentUserId: string | null | undefined;
  /** True for customer/public/read-only report views. */
  isCustomerOrPublicMode?: boolean;
  /** True for export / report-only renderers. */
  isReadOnlyReportView?: boolean;
}

/**
 * Pure eligibility check. Returns true ONLY for diary entries the current
 * authenticated viewer owns, in an editable (non-customer, non-report)
 * surface. Sensor readings and imported telemetry are always rejected.
 */
export function canRemoveDiaryEntry(
  entry: DiaryEntryRemovalCandidate | null | undefined,
  viewer: DiaryEntryRemovalViewerContext,
): boolean {
  if (!entry || typeof entry.id !== "string" || entry.id.length === 0) {
    return false;
  }
  if (viewer.isCustomerOrPublicMode === true) return false;
  if (viewer.isReadOnlyReportView === true) return false;
  if (!viewer.currentUserId) return false;
  if (entry.kind && entry.kind !== "diary") return false;
  if (entry.ownerUserId && entry.ownerUserId !== viewer.currentUserId) {
    return false;
  }
  return true;
}

/**
 * Whether the entry is a photo log (drives wording variants).
 * A diary entry is treated as a "photo log" when it has a non-empty
 * photo_url. Trim guards against whitespace-only strings.
 */
export function isPhotoLogEntry(
  entry: Pick<DiaryEntryRemovalCandidate, "photoUrl"> | null | undefined,
): boolean {
  if (!entry) return false;
  const u = typeof entry.photoUrl === "string" ? entry.photoUrl.trim() : "";
  return u.length > 0;
}

export function getRemoveButtonLabel(isPhoto: boolean): string {
  return isPhoto ? REMOVE_PHOTO_LOG_BUTTON_LABEL : REMOVE_LOG_BUTTON_LABEL;
}

export function getRemoveSuccessToast(isPhoto: boolean): string {
  return isPhoto ? REMOVE_PHOTO_LOG_SUCCESS_TOAST : REMOVE_LOG_SUCCESS_TOAST;
}

/**
 * Accessible aria-label for the per-entry remove control.
 * Falls back gracefully when plant name is missing.
 */
export function getRemoveButtonAriaLabel(
  isPhoto: boolean,
  plantName?: string | null,
): string {
  const base = isPhoto ? "Remove photo log" : "Remove log";
  const name = typeof plantName === "string" ? plantName.trim() : "";
  return name.length > 0 ? `${base} for ${name}` : base;
}
