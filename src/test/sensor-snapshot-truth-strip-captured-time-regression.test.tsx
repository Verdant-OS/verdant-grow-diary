/**
 * Regression guard for #2329 / SensorSnapshotTruthStrip: captured time must use
 * formatSnapshotCapturedAt when capturedAt is set, and safe fallbacks otherwise.
 * Complements tent-environment-truth-strip-local-captured-time.test.tsx (happy paths).
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SensorSnapshotTruthStrip from "@/components/SensorSnapshotTruthStrip";
import { defaultAlertTimestampFormatter } from "@/lib/alertReasonDisplayRules";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

const PRODUCTION_ISO = "2026-10-20T20:29:48.579+00:00";
const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "America/Chicago";
  // Guard, not a test: the cases below assume Chicago is UTC-5 in October.
  expect(new Date(PRODUCTION_ISO).getTimezoneOffset()).toBe(300);
});

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function liveSnapshot(ts: string): SensorSnapshot {
  return {
    source: "live",
    ts,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 30,
    soil_ec: 1.2,
    soil_temp: 22,
    ppfd: null,
    device_id: "ecowitt-WH45",
    csvVendor: null,
  };
}

describe("SensorSnapshotTruthStrip captured time — regression edges", () => {
  it("uses the shared formatter output, not the read model's raw ISO label", () => {
    const snap = liveSnapshot(PRODUCTION_ISO);
    const model = buildSensorSnapshotReadModel({
      snapshot: snap,
      now: Date.parse("2026-10-20T20:35:00Z"),
    });
    expect(model.capturedAtLabel).toContain(PRODUCTION_ISO);

    const local = defaultAlertTimestampFormatter(new Date(PRODUCTION_ISO));
    const { container } = render(<SensorSnapshotTruthStrip model={model} testId="truth-strip" />);
    expect(screen.getByTestId("truth-strip-captured")).toHaveTextContent(`Captured: ${local}`);
    expect(container.textContent ?? "").not.toMatch(RAW_ISO);
    expect(container.textContent ?? "").not.toContain("+00:00");
  });

  it("falls back to capturedAtLabel when capturedAt is null (missing snapshot)", () => {
    const model = buildSensorSnapshotReadModel({
      snapshot: null,
      now: Date.parse("2026-10-20T20:35:00Z"),
    });
    expect(model.capturedAt).toBeNull();

    const { container } = render(<SensorSnapshotTruthStrip model={model} testId="truth-strip" />);
    expect(screen.getByTestId("truth-strip-captured")).toHaveTextContent("Captured: unknown");
    expect(container.textContent ?? "").not.toMatch(RAW_ISO);
  });

  it("never shows Invalid Date for unparseable capturedAt", () => {
    const badTs = "not-a-date";
    const snap = liveSnapshot(badTs);
    const model = buildSensorSnapshotReadModel({
      snapshot: snap,
      now: Date.parse("2026-10-20T20:35:00Z"),
    });

    const { container } = render(<SensorSnapshotTruthStrip model={model} testId="truth-strip" />);
    expect(screen.getByTestId("truth-strip-captured")).toHaveTextContent(`Captured: ${badTs}`);
    expect(container.textContent ?? "").not.toContain("Invalid Date");
  });
});
