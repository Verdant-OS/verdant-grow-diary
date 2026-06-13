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

export const AI_DOCTOR_BASE_SYSTEM_PROMPT =
  "You are a cautious cannabis grow assistant. Reply ONLY through the " +
  "submit_ai_doctor_review tool. Use grounded, hedged language. Never " +
  "claim certainty. Never instruct the user to turn on, switch off, " +
  "toggle, or otherwise control fans, heaters, humidifiers, dehumidifiers, " +
  "pumps, lights, valves, controllers, or any other equipment. Use " +
  "advisory phrasing such as 'Avoid…' or 'Do not…' for cautions. Keep all " +
  "arrays to at most 12 items and at most one short sentence per item.";

export interface AiDoctorPromptMessages {
  system: string;
  user: string;
  guidance: readonly string[];
  importedHistoryBlock: string | null;
  missingLiveReadingsBlock: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Assemble system + user prompt messages for the AI Doctor review call.
 *
 * `packet` is the grower context packet (already compiled upstream).
 * When it carries `imported_sensor_history` and/or
 * `missingLiveSensorReadings`, the corresponding safety guidance and
 * historical-context blocks are appended.
 */
export function buildAiDoctorPromptMessages(
  packet: unknown,
): AiDoctorPromptMessages {
  const rec = asRecord(packet);
  const imported_sensor_history = (rec?.imported_sensor_history ?? null) as
    | Parameters<typeof buildAiDoctorImportedHistoryPromptFragment>[0]["imported_sensor_history"]
    | null;
  const missingLiveSensorReadings = rec?.missingLiveSensorReadings === true;

  const fragment = buildAiDoctorImportedHistoryPromptFragment({
    imported_sensor_history,
    missingLiveSensorReadings,
  });

  const systemSections: string[] = [AI_DOCTOR_BASE_SYSTEM_PROMPT];
  if (fragment.guidance.length > 0) {
    systemSections.push(
      "Imported sensor history safety rules:",
      ...fragment.guidance.map((g) => `- ${g}`),
    );
  }
  systemSections.push(
    "Required output sections (preserve order, names, and completeness): " +
      AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS.join(" | "),
  );

  const userSections: string[] = [
    "Grower context packet (JSON):",
    JSON.stringify(packet ?? null),
  ];
  if (fragment.importedHistoryBlock) {
    userSections.push("", fragment.importedHistoryBlock);
  }
  if (fragment.missingLiveReadingsBlock) {
    userSections.push("", fragment.missingLiveReadingsBlock);
  }

  return {
    system: systemSections.join("\n"),
    user: userSections.join("\n"),
    guidance: fragment.guidance,
    importedHistoryBlock: fragment.importedHistoryBlock,
    missingLiveReadingsBlock: fragment.missingLiveReadingsBlock,
  };
}

export { IMPORTED_HISTORY_PROMPT_STRINGS, AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS };
