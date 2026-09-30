/**
 * Resolved field contracts for the local EcoWitt HTTP listener.
 *
 * Python owns routing, source classification and delivery. These literal maps
 * let TypeScript tests detect drift without importing the listener or Flask.
 * No unverified EC/WH52 alias is enabled by this mirror.
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

export const ECOWITT_CUSTOM_HTTP_CHANNEL_FIELD_MAP = {
  air: { temp_f: "temp{channel}f", humidity_percent: "humidity{channel}" },
  in: { temp_f: "tempinf", humidity_percent: "humidityin" },
  soil: { soil_moisture_pct: "soilmoisture{channel}" },
  soil_temp: { soil_temp_f: "tf_ch{channel}" },
  co2: { co2_ppm: "co2", temp_f: "tf_co2", humidity_percent: "humi_co2" },
} as const;

export const ECOWITT_CUSTOM_HTTP_METRIC_UNITS = {
  temp_f: "F",
  humidity_percent: "%",
  soil_moisture_pct: "%",
  soil_temp_f: "F",
  soil_temp_c: "C",
  co2_ppm: "ppm",
  ec_ms_cm: "mS/cm",
} as const;
