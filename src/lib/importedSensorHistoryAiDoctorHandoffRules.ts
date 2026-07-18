/**
 * Pure handoff rules from a tent's imported sensor history to the existing
 * Plant Detail AI Doctor review surface.
 *
 * Safety contract:
 *  - No I/O, model calls, alerts, Action Queue writes, or device control.
 *  - Imported history remains historical context, never live telemetry.
 *  - A plant is never selected implicitly when several active plants exist.
 *  - Only bounded evidence counts and safe presenter copy/links leave this
 *    helper; exact sensor rows and raw payloads never do.
 */

import {
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  summarizeCsvHistoryEligibilityEvidence,
  type CsvHistorySensorRowLike,
} from "@/lib/aiDoctorCsvHistoryContextRules";
import { AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS } from "@/lib/aiDoctorReviewEligibilityRules";
import { AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP } from "@/lib/aiDoctorReviewRequestPacket";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { plantDetailPath } from "@/lib/routes";

export type ImportedHistoryAiDoctorHandoffReadStatus = "loading" | "error" | "success";

export interface ImportedHistoryAiDoctorHandoffPlant {
  id?: string | null;
  name?: string | null;
  isArchived?: boolean | null;
  /** Supabase row shape retained for defense-in-depth filtering. */
  is_archived?: boolean | null;
}

export type ImportedHistoryAiDoctorHandoffState =
  | "missing_tent"
  | "history_loading"
  | "history_error"
  | "history_empty"
  | "too_few_valid_observations"
  | "single_timestamp"
  | "plants_loading"
  | "plants_error"
  | "no_active_plants"
  | "single_active_plant"
  | "multiple_active_plants";

export interface ImportedHistoryAiDoctorHandoffChoice {
  plantId: string;
  plantName: string;
  label: string;
  href: string;
}

export interface ImportedHistoryAiDoctorHandoffResult {
  state: ImportedHistoryAiDoctorHandoffState;
  title: string;
  body: string;
  caveat: string;
  validObservationCount: number;
  distinctTimestampCount: number;
  choices: readonly ImportedHistoryAiDoctorHandoffChoice[];
}

export interface BuildImportedSensorHistoryAiDoctorHandoffInput {
  tentId: string | null | undefined;
  historyStatus: ImportedHistoryAiDoctorHandoffReadStatus;
  readings: readonly CsvHistorySensorRowLike[];
  plantStatus: ImportedHistoryAiDoctorHandoffReadStatus;
  plants: readonly ImportedHistoryAiDoctorHandoffPlant[];
}

/**
 * Match the cached-row read convention used by imported history: a failed
 * read wins; an empty initial fetch is loading; cached rows remain usable
 * while a background refresh runs.
 */
export function resolveImportedHistoryHandoffReadStatus(input: {
  isError: boolean;
  isFetching: boolean;
  hasRows: boolean;
}): ImportedHistoryAiDoctorHandoffReadStatus {
  if (input.isError) return "error";
  if (input.isFetching && !input.hasRows) return "loading";
  return "success";
}

interface NormalizedPlant {
  plantId: string;
  plantName: string;
  nameSortKey: string;
}

const EMPTY_CHOICES: readonly ImportedHistoryAiDoctorHandoffChoice[] = Object.freeze([]);

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeRequiredId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlantName(value: unknown): string {
  if (typeof value !== "string") return "Unnamed plant";
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : "Unnamed plant";
}

/**
 * Defense-in-depth normalization for query results. Sorting before de-duping
 * makes duplicate resolution deterministic even when input order changes.
 */
function normalizeActivePlants(
  plants: readonly ImportedHistoryAiDoctorHandoffPlant[] | null | undefined,
): NormalizedPlant[] {
  if (!Array.isArray(plants)) return [];

  const candidates: NormalizedPlant[] = [];
  for (const plant of plants) {
    if (
      !plant ||
      typeof plant !== "object" ||
      plant.isArchived === true ||
      plant.is_archived === true
    ) {
      continue;
    }
    const plantId = normalizeRequiredId(plant.id);
    if (!plantId) continue;
    const plantName = normalizePlantName(plant.name);
    candidates.push({
      plantId,
      plantName,
      nameSortKey: plantName.toLowerCase(),
    });
  }

  candidates.sort(
    (a, b) =>
      compareText(a.nameSortKey, b.nameSortKey) ||
      compareText(a.plantId, b.plantId) ||
      compareText(a.plantName, b.plantName),
  );

  const seenIds = new Set<string>();
  const unique: NormalizedPlant[] = [];
  for (const candidate of candidates) {
    if (seenIds.has(candidate.plantId)) continue;
    seenIds.add(candidate.plantId);
    unique.push(candidate);
  }
  return unique;
}

