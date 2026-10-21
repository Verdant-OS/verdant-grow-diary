import { isStale } from "@/lib/sensorSnapshot";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import type { DisplayedVpdObservation } from "@/lib/vpdStabilityInputRules";

/** Only live and manual readings may read as current on the tent page. */
const CURRENT_SOURCES = new Set(["live", "manual"]);

export interface TentDetailVpdObservation extends DisplayedVpdObservation {
  /** True only for VPD derived from temperature and RH (no stored vpd_kpa). */
  calculated: boolean;
}

/**
 * The tent page's current VPD (VER-189, #2268): the same value the Dashboard
 * Tonight card shows for this tent, chosen by `buildTonightTentMetrics` over the
 * same stored rows and diary-inclusive snapshot. A temperature and RH pair from
 * one capture that is newer than every stored VPD therefore replaces an older
 * stored VPD here too, instead of the tent page keeping the stale stored value.
 *
 * - Tonight has a value: show it, with its source, capture time and
 *   calculated flag.
 * - Tonight's newest VPD evidence is invalid: show no value, never an older
 *   stored one beside it.
 * - Tonight has nothing yet (loading, missing, unavailable): keep the tent
 *   page's own observation, which also covers manual-history VPD that Tonight
 *   does not read.
 * - The tent's sensor-truth check rejected the stored temperature, RH or VPD:
 *   keep the tent page's own observation. Tonight does not run that realism
 *   check, so its value could rest on a rejected reading.
 */
export function resolveTentDetailVpd(input: {
  tonight: TonightMetricView | null | undefined;
  existing: DisplayedVpdObservation;
  /** Snapshot metrics the tent's sensor-truth check rejected (header.truth.invalidFields). */
  rejectedMetrics: readonly string[];
  nowMs: number;
}): TentDetailVpdObservation {
  const { tonight } = input;
  if (input.rejectedMetrics.some((key) => key === "temp" || key === "rh" || key === "vpd")) {
    return { ...input.existing, calculated: false };
  }
  if (tonight?.state === "invalid") {
    return { value: null, capturedAt: null, source: null, stale: false, calculated: false };
  }
  if (
    tonight?.state === "value" &&
    typeof tonight.value === "number" &&
    Number.isFinite(tonight.value)
  ) {
    const source = tonight.source;
    return {
      value: tonight.value,
      capturedAt: tonight.capturedAt,
      source,
      stale:
        tonight.capturedAt === null ||
        source === null ||
        !CURRENT_SOURCES.has(source) ||
        isStale(tonight.capturedAt, input.nowMs, undefined, source),
      calculated: tonight.calculated,
    };
  }
  return { ...input.existing, calculated: false };
}
