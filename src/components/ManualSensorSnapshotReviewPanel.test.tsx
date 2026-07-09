/**
 * Presenter tests for ManualSensorSnapshotReviewPanel.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ManualSensorSnapshotReviewPanel from "@/components/ManualSensorSnapshotReviewPanel";
import type { SensorSnapshotReviewResult } from "@/lib/sensorSnapshotReviewRules";

afterEach(() => cleanup());

function baseResult(overrides: Partial<SensorSnapshotReviewResult> = {}): SensorSnapshotReviewResult {
  return {
    canSave: true,
    source: "manual",
    confidence: "high",
    findings: [],
    normalizedPreview: {
      tempF: 75,
      humidity: 55,
      vpdKpa: 1.1,
      capturedAt: "2026-07-09T11:55:00.000Z",
      tentId: "tent-1",
      plantId: "plant-1",
    },
    ...overrides,
  };
}

describe("ManualSensorSnapshotReviewPanel", () => {
  it("renders a 'manual' source chip and never the string 'live'", () => {
    render(<ManualSensorSnapshotReviewPanel result={baseResult()} />);
    expect(screen.getByTestId("snapshot-source-chip")).toHaveTextContent(/^manual$/);
    const panel = screen.getByTestId("manual-sensor-snapshot-review-panel");
    expect(panel.getAttribute("data-source")).toBe("manual");
    expect(panel.textContent ?? "").not.toMatch(/\blive\b/i);
  });

  it("uses data-can-save='true' when no blockers and 'false' when blocked", () => {
    const { rerender } = render(
      <ManualSensorSnapshotReviewPanel result={baseResult()} />,
    );
    expect(
      screen.getByTestId("manual-sensor-snapshot-review-panel").getAttribute("data-can-save"),
    ).toBe("true");
    expect(screen.getByTestId("snapshot-ready-status")).toHaveTextContent(/ready to save/i);

    rerender(
      <ManualSensorSnapshotReviewPanel
        result={baseResult({
          canSave: false,
          confidence: "low",
          findings: [
            {
              key: "humidity_out_of_range",
              severity: "blocker",
              label: "Humidity",
              message: "Humidity must be between 0% and 100%.",
            },
          ],
        })}
      />,
    );
    expect(
      screen.getByTestId("manual-sensor-snapshot-review-panel").getAttribute("data-can-save"),
    ).toBe("false");
    expect(screen.getByTestId("snapshot-ready-status")).toHaveTextContent(/fix blockers/i);
  });

  it("gives blocker findings role='alert' and warning findings role='status'", () => {
    render(
      <ManualSensorSnapshotReviewPanel
        result={baseResult({
          canSave: false,
          confidence: "low",
          findings: [
            {
              key: "humidity_out_of_range",
              severity: "blocker",
              label: "Humidity",
              message: "Humidity must be between 0% and 100%.",
            },
            {
              key: "vpd_high",
              severity: "warning",
              label: "VPD",
              message: "VPD 3 kPa is unusually high.",
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("snapshot-finding-humidity_out_of_range")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByTestId("snapshot-finding-vpd_high")).toHaveAttribute("role", "status");
  });

  it("only lists preview fields that are present (nulls hidden)", () => {
    render(
      <ManualSensorSnapshotReviewPanel
        result={baseResult({
          normalizedPreview: {
            tempF: 75,
            humidity: null,
            vpdKpa: null,
            co2Ppm: 850,
            capturedAt: "2026-07-09T11:55:00.000Z",
            tentId: "tent-1",
          },
        })}
      />,
    );
    expect(screen.getByTestId("snapshot-preview-tempF")).toBeInTheDocument();
    expect(screen.getByTestId("snapshot-preview-co2Ppm")).toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-preview-humidity")).not.toBeInTheDocument();
    expect(screen.queryByTestId("snapshot-preview-vpdKpa")).not.toBeInTheDocument();
  });
});
