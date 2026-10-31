/**
 * Disabled-reason and helper copy for the New grow, New tent, and New plant
 * dialogs.
 *
 * The primary button stays disabled until the fields that actually gate the
 * write are valid. The visible reason is that button's accessible description.
 * Helper copy names the same requirement, so a plan limit or a missing tent
 * is not described as "only a name."
 *
 * Pure: no React, no I/O, no clock.
 */
import { hasTrimmedRequiredIdentity } from "@/lib/formIdentityFailClosedRules";

export const CREATE_DIALOG_NAME_LABEL = "Name" as const;

export const CREATE_GROW_NAME_HELPER = "Only a name is required to get started." as const;
export const CREATE_GROW_NAME_REASON = "Enter a grow name." as const;
export const CREATE_GROW_SAVING_REASON = "Saving this grow." as const;
export const CREATE_GROW_UNKNOWN_REASON =
  "Refresh this page before creating another grow." as const;

export const CREATE_TENT_NAME_HELPER = "Only a name is required to get started." as const;
export const CREATE_TENT_NAME_REASON = "Enter a tent name." as const;
export const CREATE_TENT_SAVING_REASON = "Saving this tent." as const;
export const CREATE_TENT_UNKNOWN_REASON =
  "Refresh this page before creating another tent." as const;
export const CREATE_TENT_GROW_REASON = "Choose a grow before creating a tent." as const;
export const CREATE_TENT_GATE_FALLBACK_REASON =
  "Creating a tent is not available on this plan." as const;

export const CREATE_PLANT_NAME_HELPER =
  "Only a name is required to get started. Stage starts as seedling." as const;
export const CREATE_PLANT_TENT_HELPER =
  "A name and a tent in this grow are required. Stage starts as seedling." as const;
export const CREATE_PLANT_NAME_REASON = "Enter a plant name." as const;
export const CREATE_PLANT_SAVING_REASON = "Saving this plant." as const;
export const CREATE_PLANT_UNKNOWN_REASON =
  "Refresh this page before creating another plant." as const;
export const CREATE_PLANT_SETUP_REASON = "Choose a grow before creating a plant." as const;
export const CREATE_PLANT_TENT_REASON = "Choose a tent in this grow." as const;

export const PLANT_NO_TENTS_OPTIONAL_HINT =
  "No tents yet. A tent is optional — a name is enough to create this plant." as const;
export const PLANT_NO_TENTS_REQUIRED_HINT = "No tents yet. Create a tent first." as const;

export interface CreateDialogPrimaryButtonState {
  readonly disabled: boolean;
  /** Visible inline reason. Null when the button is enabled. */
  readonly reason: string | null;
  /** Helper under the name field. Matches the requirement that actually gates the button. */
  readonly helperText: string;
}

function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function plantCreateNoTentsHintCopy(tentRequired: boolean): string {
  return tentRequired ? PLANT_NO_TENTS_REQUIRED_HINT : PLANT_NO_TENTS_OPTIONAL_HINT;
}

export function describeCreateGrowPrimaryButton(input: {
  busy: boolean;
  outcomeUnknown: boolean;
  name: unknown;
}): CreateDialogPrimaryButtonState {
  const nameMissing = !hasTrimmedRequiredIdentity(input.name);
  const disabled = Boolean(input.busy) || Boolean(input.outcomeUnknown) || nameMissing;
  let reason: string | null = null;
  if (disabled) {
    if (input.outcomeUnknown) reason = CREATE_GROW_UNKNOWN_REASON;
    else if (nameMissing) reason = CREATE_GROW_NAME_REASON;
    else reason = CREATE_GROW_SAVING_REASON;
  }
  return { disabled, reason, helperText: CREATE_GROW_NAME_HELPER };
}

/**
 * Equivalent to CreateTentDialog's pinned disabled expression:
 * busy || outcomeUnknown || !gateAllowed || formBlocked || blank name.
 */
export function describeCreateTentPrimaryButton(input: {
  busy: boolean;
  outcomeUnknown: boolean;
  gateAllowed: boolean;
  gateBlockedCopy?: string | null;
  formBlocked: boolean;
  formBlockedDetail?: string | null;
  name: unknown;
}): CreateDialogPrimaryButtonState {
  const nameMissing = !hasTrimmedRequiredIdentity(input.name);
  const gateAllowed = input.gateAllowed !== false;
  const disabled =
    Boolean(input.busy) ||
    Boolean(input.outcomeUnknown) ||
    !gateAllowed ||
    Boolean(input.formBlocked) ||
    nameMissing;

  let reason: string | null = null;
  if (disabled) {
    if (input.outcomeUnknown) reason = CREATE_TENT_UNKNOWN_REASON;
    else if (!gateAllowed) {
      reason = textOrNull(input.gateBlockedCopy) ?? CREATE_TENT_GATE_FALLBACK_REASON;
    } else if (input.formBlocked) {
      reason = textOrNull(input.formBlockedDetail) ?? CREATE_TENT_GROW_REASON;
    } else if (nameMissing) reason = CREATE_TENT_NAME_REASON;
    else reason = CREATE_TENT_SAVING_REASON;
  }

  const helperText = gateAllowed
    ? CREATE_TENT_NAME_HELPER
    : (textOrNull(input.gateBlockedCopy) ?? CREATE_TENT_GATE_FALLBACK_REASON);

  return { disabled, reason, helperText };
}

/**
 * Equivalent to CreatePlantDialog's pinned disabled expression:
 * busy || formBlocked || !tentCompatible || blank name.
 * Outcome-unknown is a formBlocked cause; pass it so the reason names the refresh.
 */
export function describeCreatePlantPrimaryButton(input: {
  busy: boolean;
  outcomeUnknown: boolean;
  formBlocked: boolean;
  formBlockedDetail?: string | null;
  tentCompatible: boolean;
  tentRequired: boolean;
  tentBlockedDetail?: string | null;
  name: unknown;
}): CreateDialogPrimaryButtonState {
  const nameMissing = !hasTrimmedRequiredIdentity(input.name);
  const tentCompatible = input.tentCompatible !== false;
  const disabled =
    Boolean(input.busy) || Boolean(input.formBlocked) || !tentCompatible || nameMissing;

  let reason: string | null = null;
  if (disabled) {
    if (input.outcomeUnknown) reason = CREATE_PLANT_UNKNOWN_REASON;
    else if (input.formBlocked) {
      reason = textOrNull(input.formBlockedDetail) ?? CREATE_PLANT_SETUP_REASON;
    } else if (!tentCompatible) {
      reason = textOrNull(input.tentBlockedDetail) ?? CREATE_PLANT_TENT_REASON;
    } else if (nameMissing) reason = CREATE_PLANT_NAME_REASON;
    else reason = CREATE_PLANT_SAVING_REASON;
  }

  return {
    disabled,
    reason,
    helperText: input.tentRequired ? CREATE_PLANT_TENT_HELPER : CREATE_PLANT_NAME_HELPER,
  };
}
