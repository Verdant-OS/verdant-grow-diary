/**
 * Pure parsing for the Oreoz-versus-Gelonade guide's authenticated Quick Log
 * handoff. The URL carries only a closed prompt identifier — never user text,
 * plant ids, grow ids, or private diary content.
 */

import {
  OREOZ_GELONADE_GUIDE_PROMPT,
  OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH,
  OREOZ_GELONADE_PHENO_NOTE_PROMPT,
} from "@/constants/oreozGelonadeExperience";

export { OREOZ_GELONADE_GUIDE_QUICK_LOG_PATH };

export interface GuidePhenoQuickLogPrefill {
  readonly eventType: "observation";
  readonly note: string;
  readonly source: "oreoz-vs-gelonade-guide";
  readonly suppressPlantDefault: true;
}

export function readGuidePhenoQuickLogPrefill(
  search: string | null | undefined,
): GuidePhenoQuickLogPrefill | null {
  if (typeof search !== "string") return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (
    params.get("open") !== "quick-log" ||
    params.get("type") !== "observation" ||
    params.get("prompt") !== OREOZ_GELONADE_GUIDE_PROMPT
  ) {
    return null;
  }
  return {
    eventType: "observation",
    note: OREOZ_GELONADE_PHENO_NOTE_PROMPT,
    source: "oreoz-vs-gelonade-guide",
    suppressPlantDefault: true,
  };
}
