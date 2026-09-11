/**
 * Shared fail-closed check for grower identity fields (plant/tent Name).
 *
 * Empty and whitespace-only strings are not identities. Callers disable
 * primary Create/Save until this returns true; submit handlers still refuse
 * a blank write if the form is forced.
 *
 * Pure: no React, no I/O, no clock.
 */
export function hasTrimmedRequiredIdentity(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
