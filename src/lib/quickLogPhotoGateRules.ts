/**
 * QuickLog photo support gate rules — pure, no I/O, deterministic.
 *
 * Single source of truth for:
 *   - Whether photo saving is enabled in the current build/context.
 *   - The disabled-state copy/aria/helper text rendered by older gated states.
 *   - The active picker labels reused by PlantQuickLog and QuickLogV2Sheet so
 *     the two surfaces don't drift on visible copy.
 *
 * No JSX, no I/O — used by tests + components.
 */

export interface QuickLogPhotoGateState {
  /** Whether the current build/context supports photo saving in this sheet. */
  supported: boolean;
  /** Machine-readable reason when not supported. */
  reason: string;

  // Disabled-state UI.
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

  // Active picker UI.
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
  return true;
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
