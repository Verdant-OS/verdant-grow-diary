/**
 * csvHistoryOnboardingIntentRules — a fixed, safe public-CSV acquisition
 * handoff. The query value only changes the onboarding presenter; it never
 * carries a grower id, file, provider, or import payload.
 */
import { buildSensorsTentRouteHref, SENSORS_TENT_ROUTE } from "@/lib/sensorRouteTentIntentRules";
import { buildAttributedSignupPath } from "@/lib/signupAcquisitionRules";

export const ONBOARDING_INTENT_QUERY_PARAM = "intent" as const;
export const CSV_HISTORY_ONBOARDING_INTENT = "csv_history" as const;
export const CSV_HISTORY_ONBOARDING_TITLE = "Prepare your CSV history";
export const CSV_HISTORY_ONBOARDING_COPY =
  "Create an editable starter Grow, Tent, and Plant, then choose and confirm your CSV on Sensor Data. Nothing is uploaded or analyzed automatically.";
export const CSV_HISTORY_ONBOARDING_SETUP_LABEL = "Create starter setup for CSV import";
export const CSV_HISTORY_ONBOARDING_READY_COPY =
  "Your starter Grow and Tent are ready. Continue when you are ready to choose a CSV file.";
export const CSV_HISTORY_ONBOARDING_IMPORT_LABEL = "Import historical data";
export const CSV_HISTORY_ONBOARDING_HANDOFF_ERROR_COPY =
  "Starter setup finished, but Verdant couldn't prepare a safe import link. Open Sensor Data and select your tent before importing.";

export interface OnboardingIntentSearch {
  get(name: string): string | null;
}

/**
 * Return the only supported acquisition intent. Unknown query values fail
 * closed so arbitrary public URL state cannot steer onboarding behavior.
 */
export function readCsvHistoryOnboardingIntent(
  search: OnboardingIntentSearch | null | undefined,
): typeof CSV_HISTORY_ONBOARDING_INTENT | null {
  return search?.get(ONBOARDING_INTENT_QUERY_PARAM) === CSV_HISTORY_ONBOARDING_INTENT
    ? CSV_HISTORY_ONBOARDING_INTENT
    : null;
}

/** A fixed, same-origin return path for a CSV-history signup. */
export function buildCsvHistoryOnboardingPath(): string {
  const params = new URLSearchParams();
  params.set(ONBOARDING_INTENT_QUERY_PARAM, CSV_HISTORY_ONBOARDING_INTENT);
  return `/onboarding?${params.toString()}`;
}

/**
 * Build the fixed public-preview handoff into signup and CSV onboarding.
 * The URL carries attribution and a same-origin intent only. It never carries
 * the selected file, parsed rows, grower identifiers, or sensor payloads.
 */
export function buildCsvHistorySignupPath(): string {
  return buildAttributedSignupPath({
    source: CSV_HISTORY_ONBOARDING_INTENT,
    redirectTo: buildCsvHistoryOnboardingPath(),
  });
}

/**
 * Build the explicit next step after the grower has created starter context.
 * The existing Sensors route revalidates the UUID against the authenticated
 * tent list before selecting it. Invalid IDs yield null rather than a broad
 * or silently retargeted import link.
 */
export function buildCsvHistoryImportHandoffHref(tentId: unknown): string | null {
  const sensorsHref = buildSensorsTentRouteHref(tentId);
  if (sensorsHref === SENSORS_TENT_ROUTE) return null;
  return `${sensorsHref}#csv-import`;
}
