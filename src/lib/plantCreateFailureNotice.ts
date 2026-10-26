/**
 * Grower-facing copy when Create Plant's insert does not confirm a row.
 * Kept out of the dialog so the message does not depend on a toast the
 * grower can miss.
 */
import {
  PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE,
  isPlantHealthClearRejected,
} from "@/lib/plantHealthRules";

export const PLANT_CREATE_FAILED_MESSAGE = "Plant could not be created";

export function plantCreateFailureMessage(error: unknown): string {
  const message =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.trim()
      : "";
  if (isPlantHealthClearRejected(message)) {
    return PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE;
  }
  return message || PLANT_CREATE_FAILED_MESSAGE;
}
