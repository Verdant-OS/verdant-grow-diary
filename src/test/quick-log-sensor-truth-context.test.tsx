/**
 * Quick Log Sensor Truth Context v1 — pre-save copy & safety contract.
 *
 * Verifies that the manual sensor snapshot card (used by /daily-check
 * "Add sensor snapshot" and /sensors) surfaces explicit sensor-truth
 * context BEFORE saving:
 *   - "Manual snapshot" + "manual, not live sensor data"
 *   - "Not live device control."
 *   - "Not a plant-health diagnosis."
 *   - Missing readings → "Missing readings will stay unknown, not healthy."
 *
 * Also static-asserts that copy never claims "healthy" or "live" for
 * unknown data.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import {
  MANUAL_SENSOR_TRUTH_TITLE,
  MANUAL_SENSOR_TRUTH_SOURCE_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
  MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE,
} from "@/constants/manualSensorTruthCopy";

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: "11111111-1111-1111-1111-111111111111", name: "Tent A" }]}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Quick Log Sensor Truth Context v1 — pre-save copy", () => {
  it("shows manual snapshot title and 'manual, not live sensor data' source line", () => {
    renderCard();
    const helper = screen.getByTestId("manual-reading-helper");
    expect(helper.textContent ?? "").toMatch(/manual snapshot/i);
    expect(helper.textContent ?? "").toMatch(/manual, not live sensor data/i);
  });

  it("shows 'Not live device control.'", () => {
    renderCard();
    expect(
      screen.getByTestId("manual-reading-helper-not-device-control").textContent,
    ).toMatch(/not live device control/i);
  });

  it("shows 'Not a plant-health diagnosis.'", () => {
    renderCard();
    expect(
      screen.getByTestId("manual-reading-helper-not-diagnosis").textContent,
    ).toMatch(/not a plant-health diagnosis/i);
  });

  it("shows missing-readings notice when no metrics are entered", () => {
    renderCard();
    const el = screen.getByTestId("manual-reading-helper-missing-readings");
    expect(el.textContent ?? "").toMatch(/missing readings will stay unknown, not healthy/i);
  });

  it("never describes missing/unknown data as healthy or live", () => {
    renderCard();
    const helper = screen.getByTestId("manual-reading-helper").textContent ?? "";
    expect(helper).not.toMatch(/\bhealthy\b/i);
    // "not live" is allowed; bare "live sensor" or "live data" is not.
    expect(helper).not.toMatch(/(^|[^-])\blive sensor data\b(?!.*not)/i);
  });
});

describe("Quick Log Sensor Truth Context v1 — static copy safety", () => {
  const ALL = [
    MANUAL_SENSOR_TRUTH_TITLE,
    MANUAL_SENSOR_TRUTH_SOURCE_LINE,
    MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
    MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
    MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE,
  ].join(" | ");

  it("never claims plants are healthy", () => {
    expect(ALL).not.toMatch(/\bhealthy\b/i);
  });

  it("never relabels manual as live", () => {
    expect(MANUAL_SENSOR_TRUTH_SOURCE_LINE).toMatch(/manual, not live/i);
  });

  it("explicitly disclaims device control", () => {
    expect(MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE).toMatch(/not live device control/i);
  });

  it("explicitly disclaims diagnosis", () => {
    expect(MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE).toMatch(/not a plant-health diagnosis/i);
  });
});
