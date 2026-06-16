// Local read-only EcoWitt evidence samples for the operator tent preview.
// SAFE: contains NO real PASSKEY, MAC, station ID, token, password, or IP.
// Used only by the read-only preview page. Never sent to any backend.

export interface EcowittPreviewSample {
  key: "valid" | "degraded" | "invalid";
  label: string;
  description: string;
  /** Payload age in ms relative to "now" when normalizing. */
  captured_age_ms: number;
  payload: Readonly<Record<string, unknown>>;
}

export const ECOWITT_PREVIEW_SAMPLES: readonly EcowittPreviewSample[] = [
  {
    key: "valid",
    label: "Valid EcoWitt sample",
    description: "Fresh payload with all three tents reporting plausible values.",
    captured_age_ms: 30_000,
    payload: Object.freeze({
      // Flower Tent
      temp1f: 82.04,
      humidity1: 46,
      tf_ch1: 69.98,
      soilmoisture3: 80,
      soilmoisture2: 69,
      // Seedling Tent
      temp2f: 74.5,
      humidity2: 58,
      // Vegetation Tent
      temp3f: 78.1,
      humidity3: 52,
      soilmoisture1: 41,
      // Lung Room — NOT a tent source in this slice
      tempinf: 72,
      humidityin: 50,
    }),
  },
  {
    key: "degraded",
    label: "Degraded EcoWitt sample",
    description:
      "Stale capture and a missing humidity channel for one tent.",
    // 1 hour old → trips freshness rule.
    captured_age_ms: 60 * 60 * 1000,
    payload: Object.freeze({
      temp1f: 81.2,
      humidity1: 47,
      // tf_ch1 missing → root-zone partial
      soilmoisture3: 78,
      // soilmoisture2 missing
      temp2f: 73.9,
      // humidity2 missing → Seedling degraded
      temp3f: 77.4,
      humidity3: 51,
      // soilmoisture1 missing → Veg root-zone missing
    }),
  },
  {
    key: "invalid",
    label: "Invalid EcoWitt sample",
    description:
      "Out-of-range humidity and soil moisture values that must not be classified as live.",
    captured_age_ms: 45_000,
    payload: Object.freeze({
      temp1f: 82.0,
      humidity1: 142, // out of range
      tf_ch1: 70.1,
      soilmoisture3: 80,
      soilmoisture2: 69,
      temp2f: 74.0,
      humidity2: 250, // out of range
      temp3f: 78.0,
      humidity3: 52,
      soilmoisture1: 250, // out of range
    }),
  },
];

export type EcowittPreviewSampleKey = (typeof ECOWITT_PREVIEW_SAMPLES)[number]["key"];

export function getEcowittPreviewSample(
  key: EcowittPreviewSampleKey,
): EcowittPreviewSample {
  const found = ECOWITT_PREVIEW_SAMPLES.find((s) => s.key === key);
  if (!found) {
    // Defensive: should never happen — types narrow this. Fall back to valid.
    return ECOWITT_PREVIEW_SAMPLES[0]!;
  }
  return found;
}
