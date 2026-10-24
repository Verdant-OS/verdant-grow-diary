/**
 * Recovers a linked Quick Log grow_event's volume onto its diary companion.
 *
 * A companion row's `details.watering` / `details.feeding` envelope can exist
 * without a volume (for example `watering: { ph: 6.2 }`). Envelope presence is
 * therefore not volume presence: only a non-null volume field counts, and the
 * recovered volume is merged into the existing envelope so its other readings
 * stay.
 *
 * Pure: no React, no Supabase, no clock.
 */

type Details = Record<string, unknown>;

function asRecord(value: unknown): Details | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Details)
    : null;
}

function envelopeHasVolume(value: unknown): boolean {
  const envelope = asRecord(value);
  return !!envelope && (envelope.volume_ml != null || envelope.volumeMl != null);
}

/** True when the details already carry a watering or feeding volume. */
export function timelineDetailsHaveVolume(details: Details): boolean {
  return (
    details.watering_amount_ml != null ||
    details.wateringAmountMl != null ||
    details.volume_ml != null ||
    envelopeHasVolume(details.watering) ||
    envelopeHasVolume(details.feeding)
  );
}

/**
 * Details with the grow_event's `volumeMl` merged into the companion's
 * watering or feeding envelope, or the same object when nothing applies (not a
 * watering/feeding row, no finite volume, or a volume already present).
 */
export function mergeLinkedGrowEventVolume(
  details: Details,
  effectiveType: string,
  volumeMl: unknown,
): Details {
  if (effectiveType !== "watering" && effectiveType !== "feeding") return details;
  if (typeof volumeMl !== "number" || !Number.isFinite(volumeMl)) return details;
  if (timelineDetailsHaveVolume(details)) return details;
  const key = effectiveType === "feeding" ? "feeding" : "watering";
  return { ...details, [key]: { ...(asRecord(details[key]) ?? {}), volume_ml: volumeMl } };
}
