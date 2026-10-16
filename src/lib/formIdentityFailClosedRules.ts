/**
 * Shared fail-closed check for grower identity fields (plant/tent Name).
 *
 * Empty and whitespace-only strings are not identities. Callers disable
 * primary Create/Save until this returns true; submit handlers still refuse
 * a blank write if the form is forced.
 *
 * Pure: no React, no I/O, no clock.
 */
export const TRIMMED_REQUIRED_IDENTITY_MESSAGE = "A name is required.";

/** Edit Plant Name input cap so a long unbroken name cannot blow out the dialog. */
export const PLANT_DISPLAY_NAME_MAX_LENGTH = 80;

export function hasTrimmedRequiredIdentity(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
