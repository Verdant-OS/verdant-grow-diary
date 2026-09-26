import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SensorSourceBadge from "@/components/SensorSourceBadge";
import CanonicalSensorSourceBadge from "@/components/sensor/SensorSourceBadge";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import { resolveSensorSourceLabel } from "@/lib/sensorSourceLabelRules";
import {
  formatSensorSourceDisplayWithProvenance,
  resolveSensorSourceDisplayCanon,
} from "@/lib/sensorSourceDisplayCanon";
import type { SensorReadingSource } from "@/mock";

describe("inherited object keys are never sensor sources", () => {
  it.each(Object.getOwnPropertyNames(Object.prototype))("rejects the inherited token %s", (raw) => {
    expect(normalizeSensorSource(raw)).toBe("invalid");
    expect(resolveSensorSourceDisplayCanon(raw)).toMatchObject({
      canonical: "invalid",
      sourceLabel: "Invalid reading",
      provenanceLabel: "External ingest",
      isHealthyLive: false,
    });
    expect(formatSensorSourceDisplayWithProvenance(raw)).toBe("Invalid reading · External ingest");
    expect(formatSensorSourceLabel({ source: raw })).toBe("Invalid reading");
    expect(
      resolveSensorSourceLabel({ source: raw as SensorReadingSource, vendor: "ecowitt" }),
    ).toEqual({
      label: "Unknown",
      vendor: "ecowitt",
      vendorPromoted: false,
    });
  });

  it.each([" CONSTRUCTOR ", " __PROTO__ "])("rejects normalized inherited token %s", (raw) => {
    expect(normalizeSensorSource(raw)).toBe("invalid");
    expect(resolveSensorSourceDisplayCanon(raw).sourceLabel).toBe("Invalid reading");
    expect(resolveSensorSourceDisplayCanon(raw).isHealthyLive).toBe(false);
  });

  it.each(["constructor", "__proto__", "toString"])(
    "renders canonical source %s as Invalid reading with external provenance",
    (raw) => {
      render(<CanonicalSensorSourceBadge source={raw} />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveTextContent(/^Invalid reading$/);
      expect(badge).toHaveAttribute("data-source", "invalid");
      expect(badge).toHaveAttribute("data-provenance", "External ingest");
      expect(badge).toHaveAttribute(
        "aria-label",
        "Sensor source: Invalid reading. Provenance: External ingest",
      );
      expect(badge.className).not.toContain("emerald");
    },
  );

  it.each(["constructor", "__proto__", "toString"])(
    "renders an honest review badge for malformed source %s without throwing",
    (raw) => {
      render(<SensorSourceBadge source={raw as SensorReadingSource} status="needs_review" />);
      expect(screen.getByTestId("sensor-source-badge-source")).toHaveTextContent(/^Unknown$/);
      expect(screen.getByTestId("sensor-source-badge-status")).toHaveTextContent(/^Needs review$/);
      expect(screen.getByTestId("sensor-source-badge")).toHaveAttribute("data-severity", "warning");
      expect(screen.getByTestId("sensor-source-badge")).toHaveAttribute(
        "data-vendor-promoted",
        "false",
      );
    },
  );
});
