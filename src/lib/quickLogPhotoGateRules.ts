/**
 * QuickLog photo support gate rules — pure, no I/O, deterministic.
 *
 * Single source of truth for:
 *   - Whether photo saving is enabled in the current build/context.
 *   - The disabled-state copy/aria/helper text rendered by QuickLogV2Sheet
 *     while photo saving is gated off.
 *   - The active picker labels reused by PlantQuickLog so the two surfaces
 *     don't drift on visible copy.
 *
 * No JSX, no I/O — used by tests + components.
 */

export interface QuickLogPhotoGateState {
  /** Whether the current build/context supports photo saving in this sheet. */
  supported: boolean;
  /** Machine-readable reason when not supported. */
  reason: string;

  // Disabled-state UI (QuickLogV2Sheet today).
  /** Short heading for the disabled/gated UI block. */
  disabledTitle: string;
  /** Human-readable explanation shown to the grower. */
  disabledCopy: string;
  /** Aria label for the gated region (screen-reader context). */
  ariaLabel: string;
  /** Helper text beneath the main copy. */
  helperText: string;
  /** Label for the future action once enabled (e.g. button text). */
  futureActionLabel: string;

  // Active picker UI (PlantQuickLog today; QuickLogV2Sheet once enabled).
  /** "Take Photo" button label. */
  takePhotoLabel: string;
  /** "Choose from Library" button label. */
  chooseLibraryLabel: string;
  /** Helper paragraph shown under the two picker buttons. */
  pickerHelperText: string;
  /** aria-label for the hidden camera-capture <input type="file">. */
  cameraInputAriaLabel: string;
  /** aria-label for the hidden library <input type="file">. */
  libraryInputAriaLabel: string;
}

export function isQuickLogPhotoSavingSupported(): boolean {
  // Photo persistence not enabled in QuickLogV2Sheet (out of atomic-RPC scope).
  // PlantQuickLog has its own working diary-photos upload path and does NOT
  // gate on this flag. When this flips to true, update the gate state copy
  // below as well.
  return false;
}

export function buildQuickLogPhotoGateState(): QuickLogPhotoGateState {
  const supported = isQuickLogPhotoSavingSupported();
  const activePickerLabels = {
    takePhotoLabel: "Take Photo",
    chooseLibraryLabel: "Choose from Library",
    pickerHelperText:
      "Add a new photo or pick one already on your phone. Optional.",
    cameraInputAriaLabel: "Take a new photo with your camera",
    libraryInputAriaLabel: "Choose a photo from your library",
  } as const;

  if (supported) {
    return {
      supported: true,
      reason: "enabled",
      disabledTitle: "",
      disabledCopy: "",
      ariaLabel: "Photo saving is available",
      helperText: "",
      futureActionLabel: "Add photo",
      ...activePickerLabels,
    };
  }

  return {
    supported: false,
    reason: "photo_saving_not_enabled",
    disabledTitle: "Photo saving is not enabled yet",
    disabledCopy:
      "Photo saving is not enabled yet. You'll be able to attach photos to logs in a future update.",
    ariaLabel: "Photo saving unavailable",
    helperText: "Photos you take now will not be stored to your diary yet.",
    futureActionLabel: "Add photo",
    ...activePickerLabels,
  };
}
