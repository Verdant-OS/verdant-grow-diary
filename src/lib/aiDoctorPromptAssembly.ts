/**
 * aiDoctorPromptAssembly — pure helper that assembles the AI Doctor
 * system + user prompt messages.
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no Supabase, no model calls, no fetch.
 *  - Text-only prompt composition. NEVER writes to Supabase, alerts,
 *    Action Queue, sensor_readings, or device controls.
 *  - Imported CSV/XLSX history is injected as historical context only
 *    and must never satisfy live/current sensor requirements.
 *  - Output strings never expose raw_payload, raw_row, device serials,
 *    bridge tokens, source file names, import batch IDs, or internal
 *    IDs — the upstream history fragment helper already strips these.
 *  - Preserves the canonical AI Doctor required output structure.
 */

import {
  buildAiDoctorImportedHistoryPromptFragment,
  IMPORTED_HISTORY_PROMPT_STRINGS,
  AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS,
} from "./aiDoctorImportedHistoryPromptRules";
import {
  buildValidatorSafeAiDoctorPromptValue,
  sanitizeAiDoctorPromptText,
} from "./aiDoctorPromptVocabularyRules";
import { stripAiDoctorReviewRequestTransportFields } from "./aiDoctorReviewRequestTransportRules";

export const AI_DOCTOR_BASE_SYSTEM_PROMPT =
  "You are a cautious cannabis grow assistant. Reply ONLY through the " +
  "submit_ai_doctor_review tool. Use grounded, hedged language. Never " +
  "claim certainty. Never instruct the user to turn on, switch off, " +
  "toggle, or otherwise control fans, heaters, humidifiers, dehumidifiers, " +
  "pumps, lights, valves, controllers, or any other equipment. Use " +
  "advisory phrasing such as 'Avoid…' or 'Do not…' for cautions. Keep all " +
  "arrays to at most 12 items and at most one short sentence per item.";

export const AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE = Object.freeze([
  "Treat root-zone entries as grower-recorded historical observations, not prescribed targets.",
  "Use repeated measurements and plant response as context; state when runoff or follow-up evidence is missing.",
  "Treat invalidFields as omitted measurements and name them under Missing information.",
  "Do not recommend aggressive irrigation or nutrient changes from a single root-zone entry.",
]);

export interface AiDoctorPromptMessages {
  system: string;
  user: string;
  guidance: readonly string[];
  importedHistoryBlock: string | null;
  missingLiveReadingsBlock: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Assemble system + user prompt messages for the AI Doctor review call.
 *
 * `packet` is the grower context packet (already compiled upstream).
 * When it carries `imported_sensor_history` and/or
 * `missingLiveSensorReadings`, the corresponding safety guidance and
 * historical-context blocks are appended.
 */
export function buildAiDoctorPromptMessages(packet: unknown): AiDoctorPromptMessages {
  const rec = asRecord(packet);
  const imported_sensor_history = rec?.imported_sensor_history ?? null;
  const missingLiveSensorReadings = rec?.missingLiveSensorReadings === true;
  const hasRootZoneObservations =
    Array.isArray(rec?.recentRootZoneObservations) && rec.recentRootZoneObservations.length > 0;

  const fragment = buildAiDoctorImportedHistoryPromptFragment({
    imported_sensor_history,
    missingLiveSensorReadings,
  });
  const guidance = Object.freeze(fragment.guidance.map(sanitizeAiDoctorPromptText));
  // Scope and idempotency fields are operational transport metadata, not
  // grower context. Defense in depth: omit them here even if an Edge caller
  // accidentally passes a flat legacy request to prompt assembly.
  const safePacket = buildValidatorSafeAiDoctorPromptValue(
    stripAiDoctorReviewRequestTransportFields(packet ?? null),
  );

  const systemSections: string[] = [AI_DOCTOR_BASE_SYSTEM_PROMPT];
  if (guidance.length > 0) {
    systemSections.push(
      "Historical sensor context safety rules:",
      ...guidance.map((g) => `- ${g}`),
    );
  }
  if (hasRootZoneObservations) {
    systemSections.push(
      "Root-zone context safety rules:",
      ...AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE.map((rule) => `- ${rule}`),
    );
  }
  systemSections.push(
    "Required output sections (preserve order, names, and completeness): " +
      AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS.join(" | "),
  );

  const userSections: string[] = ["Grower context packet (JSON):", JSON.stringify(safePacket)];
  if (fragment.importedHistoryBlock) {
    userSections.push("", fragment.importedHistoryBlock);
  }
  if (fragment.missingLiveReadingsBlock) {
    userSections.push("", fragment.missingLiveReadingsBlock);
  }

  return {
    system: sanitizeAiDoctorPromptText(systemSections.join("\n")),
    user: sanitizeAiDoctorPromptText(userSections.join("\n")),
    guidance,
    importedHistoryBlock: fragment.importedHistoryBlock
      ? sanitizeAiDoctorPromptText(fragment.importedHistoryBlock)
      : null,
    missingLiveReadingsBlock: fragment.missingLiveReadingsBlock
      ? sanitizeAiDoctorPromptText(fragment.missingLiveReadingsBlock)
      : null,
  };
}

export { IMPORTED_HISTORY_PROMPT_STRINGS, AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS };
