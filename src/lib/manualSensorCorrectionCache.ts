import type { QueryClient } from "@tanstack/react-query";

/** React Query key prefixes invalidated after a confirmed manual correction. */
export const MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES = [
  ["grow", "sensors"],
  ["sensor_readings"],
  ["latest-sensor-snapshot"],
  ["plant-tent-environment"],
  ["environment-trends"],
  ["diary-range-report"],
  ["sensor", "latest"],
  ["reports-hub"],
  ["post-grow-report"],
] as const;

/** A correction changes historical evidence, not its original capture time. */
export function invalidateManualSensorCorrectionReaders(client: QueryClient): void {
  for (const queryKey of MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES)
    void client.invalidateQueries({ queryKey });
}