function buildChoices(
  plants: readonly NormalizedPlant[],
  tentId: string,
): readonly ImportedHistoryAiDoctorHandoffChoice[] {
  return Object.freeze(
    plants.map((plant) =>
      Object.freeze({
        plantId: plant.plantId,
        plantName: plant.plantName,
        label: `Review ${plant.plantName}`,
        href: `${plantDetailPath(plant.plantId, { tentId })}#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`,
      }),
    ),
  );
}

function result(
  state: ImportedHistoryAiDoctorHandoffState,
  title: string,
  body: string,
  validObservationCount: number,
  distinctTimestampCount: number,
  choices: readonly ImportedHistoryAiDoctorHandoffChoice[] = EMPTY_CHOICES,
): ImportedHistoryAiDoctorHandoffResult {
  return {
    state,
    title,
    body,
    caveat: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
    validObservationCount,
    distinctTimestampCount,
    choices,
  };
}

/**
 * Build the complete, deterministic presenter state for an explicit handoff
 * from tent-level imported history to a plant-scoped historical review.
 */
export function buildImportedSensorHistoryAiDoctorHandoff(
  input: BuildImportedSensorHistoryAiDoctorHandoffInput,
): ImportedHistoryAiDoctorHandoffResult {
  const readings = Array.isArray(input?.readings) ? input.readings : [];
  const evidence = summarizeCsvHistoryEligibilityEvidence(
    readings,
    AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP,
  );
  const validObservationCount = evidence.validObservationCount;
  const distinctTimestampCount = evidence.distinctObservationTimestampCount;
  const tentId = normalizeRequiredId(input?.tentId);

  if (!tentId) {
    return result(
      "missing_tent",
      "AI Doctor handoff unavailable",
      "Tent context is not available, so a plant review link cannot be built.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (input.historyStatus === "loading") {
    return result(
      "history_loading",
      "Checking imported history",
      "Imported sensor history is still loading.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (input.historyStatus === "error") {
    return result(
      "history_error",
      "Imported history unavailable",
      "Imported sensor history could not be checked right now. Try again before choosing a plant review.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (readings.length === 0) {
    return result(
      "history_empty",
      "No imported history to review",
      "This tent has no imported CSV sensor history for a historical plant review.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (validObservationCount < AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS) {
    return result(
      "too_few_valid_observations",
      "More history is needed",
      `A historical review needs at least ${AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS} valid observations. Found ${validObservationCount}.`,
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (distinctTimestampCount < 2) {
    return result(
      "single_timestamp",
      "More than one timestamp is needed",
      "The valid observations all come from one timestamp. Add history from another time before starting a historical review.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (input.plantStatus === "loading") {
    return result(
      "plants_loading",
      "Checking active plants",
      "Imported history is eligible. Active plants are still loading.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  if (input.plantStatus === "error") {
    return result(
      "plants_error",
      "Plants unavailable",
      "Imported history is eligible, but active plants could not be checked right now. Refresh this page or try again later.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  const plants = normalizeActivePlants(input.plants);
  if (plants.length === 0) {
    return result(
      "no_active_plants",
      "No active plant to review",
      "This tent has eligible imported history. Add or reactivate a plant in this tent before starting a plant-scoped review.",
      validObservationCount,
      distinctTimestampCount,
    );
  }

  const choices = buildChoices(plants, tentId);
  if (choices.length === 1) {
    return result(
      "single_active_plant",
      "Review this plant's history",
      `Open ${choices[0].plantName}'s existing AI Doctor review with this tent's historical context.`,
      validObservationCount,
      distinctTimestampCount,
      choices,
    );
  }

  return result(
    "multiple_active_plants",
    "Choose a plant for review",
    `${choices.length} active plants are available. Choose one explicitly; no plant is selected by default.`,
    validObservationCount,
    distinctTimestampCount,
    choices,
  );
}
