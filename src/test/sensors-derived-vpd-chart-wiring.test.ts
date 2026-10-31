/**
 * Wiring guard for PR #2485 / filming bug #6: derived VPD must not render an
 * empty chart when readingsByMetric.vpd is empty. Behavioral cases live in
 * sensors-derived-vpd-empty-chart.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SENSORS_SRC = readFileSync(resolve(__dirname, "../pages/Sensors.tsx"), "utf8");

describe("Sensors derived VPD chart wiring", () => {
  it("gates the metric chart on observed series length, not showChart alone", () => {
    expect(SENSORS_SRC).toMatch(/state\.showChart\s*&&\s*metricReadings\.length\s*>\s*0/);
  });

  it("names the no-recorded-VPD-history empty state for derived-only cards", () => {
    expect(SENSORS_SRC).toMatch(/isDerived\s*&&\s*state\.kind\s*===\s*["']derived["']/);
    expect(SENSORS_SRC).toContain(
      "No recorded VPD history to chart yet. The value below is calculated from temperature and humidity.",
    );
  });

  it("indexes VPD chart data from observed metrics only", () => {
    expect(SENSORS_SRC).toMatch(/indexSensorReadingsByObservedMetric\(filtered\)/);
    expect(SENSORS_SRC).toMatch(/const metricReadings = readingsByMetric\[m\.key\]/);
  });
});
