import { beforeEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SensorSnapshotCard from "@/components/sensor/SensorSnapshotCard";
import type { SensorSnapshot } from "@/lib/sensor/sensorSnapshotFreshnessRules";
import { saveTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

const NOW = Date.parse("2026-06-26T12:00:00Z");

beforeEach(() => {
  window.localStorage.clear();
});

function make(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "manual",
    captured_at: "2026-06-26T11:50:00Z",
    tent_id: "tent-1",
    metrics: { temp_f: 75, rh: 55 },
    ...overrides,
  };
}

describe("SensorSnapshotCard", () => {
  it("labels demo snapshot as sample/demo, not live", () => {
    render(
      <SensorSnapshotCard snapshot={make({ source: "demo" })} classifyOptions={{ now: NOW }} />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.getAttribute("data-source")).toBe("demo");
    expect(card.getAttribute("data-degraded")).toBe("true");
    expect(screen.getByTestId("sensor-snapshot-card-demo-notice").textContent).toMatch(
      /sample|demo/i,
    );
  });

  it("shows warnings for suspicious metrics", () => {
    render(
      <SensorSnapshotCard
        snapshot={make({ metrics: { temp_f: 25, rh: 0, ec: 1450 } })}
        classifyOptions={{ now: NOW }}
      />,
    );
    expect(
      screen.getByTestId("sensor-snapshot-card-warning-temp_f_looks_celsius"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sensor-snapshot-card-warning-humidity_stuck_0")).toBeInTheDocument();
    expect(
      screen.getByTestId("sensor-snapshot-card-warning-ec_likely_microsiemens"),
    ).toBeInTheDocument();
  });

  it("renders Fahrenheit source data in the saved Celsius preference", () => {
    saveTemperatureUnitPreference("celsius");
    render(
      <SensorSnapshotCard
        snapshot={make({ metrics: { temp_f: 77, rh: 55 } })}
        classifyOptions={{ now: NOW }}
      />,
    );
    expect(screen.getByTestId("sensor-snapshot-card-metric-temp_f")).toHaveTextContent("25.0°C");
  });

  it("invalid snapshot is degraded and never says healthy", () => {
    render(
      <SensorSnapshotCard snapshot={make({ captured_at: null })} classifyOptions={{ now: NOW }} />,
    );
    const card = screen.getByTestId("sensor-snapshot-card");
    expect(card.getAttribute("data-freshness")).toBe("invalid");
    expect(card.textContent?.toLowerCase()).not.toContain("healthy");
  });

  it("source files contain no automation/device-control language", () => {
    const files = [
      "src/components/sensor/SensorSourceBadge.tsx",
      "src/components/sensor/SensorSnapshotCard.tsx",
    ];
    const forbidden = [
      /\bautopilot\b/i,
      /\bauto[ _-]?execute\b/i,
      /\bfake live\b/i,
      /service_role/i,
      /\bdevice[ _-]?control\b/i,
    ];
    for (const file of files) {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const pattern of forbidden) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
