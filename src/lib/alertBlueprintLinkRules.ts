/**
 * Which persisted alert metrics have a Blueprint target band to point at.
 *
 * The two sides speak different vocabularies: alerts persist
 * `environmentTargetComparison.MetricKey` tokens ("temp" | "rh" | "vpd" |
 * "soil" | "soil_ec" | "soil_temp" | "ppfd", plus "snapshot"/"targets" from
 * snapshot-level alerts), while Blueprint scores `BlueprintMetricKey`s
 * ("tempC" | "rh" | "vpdKpa" | "ec" | "ph" | "ppfd" | "dli"). A link from an
 * alert row to the Blueprint section is only honest when the breached metric
 * actually HAS a band there, so the mapping is explicit and everything
 * unmapped returns null.
 *
 * Deliberately unmapped:
 *  - soil / soil_temp / soil_ec — Blueprint's `ec`/`ph` bands score the
 *    grower's FED input (root-zone observations from feeding history), not
 *    soil-probe readings. Claiming a soil-sensor alert broke a Blueprint band
 *    would connect two different measurements and mislead.
 *  - snapshot / targets — snapshot-level alerts have no single metric.
 *
 * Pure: no React, no I/O.
 */
import type { BlueprintMetricKey } from "@/lib/blueprintMetricRules";

const ALERT_METRIC_TO_BLUEPRINT: Readonly<Record<string, BlueprintMetricKey>> = {
  temp: "tempC",
  rh: "rh",
  vpd: "vpdKpa",
  // ppfd is banded at every stage in SOP_BLUEPRINT_TARGETS.
  ppfd: "ppfd",
};

/**
 * The Blueprint metric an alert's metric scores against, or null when the
 * alert has no corresponding band and no link should render.
 */
export function resolveAlertBlueprintMetric(
  metric: string | null | undefined,
): BlueprintMetricKey | null {
  if (typeof metric !== "string") return null;
  return ALERT_METRIC_TO_BLUEPRINT[metric] ?? null;
}
