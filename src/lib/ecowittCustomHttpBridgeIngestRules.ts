/**
 * Resolved FIELD_MAP contract for the framework-free EcoWitt listener.
 *
 * Ingest behavior lives in tools/ecowitt-testbench/ecowitt_listener.py and is
 * covered by its Python tests. This module intentionally contains no second
 * source-normalization implementation.
 */

export type EcowittCustomHttpCanonicalMetric =
  "temp_f" | "humidity_percent" | "soil_moisture_pct" | "co2_ppm";

export const ECOWITT_CUSTOM_HTTP_FIELD_MAP: Readonly<
  Record<EcowittCustomHttpCanonicalMetric, readonly string[]>
> = {
  temp_f: ["temp1f", "tempf", "tempinf"],
  humidity_percent: ["humidity1", "humidity", "humidityin"],
  soil_moisture_pct: ["soilmoisture1", "soilmoisture2"],
  co2_ppm: ["co2", "co2in", "co2_ppm"],
} as const;
