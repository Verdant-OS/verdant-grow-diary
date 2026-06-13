/**
 * verdantGeneticsXlsxMappingViewModel — pure view-model for mapping
 * detected XLSX sensor groups to Verdant tents.
 *
 * Pure. No I/O. No Supabase. No insert/update/delete/upsert/rpc.
 * No alerts. No Action Queue writes. No AI. No device control.
 *
 * Mapping is stored locally in component state; this module does not
 * persist mappings.
 */

export interface TentOption {
  id: string;
  name: string;
}

export interface VerdantGeneticsXlsxMappingState {
  tentIdBySensorGroup: Record<string, string>;
}

export function buildInitialMappingState(
  detectedGroups: readonly string[],
): VerdantGeneticsXlsxMappingState {
  return { tentIdBySensorGroup: {} };
}

export function setGroupMapping(
  state: VerdantGeneticsXlsxMappingState,
  sensorGroup: string,
  tentId: string | null | undefined,
): VerdantGeneticsXlsxMappingState {
  const next = { ...state.tentIdBySensorGroup };
  if (tentId && tentId.trim() !== "") {
    next[sensorGroup] = tentId;
  } else {
    delete next[sensorGroup];
  }
  return { tentIdBySensorGroup: next };
}

export interface MappingReadiness {
  mappedCount: number;
  unmappedCount: number;
  totalGroups: number;
  allMapped: boolean;
}

export function buildMappingReadiness(
  detectedGroups: readonly string[],
  tentIdBySensorGroup: Record<string, string>,
): MappingReadiness {
  const totalGroups = detectedGroups.length;
  const mappedCount = detectedGroups.filter((g) => {
    const tid = tentIdBySensorGroup[g];
    return typeof tid === "string" && tid.trim() !== "";
  }).length;
  return {
    mappedCount,
    unmappedCount: totalGroups - mappedCount,
    totalGroups,
    allMapped: totalGroups > 0 && mappedCount === totalGroups,
  };
}

export const XLSX_MAPPING_REQUIRED_COPY =
  "Each XLSX sensor group must be mapped to a Verdant tent before import." as const;

export const XLSX_NO_TENTS_COPY =
  "No tents available. Create or select a tent before importing this XLSX history." as const;

export const XLSX_IMPORT_SAVING_DISABLED_COPY =
  "XLSX import saving is not enabled yet." as const;
