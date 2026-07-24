/**
 * Pure trust rules for the legacy grow-data adapter surfaces.
 *
 * Raw sensor lineage is resolved before these rules run. These helpers keep
 * presenter and legacy AI behavior aligned without leaking raw payloads into
 * React components or model context.
 */

export interface GrowSensorEvidenceReadingLike {
  source?: string | null;
  status?: string | null;
}

export interface LegacyAiSensorMetaLike {
  dataSource?: "supabase" | "mock" | "mixed" | "unavailable" | "unknown";
  isDemoData?: boolean;
}

export interface LegacyAiSensorEvidence<T extends GrowSensorEvidenceReadingLike> {
  trustedLiveReadings: T[];
  sensorMeta: LegacyAiSensorMetaLike;
  state: "empty" | "physical_live" | "mixed" | "untrusted_only";
}

/** A provenance-resolved usable row may drive presenter health cues. */
export function isUsableGrowSensorReading(
  reading: GrowSensorEvidenceReadingLike | null | undefined,
): boolean {
  return (
    reading?.status === "usable" &&
    (reading.source === "live" || reading.source === "manual" || reading.source === "csv")
  );
}

/** Only a provenance-resolved, usable live row counts as physical AI evidence. */
export function isHealthyLiveGrowSensorReading(
  reading: GrowSensorEvidenceReadingLike | null | undefined,
): boolean {
  return reading?.source === "live" && isUsableGrowSensorReading(reading);
}

/**
 * Select legacy AI sensor evidence and derive honest source metadata.
 * Diagnostic/demo rows remain visible elsewhere, but never enter the AI
 * context or lift its confidence ceiling.
 */
export function buildLegacyAiSensorEvidence<T extends GrowSensorEvidenceReadingLike>(
  readings: readonly T[] | null | undefined,
  baseMeta: LegacyAiSensorMetaLike | null | undefined,
): LegacyAiSensorEvidence<T> {
  const rows = Array.isArray(readings) ? readings : [];
  const trustedLiveReadings = rows.filter(isHealthyLiveGrowSensorReading);
  const safeBase: LegacyAiSensorMetaLike = {
    dataSource: baseMeta?.dataSource ?? "unknown",
    isDemoData: baseMeta?.isDemoData ?? false,
  };

  if (rows.length === 0) {
    return { trustedLiveReadings, sensorMeta: safeBase, state: "empty" };
  }

  if (trustedLiveReadings.length === rows.length) {
    return {
      trustedLiveReadings,
      sensorMeta: safeBase,
      state: "physical_live",
    };
  }

  if (trustedLiveReadings.length > 0) {
    return {
      trustedLiveReadings,
      sensorMeta: { dataSource: "mixed", isDemoData: false },
      state: "mixed",
    };
  }

  const hasDiagnostic = rows.some((row) => row.source === "demo");
  return {
    trustedLiveReadings,
    sensorMeta: hasDiagnostic
      ? { dataSource: "mock", isDemoData: true }
      : { dataSource: "unavailable", isDemoData: false },
    state: "untrusted_only",
  };
}
