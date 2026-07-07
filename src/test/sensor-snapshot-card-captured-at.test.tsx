/**
 * SensorSnapshotCard — captured timestamp display.
 *
 * Guarantees the Sensor Snapshot detail surface renders a
 * "Captured: <formatted>" line and exposes the ISO timestamp via
 * title + aria-label for audit/a11y. Source label stays MANUAL.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SensorSnapshotCard from "@/components/sensor/SensorSnapshotCard";
import type { SensorSnapshot } from "@/lib/sensor/sensorSnapshotFreshnessRules";

const ISO = "2026-07-01T12:00:00.000Z";

const SNAPSHOT: SensorSnapshot = {
  source: "manual",
  captured_at: ISO,
  tent_id: "tent-1",
  metrics: { temp_f: 75, rh: 55 },
};

describe("SensorSnapshotCard captured timestamp", () => {
  it("renders Captured: <formatted> and exposes ISO via title + aria-label", () => {
    const { getByTestId } = render(
      <SensorSnapshotCard
        snapshot={SNAPSHOT}
        classifyOptions={{ now: new Date(ISO) }}
      />,
    );
    const el = getByTestId("sensor-snapshot-card-captured-at");
    expect(el.textContent ?? "").toMatch(/^Captured:\s/);
    expect(el.getAttribute("title")).toBe(ISO);
    expect(el.getAttribute("aria-label") ?? "").toContain(ISO);
  });

  it("keeps MANUAL source label (never live)", () => {
    const { getByTestId } = render(
      <SensorSnapshotCard
        snapshot={SNAPSHOT}
        classifyOptions={{ now: new Date(ISO) }}
      />,
    );
    const card = getByTestId("sensor-snapshot-card");
    expect(card.getAttribute("data-source")).toBe("manual");
  });
});
