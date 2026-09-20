import type { QueryClient } from "@tanstack/react-query";

/** A correction changes historical evidence, not its original capture time. */
export function invalidateManualSensorCorrectionReaders(client: QueryClient): void {
  for (const queryKey of [
    ["grow", "sensors"],
    ["sensor_readings"],
    ["latest-sensor-snapshot"],
    ["plant-tent-environment"],
    ["environment-trends"],
    ["diary-range-report"],
    ["sensor", "latest"],
    ["reports-hub"],
    ["post-grow-report"],
  ])
    void client.invalidateQueries({ queryKey });
}
