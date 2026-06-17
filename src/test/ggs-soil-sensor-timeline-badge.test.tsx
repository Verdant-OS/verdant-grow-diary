/**
 * ggs-soil-sensor-timeline-badge — Timeline + Evidence Drawer render
 * the canonical source badge for a GGS soil reading using the same
 * pipeline as every other sensor source. No GGS-specific badge code.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineSensorSourceBadge from "@/components/TimelineSensorSourceBadge";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";
import { deriveProviderLabel } from "@/constants/sensorProviderLabels";
import {
  GGS_SOIL_SENSOR_PROVIDER,
  normalizeGgsSoilSensorReading,
} from "@/lib/ggsSoilSensorReadingNormalizer";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const FRESH = "2026-06-17T11:59:30.000Z";

describe("GGS soil reading → canonical Timeline badge", () => {
  it("live GGS draft renders the live badge", () => {
    const draft = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 40, soil_temp_c: 22, soil_ec: 1.5 },
      { now: NOW },
    );
    const badge = classifyTimelineSensorSource({ rawSource: draft.source });
    render(<TimelineSensorSourceBadge badge={badge} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-live")).toBeInTheDocument();
  });

  it("manual GGS draft renders the manual badge", () => {
    const draft = normalizeGgsSoilSensorReading(
      { captured_at: FRESH, tent_id: "t", soil_moisture: 40, soil_temp_c: 22, soil_ec: 1.5 },
      { now: NOW, manualEntry: true },
    );
    const badge = classifyTimelineSensorSource({ rawSource: draft.source });
    render(<TimelineSensorSourceBadge badge={badge} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-manual")).toBeInTheDocument();
  });

  it("stale GGS draft renders the stale badge, never live", () => {
    const draft = normalizeGgsSoilSensorReading(
      {
        captured_at: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
        tent_id: "t",
        soil_moisture: 40,
        soil_temp_c: 22,
      },
      { now: NOW },
    );
    const badge = classifyTimelineSensorSource({ rawSource: draft.source });
    render(<TimelineSensorSourceBadge badge={badge} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-stale")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-sensor-source-badge-live")).toBeNull();
  });

  it("invalid GGS draft renders the invalid badge, never healthy", () => {
    const draft = normalizeGgsSoilSensorReading(
      { soil_moisture: 40 }, // no tent, no timestamp
      { now: NOW },
    );
    const badge = classifyTimelineSensorSource({ rawSource: draft.source });
    render(<TimelineSensorSourceBadge badge={badge} />);
    expect(screen.getByTestId("timeline-sensor-source-badge-invalid")).toBeInTheDocument();
  });

  it("provider chip uses the existing Spider Farmer GGS label", () => {
    expect(deriveProviderLabel(GGS_SOIL_SENSOR_PROVIDER)).toBe("Spider Farmer GGS");
  });
});
