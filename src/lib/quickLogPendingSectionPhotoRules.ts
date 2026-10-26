/**
 * Quick Log dialog: the "All activity types" Photo editor owns its own
 * upload + diary write and its own Save button. The dialog's main
 * "Save log" button writes through a different path and never carries that
 * selected image. Saving the log while a photo is selected there would save
 * only the note and silently drop the photo, so the main save is blocked
 * with this message until the grower saves or clears the photo.
 *
 * Pure: no React, no Supabase, no clock.
 */
export const QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY =
  "Your selected photo is not included in Save log. Use the Photo section's Save button to save the photo, or clear the photo first." as const;

/** Returns the grower-visible block reason, or null when Save log may proceed. */
export function resolveQuickLogPendingSectionPhotoBlock(
  hasPendingSectionPhoto: boolean | null | undefined,
): string | null {
  return hasPendingSectionPhoto === true ? QUICK_LOG_PENDING_SECTION_PHOTO_BLOCKED_COPY : null;
}
