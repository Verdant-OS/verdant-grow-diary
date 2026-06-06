/**
 * QuickLog photo support gate rules — pure, no I/O, deterministic.
 *
 * Used by both PlantQuickLog and QuickLogV2Sheet to decide whether photo
 * saving (upload + diary insert) is available, and what message to show
 * when it is not.
 *
 * Future: once photo saving is enabled, this helper can expand to include
 * picker configuration without changing component call sites.
 */

export interface QuickLogPhotoGateState {
  /** Whether the current build/context supports photo saving. */
  supported: boolean;
  /** Machine-readable reason when not supported. */
  reason: string;
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
}

export function isQuickLogPhotoSavingSupported(): boolean {
  // Photo persistence not enabled in Gate 1 (out of atomic-RPC scope).
  // When this flips to true, update the gate state copy below as well.
  return false;
}

export function buildQuickLogPhotoGateState(): QuickLogPhotoGateState {
  const supported = isQuickLogPhotoSavingSupported();
  if (supported) {
    return {
      supported: true,
      reason: "enabled",
      disabledTitle: "",
      disabledCopy: "",
      ariaLabel: "Photo saving is available",
      helperText: "",
      futureActionLabel: "Add photo",
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
  };
}
