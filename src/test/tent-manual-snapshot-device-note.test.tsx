/**
 * The tent "Recent manual snapshots" list shows the optional device note
 * already stored on sensor_readings.device_id, with the manual: prefix removed.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import { PPFD_LABEL, PPFD_UNIT_LONG } from "@/lib/ppfdRules";
import type { SensorReadingRow } from "@/lib/db";

const TENT = "tent-note";
const TS = "2026-10-09T15:10:00.000Z";

function row(
  metric: string,
  value: number,
  deviceId: string | null,
  source = "manual",
): SensorReadingRow {
  return {
    id: `${metric}-${deviceId ?? "none"}`,
    ts: TS,
    metric,
    value,
    source,
    tent_id: TENT,
    plant_id: null,
    user_id: "u",
    created_at: TS,
    confidence: null,
    raw_payload: null,
    captured_at: TS,
    device_id: deviceId,
  } as unknown as SensorReadingRow;
}

describe("buildManualSnapshotHistoryList — device note", () => {
  it("strips the manual: prefix and keeps one note for the snapshot", () => {
    const [entry] = buildManualSnapshotHistoryList(
      [
        {
          ts: TS,
          metric: "temperature_c",
          value: 24,
          source: "manual",
          tent_id: TENT,
          device_id: "manual:Handheld meter",
        },
        {
          ts: TS,
          metric: "ppfd",
          value: 650,
          source: "manual",
          tent_id: TENT,
          device_id: "manual:Other meter",
        },
      ],
      { tentId: TENT },
    );
    expect(entry.deviceNote).toBe("Handheld meter");
    expect(entry.deviceNote).not.toContain("manual:");
  });

  it("omits the note when device_id is absent or is not a manual note", () => {
    const [blank] = buildManualSnapshotHistoryList(
      [
        {
          ts: TS,
          metric: "ppfd",
          value: 650,
          source: "manual",
          tent_id: TENT,
          device_id: null,
        },
      ],
      { tentId: TENT },
    );
    expect(blank.deviceNote).toBeNull();

    const [bridge] = buildManualSnapshotHistoryList(
      [
        {
          ts: TS,
          metric: "ppfd",
          value: 650,
          source: "manual",
          tent_id: TENT,
          device_id: "ecowitt-gateway",
        },
      ],
      { tentId: TENT },
    );
    expect(bridge.deviceNote).toBeNull();
  });
});

describe("TentManualSnapshotHistoryList — PPFD and device note", () => {
  it("renders the PPFD chip and the stripped device note", () => {
    render(
      <TentManualSnapshotHistoryList
        tentId={TENT}
        readings={[
          row("temperature_c", 24, "manual:Handheld meter"),
          row("ppfd", 650, "manual:Handheld meter"),
        ]}
        readStatus="success"
        onRetry={() => {}}
      />,
    );
    const item = screen.getByTestId("tent-manual-snapshot-history-item");
    const ppfd = within(item)
      .getAllByTestId("tent-manual-snapshot-history-metric")
      .find((node) => node.getAttribute("data-metric") === "ppfd");
    expect(ppfd).toBeDefined();
    expect(ppfd).toHaveTextContent(PPFD_LABEL);
    expect(ppfd).toHaveTextContent(`650 ${PPFD_UNIT_LONG}`);
    expect(within(item).getByTestId("tent-manual-snapshot-history-device-note")).toHaveTextContent(
      "Handheld meter",
    );
    expect(
      within(item).getByTestId("tent-manual-snapshot-history-device-note"),
    ).not.toHaveTextContent("manual:");
    expect(within(item).getByTestId("tent-manual-snapshot-history-source")).toHaveTextContent(
      "Manual",
    );
  });

  it("does not render a device note when the reading has none", () => {
    render(
      <TentManualSnapshotHistoryList
        tentId={TENT}
        readings={[row("ppfd", 650, null)]}
        readStatus="success"
        onRetry={() => {}}
      />,
    );
    expect(
      screen.queryByTestId("tent-manual-snapshot-history-device-note"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("tent-manual-snapshot-history-metric")).toHaveAttribute(
      "data-metric",
      "ppfd",
    );
  });

  it("renders an implausible PPFD as an invalid chip, not a healthy metric", () => {
    render(
      <TentManualSnapshotHistoryList
        tentId={TENT}
        readings={[row("ppfd", -5, "manual:Quantum meter")]}
        readStatus="success"
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByTestId("tent-manual-snapshot-history-metric")).not.toBeInTheDocument();
    const invalid = screen.getByTestId("tent-manual-snapshot-history-invalid-chip");
    expect(invalid).toHaveAttribute("data-metric", "ppfd");
    expect(invalid).toHaveTextContent("Invalid PPFD");
    expect(invalid).not.toHaveTextContent("-5");
    expect(screen.getByTestId("tent-manual-snapshot-history-device-note")).toHaveTextContent(
      "Quantum meter",
    );
  });
});
