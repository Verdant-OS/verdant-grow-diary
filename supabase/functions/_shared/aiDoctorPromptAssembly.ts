/**
 * _shared re-export shim — surfaces src/lib/aiDoctorPromptAssembly.ts to
 * edge functions.
 *
 * Convention follows _shared/unionEntitlementLookup.ts: the single source of
 * truth stays in src/lib; edge function index.ts files import from
 * ../_shared/* only. Do not add logic here.
 */
export {
  AI_DOCTOR_BASE_SYSTEM_PROMPT,
  AI_DOCTOR_ROOT_ZONE_SAFETY_GUIDANCE,
  buildAiDoctorPromptMessages,
  IMPORTED_HISTORY_PROMPT_STRINGS,
  AI_DOCTOR_REQUIRED_OUTPUT_SECTIONS,
  type AiDoctorPromptMessages,
} from "./lib/lib/aiDoctorPromptAssembly.ts";
