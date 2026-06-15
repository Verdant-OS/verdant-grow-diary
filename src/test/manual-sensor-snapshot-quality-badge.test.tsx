import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ManualSensorSnapshotQualityBadge from "@/components/ManualSensorSnapshotQualityBadge";
import { evaluateManualSensorSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");

describe("ManualSensorSnapshotQualityBadge", () => {
  it("renders summary, source label, and reasons for a CSV history reading", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(
      {
        source: "csv",
        captured_at: new Date(NOW - 60 * 60 * 1000).toISOString(),
        temperature_c: 23,
        humidity_pct: 55,
      },
      { nowMs: NOW },
    );
    render(<ManualSensorSnapshotQualityBadge evaluation={evaluation} />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText(/Source: csv/i)).toBeInTheDocument();
    expect(screen.getByText(/CSV history only/i)).toBeInTheDocument();
  });

  it("renders Usable for a fresh manual reading", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: new Date(NOW - 60 * 1000).toISOString(),
        temperature_c: 24,
        humidity_pct: 55,
        vpd_kpa: 1.1,
        ph: 6.2,
      },
      { nowMs: NOW },
    );
    render(<ManualSensorSnapshotQualityBadge evaluation={evaluation} />);
    expect(screen.getByText("Usable current reading")).toBeInTheDocument();
    expect(screen.getByText(/Source: manual/i)).toBeInTheDocument();
  });

  it("renders Invalid for an out-of-range reading and lists a reason", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: new Date(NOW - 60 * 1000).toISOString(),
        ph: 13,
      },
      { nowMs: NOW },
    );
    render(<ManualSensorSnapshotQualityBadge evaluation={evaluation} />);
    expect(screen.getByText("Invalid reading")).toBeInTheDocument();
    expect(screen.getByText(/pH outside realistic range/i)).toBeInTheDocument();
  });

  it("renders Missing when no snapshot is supplied", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(null, {
      nowMs: NOW,
    });
    render(<ManualSensorSnapshotQualityBadge evaluation={evaluation} />);
    expect(screen.getByText("Missing current reading")).toBeInTheDocument();
  });

  it("never renders raw payload or private fields", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: new Date(NOW - 60 * 1000).toISOString(),
        temperature_c: 24,
        humidity_pct: 55,
      },
      { nowMs: NOW },
    );
    const { container } = render(
      <ManualSensorSnapshotQualityBadge evaluation={evaluation} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/token|secret|api[_-]?key/i);
    expect(text).not.toMatch(/\{\s*"/); // no fixture JSON
  });

  it("exposes a screen-reader status line", () => {
    const evaluation = evaluateManualSensorSnapshotQuality(
      {
        source: "manual",
        captured_at: new Date(NOW - 60 * 1000).toISOString(),
        temperature_c: 24,
        humidity_pct: 55,
      },
      { nowMs: NOW },
    );
    render(<ManualSensorSnapshotQualityBadge evaluation={evaluation} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Usable current reading/);
    expect(status.textContent).toMatch(/Source: manual/);
  });
});
