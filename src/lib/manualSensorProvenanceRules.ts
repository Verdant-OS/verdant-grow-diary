/**
 * Canonical provenance for grower-entered measurements. `manual_entry` is
 * the acquisition method, not a physical device identity or a trust verdict.
 * Device notes, observation time, freshness and quality remain separate.
 */
export type ManualSensorProvenance = {
  source: "manual";
  source_identity: "manual_entry";
  transport: "manual";
  confidence: null;
};

export type ManualSensorPayload = { manual_provenance: ManualSensorProvenance };

/** Fresh objects keep one submission's metadata independent of another. */
export function buildManualSensorProvenance(): ManualSensorProvenance {
  return {
    source: "manual",
    source_identity: "manual_entry",
    transport: "manual",
    confidence: null,
  };
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function isCanonicalManualSensorProvenance(value: unknown): value is ManualSensorProvenance {
  return (
    hasExactKeys(value, ["source", "source_identity", "transport", "confidence"]) &&
    value.source === "manual" &&
    value.source_identity === "manual_entry" &&
    value.transport === "manual" &&
    value.confidence === null
  );
}

/** Closed storage envelope: extra metadata cannot establish a retry receipt. */
export function isCanonicalManualSensorPayload(value: unknown): value is ManualSensorPayload {
  return (
    hasExactKeys(value, ["manual_provenance"]) &&
    isCanonicalManualSensorProvenance(value.manual_provenance)
  );
}

/** Legacy absent metadata matches only absent metadata, never a new envelope. */
export function matchesManualSensorPayload(submitted: unknown, stored: unknown): boolean {
  if (submitted == null || stored == null) return submitted == null && stored == null;
  // All fields in the closed canonical envelope have one literal value, so
  // two valid envelopes are equal without depending on JSON key order.
  return isCanonicalManualSensorPayload(submitted) && isCanonicalManualSensorPayload(stored);
}

/** Known manual source also identifies the entry method on older rows. */
export function buildManualSensorProvenanceLabels(
  source: unknown,
): readonly [string, string, string, string] {
  const provenance = source === "manual" ? buildManualSensorProvenance() : null;
  return [
    `Source: ${provenance?.source ?? "unknown"}`,
    `Identity: ${provenance?.source_identity ?? "unknown"}`,
    `Transport: ${provenance?.transport ?? "unknown"}`,
    "Confidence: unknown",
  ];
}
