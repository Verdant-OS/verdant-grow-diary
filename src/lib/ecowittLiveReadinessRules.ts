/**
 * EcoWitt Live Readiness Rules.
 *
 * Pure GO/NO-GO evaluator for final EcoWitt live-data preparation.
 * It does not query sensors, call Supabase, write readings, create alerts,
 * create Action Queue rows, run models, or control devices.
 *
 * Live readiness requires real device/controller evidence. Local sender success
 * alone is never enough to call telemetry live.
 */

export type EcowittLiveReadinessVerdict = "blocked" | "partial" | "ready" | "mismatch";

export interface EcowittLiveMetricComparison {
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa" | "co2_ppm" | "soil_moisture_pct";
  controllerValue: number | null;
  backendValue: number | null;
  tolerance: number;
  unit: string;
}

export interface EcowittLiveReadinessInput {
  mosquittoRunning?: boolean;
  diyUploadConfigured?: boolean;
  listenerReachable?: boolean;
  mqttPayloadSeen?: boolean;
  validPayloadAccepted?: boolean;
  invalidPayloadRejected?: boolean;
  backendEvidencePresent?: boolean;
  realDeviceComparisonPresent?: boolean;
  sourceLabel?: string | null;
  capturedAtRecent?: boolean;
  confidencePresent?: boolean;
  tentIdPresent?: boolean;
  suspiciousFlags?: readonly string[];
  metricComparisons?: readonly EcowittLiveMetricComparison[];
}

export interface EcowittLiveReadinessResult {
  verdict: EcowittLiveReadinessVerdict;
  label: string;
  summary: string;
  blockers: readonly string[];
  warnings: readonly string[];
  requiredEvidenceMissing: readonly string[];
  operatorAction: string;
  canCallLive: boolean;
  canCreateAlerts: boolean;
  canCreateActionQueueItems: boolean;
}

function missing(condition: boolean | undefined, label: string): string | null {
  return condition === true ? null : label;
}

function comparisonMismatch(
  comparison: EcowittLiveMetricComparison,
): string | null {
  if (comparison.controllerValue == null || comparison.backendValue == null) {
    return `${comparison.metric} missing controller or backend value`;
  }
  const delta = Math.abs(comparison.controllerValue - comparison.backendValue);
  if (delta > comparison.tolerance) {
    return `${comparison.metric} mismatch: controller ${comparison.controllerValue}${comparison.unit} vs backend ${comparison.backendValue}${comparison.unit}`;
  }
  return null;
}

export function evaluateEcowittLiveReadiness(
  input: EcowittLiveReadinessInput,
): EcowittLiveReadinessResult {
  const requiredEvidenceMissing = [
    missing(input.mosquittoRunning, "Mosquitto broker running"),
    missing(input.diyUploadConfigured, "EcoWitt DIY/upload configured"),
    missing(input.listenerReachable, "Local listener or bridge reachable"),
    missing(input.mqttPayloadSeen, "Raw MQTT payload seen"),
    missing(input.validPayloadAccepted, "Valid payload accepted"),
    missing(input.invalidPayloadRejected, "Invalid payload rejected"),
    missing(input.backendEvidencePresent, "Backend accept/reject evidence present"),
    missing(input.realDeviceComparisonPresent, "Real EcoWitt controller/app comparison present"),
    missing(input.capturedAtRecent, "captured_at is recent"),
    missing(input.confidencePresent, "confidence present"),
    missing(input.tentIdPresent, "tent_id present"),
  ].filter((item): item is string => item != null);

  const source = `${input.sourceLabel ?? ""}`.trim().toLowerCase();
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (source && source !== "live" && source !== "ecowitt") {
    blockers.push(`Source label is ${source}, not live/ecowitt.`);
  }
  if (!source) {
    blockers.push("Source label is missing.");
  }

  for (const flag of input.suspiciousFlags ?? []) {
    blockers.push(`Suspicious telemetry flag: ${flag}`);
  }

  for (const comparison of input.metricComparisons ?? []) {
    const mismatch = comparisonMismatch(comparison);
    if (mismatch) blockers.push(mismatch);
  }

  if (requiredEvidenceMissing.length > 0) {
    blockers.push(...requiredEvidenceMissing.map((e) => `Missing evidence: ${e}`));
  }

  const hasLocalPipeline =
    input.mosquittoRunning === true &&
    input.listenerReachable === true &&
    input.mqttPayloadSeen === true &&
    input.validPayloadAccepted === true &&
    input.invalidPayloadRejected === true &&
    input.backendEvidencePresent === true;

  if (blockers.length === 0) {
    return {
      verdict: "ready",
      label: "READY — live proof candidate",
      summary:
        "Real EcoWitt/controller evidence matches backend normalized values within tolerance for the reviewed captured_at window.",
      blockers: [],
      warnings,
      requiredEvidenceMissing,
      operatorAction:
        "Record GO with screenshots/notes. Live claim remains scoped to this evidence window only.",
      canCallLive: true,
      canCreateAlerts: false,
      canCreateActionQueueItems: false,
    };
  }

  const hasMismatch = blockers.some((b) =>
    /mismatch|suspicious|stuck|unit|source label is/i.test(b),
  );
  if (hasMismatch && input.realDeviceComparisonPresent) {
    return {
      verdict: "mismatch",
      label: "MISMATCH — investigate before retry",
      summary:
        "Real device/backend evidence disagrees or telemetry is suspicious. Do not call this live-ready.",
      blockers,
      warnings,
      requiredEvidenceMissing,
      operatorAction:
        "Record NO-GO. Investigate units, timestamps, source labels, and normalization before retrying.",
      canCallLive: false,
      canCreateAlerts: false,
      canCreateActionQueueItems: false,
    };
  }

  if (hasLocalPipeline && !input.realDeviceComparisonPresent) {
    warnings.push("Local sender and backend path work, but real device comparison is still missing.");
    return {
      verdict: "partial",
      label: "PARTIAL — bring-up in progress",
      summary:
        "The local pipeline appears to work, but real EcoWitt/controller comparison is still required before live proof.",
      blockers,
      warnings,
      requiredEvidenceMissing,
      operatorAction:
        "Continue bring-up. Compare physical controller/app values against backend evidence before calling anything live.",
      canCallLive: false,
      canCreateAlerts: false,
      canCreateActionQueueItems: false,
    };
  }

  return {
    verdict: "blocked",
    label: "BLOCKED — do not call live",
    summary:
      "Required evidence is missing. Verdant must not describe this telemetry as live or healthy yet.",
    blockers,
    warnings,
    requiredEvidenceMissing,
    operatorAction:
      "Hold. Complete the missing evidence steps and retry the GO/NO-GO check.",
    canCallLive: false,
    canCreateAlerts: false,
    canCreateActionQueueItems: false,
  };
}
