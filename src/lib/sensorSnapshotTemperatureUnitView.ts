/**
 * sensorSnapshotTemperatureUnitView — pure presenter transform that
 * applies the user's temperature unit preference to a resolved sensor
 * snapshot model. Display-only. Stored values are NEVER mutated and the
 * underlying resolver output is treated as immutable.
 *
 * Hard safety rules:
 *  - No Supabase. No fetch. No AI. No Action Queue. No automation.
 *  - No schema/RLS/Edge/auth/migration changes.
 *  - Never invents data — null/invalid input stays null.
 *  - Never double-converts — only metrics whose unit reads as °C-ish
 *    are converted. Already-Fahrenheit values pass through untouched.
 *  - Soil-moisture and other non-temp metrics are never touched.
 */
import {
  convertCelsiusForDisplay,
  getTemperatureUnitSymbol,
  loadTemperatureUnitPreference,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import type {
  SensorSnapshotDisplayModel,
  SensorSnapshotMetricDisplay,
} from "@/lib/sensorSnapshotFreshnessRules";

const TEMP_METRIC_KEYS = new Set<SensorSnapshotMetricDisplay["key"]>([
  "temp",
  "soil",
]);

/**
 * Soil-moisture chips use key="soil" with unit="%". Soil-temperature
 * chips also use key="soil" but with unit="°C". Treat as temperature
 * only when the unit is an explicit Celsius marker.
 */
function isCelsiusUnit(unit: string | null): boolean {
  if (!unit) return false;
  const u = unit.trim();
  return u === "°C" || u === "C" || u === "celsius" || u === "°c";
}

function isFahrenheitUnit(unit: string | null): boolean {
  if (!unit) return false;
  const u = unit.trim();
  return u === "°F" || u === "F" || u === "fahrenheit" || u === "°f";
}

export interface ApplyTemperatureUnitOptions {
  /** Override preference (tests). Otherwise reads from localStorage. */
  unit?: TemperatureUnitPreference;
}

export function applyTemperatureUnitToSnapshotMetrics(
  metrics: ReadonlyArray<SensorSnapshotMetricDisplay>,
  options: ApplyTemperatureUnitOptions = {},
): SensorSnapshotMetricDisplay[] {
  const preference = options.unit ?? loadTemperatureUnitPreference();
  const targetSymbol = getTemperatureUnitSymbol(preference);

  return metrics.map((metric) => {
    if (!TEMP_METRIC_KEYS.has(metric.key)) return { ...metric };
    if (metric.display === null) return { ...metric };
    if (!isCelsiusUnit(metric.unit) && !isFahrenheitUnit(metric.unit)) {
      // Unknown unit — never guess. Pass through untouched.
      return { ...metric };
    }

    // Parse the safe stringified display ("24.3" / "75") deterministically.
    const parsed = Number(metric.display);
    if (!Number.isFinite(parsed)) return { ...metric };

    // Convert into canonical Celsius first (no-op when already °C),
    // then into the preferred display unit. Guarantees no double
    // conversion: F→C→F yields F exactly; C→C→F converts once.
    const asCelsius = isFahrenheitUnit(metric.unit)
      ? (parsed - 32) * (5 / 9)
      : parsed;

    const displayedNumber = convertCelsiusForDisplay(asCelsius, preference);
    if (displayedNumber === null) return { ...metric };

    const digits =
      Math.abs(displayedNumber) >= 100 ? 0 : 1;

    return {
      key: metric.key,
      display: displayedNumber.toFixed(digits),
      unit: targetSymbol,
    };
  });
}

export function applyTemperatureUnitToSnapshotModel(
  model: SensorSnapshotDisplayModel,
  options: ApplyTemperatureUnitOptions = {},
): SensorSnapshotDisplayModel {
  return {
    ...model,
    metrics: applyTemperatureUnitToSnapshotMetrics(model.metrics, options),
  };
}
