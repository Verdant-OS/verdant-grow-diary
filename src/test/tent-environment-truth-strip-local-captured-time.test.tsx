/**
 * QA on production ebaf1b6a (reproduced 2/2): the tent page Environment card's
 * sensor truth strip read "Captured: 2026-10-20T20:29:48.579+00:00" — the raw
 * stored timestamptz. It must show the viewer's local time through the shared
 * helper used by #2270, #2313 and #2315.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SensorSnapshotTruthStrip from "@/components/SensorSnapshotTruthStrip";
import { buildSensorSnapshotReadModel } from "@/lib/sensors/sensorSnapshotReadModel";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorTruthAssessment } from "@/lib/sensorTruthRules";

const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

function snapshot(ts: string): SensorSnapshot {
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

function renderStrip(ts: string) {
  const snap = snapshot(ts);
  const truth: SensorTruthAssessment = {
    snapshot: snap,
    invalidFields: [],
    suspiciousFields: [],
    stale: false,
    hasInvalid: false,
    timestampInvalid: false,
    reasonChips: [],
    reasonCodes: [],
  };
  const model = buildSensorSnapshotReadModel({
    snapshot: snap,
    truth,
    now: Date.parse("2026-10-20T20:35:00Z"),
  });
  return render(<SensorSnapshotTruthStrip model={model} testId="truth-strip" />);
}

describe("tent Environment card truth strip — captured time in local time", () => {
  it("formats the stored +00:00 timestamptz shape as viewer-local time", () => {
    const { container } = renderStrip("2026-10-20T20:29:48.579+00:00");
    expect(screen.getByTestId("truth-strip-captured")).toHaveTextContent(
      "Captured: Oct 20, 2026, 3:29 PM",
    );
    expect(container.textContent ?? "").not.toMatch(RAW_ISO);
  });

  it("formats the Z shape the same way", () => {
    const { container } = renderStrip("2026-10-20T20:29:48.579Z");
    expect(screen.getByTestId("truth-strip-captured")).toHaveTextContent(
      "Captured: Oct 20, 2026, 3:29 PM",
    );
    expect(container.textContent ?? "").not.toMatch(RAW_ISO);
  });
});
