/**
 * Render-time gate for Quick Log water temperature on Water and Feed.
 * The grower types in their unit. The canonical band stays -10..60 °C,
 * applied after the same conversion the save seam uses.
 * Pure: no React, no I/O.
 */
import { isTemperatureValid } from "./sensorReadingNormalizationRules";
import { celsiusToFahrenheit, type TemperatureUnitPreference } from "./temperatureUnitPreference";
import { convertTypedTemperatureToCelsius } from "./quickLogTypedTemperatureRules";

const WATER_TEMPERATURE_RANGE_MESSAGE_CELSIUS =
  "Water temperature must be between -10 and 60 °C." as const;

/** Water-temperature copy in the grower's unit (canonical band -10..60 °C). */
export function quickLogWaterTemperatureRangeMessage(unit: TemperatureUnitPreference): string {
  switch (unit) {
    case "fahrenheit": {
      const low = formatFahrenheitBound(celsiusToFahrenheit(-10));
      const high = formatFahrenheitBound(celsiusToFahrenheit(60));
      return `Water temperature must be between ${low} and ${high} °F.`;
    }
    case "celsius":
      return WATER_TEMPERATURE_RANGE_MESSAGE_CELSIUS;
    default: {
      const exhaustive: never = unit;
      return exhaustive;
    }
  }
}

function formatFahrenheitBound(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export interface QuickLogWaterTemperatureGate {
  blocksSave: boolean;
  message: string | null;
}

/** Blank is allowed. A present value must convert and fall inside the band. */
export function assessQuickLogWaterTemperatureInput(input: {
  waterTemperatureInput: string | null | undefined;
  temperatureUnit: TemperatureUnitPreference;
}): QuickLogWaterTemperatureGate {
  const temperature = convertTypedTemperatureToCelsius(
    input.waterTemperatureInput,
    input.temperatureUnit,
  );
  if (temperature.kind === "empty") return { blocksSave: false, message: null };
  if (temperature.kind === "unconvertible" || !isTemperatureValid(temperature.value)) {
    return {
      blocksSave: true,
      message: quickLogWaterTemperatureRangeMessage(input.temperatureUnit),
    };
  }
  return { blocksSave: false, message: null };
}
