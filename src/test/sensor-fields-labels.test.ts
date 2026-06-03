import { describe, it, expect } from "vitest";
import {
  SENSOR_FIELD_LABELS,
  formatSensorFieldLabel,
} from "@/constants/sensorFields";

describe("sensorFields labels", () => {
  it("maps known snake_case keys to human labels", () => {
    expect(SENSOR_FIELD_LABELS.air_temp_c).toBe("Air temp");
    expect(SENSOR_FIELD_LABELS.humidity_pct).toBe("Humidity");
    expect(SENSOR_FIELD_LABELS.reservoir_ec_mscm).toBe("Reservoir EC");
    expect(SENSOR_FIELD_LABELS.reservoir_ph).toBe("Reservoir pH");
    expect(SENSOR_FIELD_LABELS.vpd_kpa).toBe("VPD");
  });

  it("never returns a label that contains an underscore_word pattern", () => {
    for (const label of Object.values(SENSOR_FIELD_LABELS)) {
      expect(label).not.toMatch(/_\w/);
    }
  });

  it("formatSensorFieldLabel falls back to Title Case for unknown keys", () => {
    expect(formatSensorFieldLabel("some_new_metric")).toBe("Some New Metric");
    expect(formatSensorFieldLabel(null)).toBe("Unknown");
    expect(formatSensorFieldLabel("")).toBe("Unknown");
    expect(formatSensorFieldLabel("some_new_metric")).not.toMatch(/_\w/);
  });
});
