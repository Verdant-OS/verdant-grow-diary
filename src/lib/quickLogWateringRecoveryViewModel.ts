import type { PendingQuickLogWatering } from "./quickLogPendingWateringStore";
import { EMPTY_QUICKLOG_V2_FORM, type QuickLogV2FormState } from "./quickLogV2Rules";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "./quickLogWateringFormViewModel";
import { projectRootZoneManualObservationFromDetails } from "./rootZoneManualObservationRules";

const numberText = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";

/** Present the validated frozen record, never derive a new target or measurement. */
export function buildWateringRecoveryForm(record: PendingQuickLogWatering): {
  form: QuickLogV2FormState;
  wateringForm: QuickLogWateringFormState;
} {
  const p = record.payload;
  const metrics = p.sensor_snapshot?.metrics;
  const observation = projectRootZoneManualObservationFromDetails(
    p.details,
    typeof p.occurred_at === "string" ? p.occurred_at : "",
  );
  const manual = observation.status === "valid" ? observation.manualObservation : null;
  return {
    form: {
      ...EMPTY_QUICKLOG_V2_FORM,
      selectedKey: `${record.resolved.targetType}:${record.resolved.targetId}`,
      action: "water",
      note: p.note ?? "",
      temperatureC: numberText(metrics?.temperature_c),
      humidityPct: numberText(metrics?.humidity_pct),
      vpdKpa: numberText(metrics?.vpd_kpa),
    },
    wateringForm: {
      ...EMPTY_QUICKLOG_WATERING_FORM,
      volumeMl: numberText(p.volume_ml),
      ph: numberText(p.ph),
      ec: numberText(p.ec_ms_cm),
      runoffMl: numberText(p.runoff_ml),
      runoffPh: numberText(p.runoff_ph),
      runoffEc: numberText(p.runoff_ec),
      waterTempC: numberText(p.water_temp_c),
      potWeightFeel: manual?.potWeightFeel ?? "",
      mediumSurface: manual?.mediumSurface ?? "",
      drainage: manual?.drainage ?? "",
    },
  };
}
