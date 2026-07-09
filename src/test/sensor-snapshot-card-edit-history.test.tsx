/**
 * SensorSnapshotCard — manual snapshot edit history rendering.
 *
 * Guarantees:
 *  - When source=manual and no edits provided, a clean empty state is shown.
 *  - When edits are provided, each renders changed_at, old→new per field,
 *    optional reason, and a "manual → manual" source label.
 *  - Non-manual snapshots do NOT render the edit history block.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SensorSnapshotCard, {
  type SensorSnapshotEditHistoryEntry,
} from "@/components/sensor/SensorSnapshotCard";
import type { SensorSnapshot } from "@/lib/sensor/sensorSnapshotFreshnessRules";

const ISO = "2026-07-01T12:00:00.000Z";
const now = new Date(ISO).getTime();

const MANUAL_SNAP: SensorSnapshot = {
  source: "manual",
  captured_at: ISO,
  tent_id: "tent-1",
  metrics: { temp_f: 75, rh: 55 },
};

const LIVE_SNAP: SensorSnapshot = {
  source: "live",
  captured_at: ISO,
  tent_id: "tent-1",
  metrics: { temp_f: 75, rh: 55 },
};

describe("SensorSnapshotCard edit history", () => {
  it("renders empty state for manual with no edits", () => {
    const { getByTestId, queryByTestId } = render(
      <SensorSnapshotCard snapshot={MANUAL_SNAP} classifyOptions={{ now }} />,
    );
    expect(getByTestId("sensor-snapshot-card-edit-history")).toBeInTheDocument();
    expect(getByTestId("sensor-snapshot-card-edit-history-empty")).toBeInTheDocument();
    expect(queryByTestId("sensor-snapshot-card-edit-history-list")).toBeNull();
  });

  it("does NOT render edit history block for non-manual snapshots", () => {
    const { queryByTestId } = render(
      <SensorSnapshotCard snapshot={LIVE_SNAP} classifyOptions={{ now }} />,
    );
    expect(queryByTestId("sensor-snapshot-card-edit-history")).toBeNull();
  });

  it("renders edit entries with old→new per field, reason, and manual→manual source", () => {
    const edits: SensorSnapshotEditHistoryEntry[] = [
      {
        id: "e1",
        changed_at: ISO,
        changed_fields: ["humidity_pct", "temperature_c"],
        old_values: { humidity_pct: 55, temperature_c: 24 },
        new_values: { humidity_pct: 58, temperature_c: 25 },
        change_reason: "Recalibrated hygrometer",
        source_before: "manual",
        source_after: "manual",
      },
    ];
    const { getByTestId } = render(
      <SensorSnapshotCard
        snapshot={MANUAL_SNAP}
        classifyOptions={{ now }}
        edits={edits}
      />,
    );
    const entry = getByTestId("sensor-snapshot-card-edit-history-entry");
    expect(entry.getAttribute("data-source-before")).toBe("manual");
    expect(entry.getAttribute("data-source-after")).toBe("manual");
    expect(getByTestId("sensor-snapshot-card-edit-history-entry-source").textContent ?? "")
      .toMatch(/manual\s*→\s*manual/i);
    const temp = getByTestId("sensor-snapshot-card-edit-history-field-temperature_c");
    expect(temp.textContent ?? "").toMatch(/24\s*→\s*25/);
    const hum = getByTestId("sensor-snapshot-card-edit-history-field-humidity_pct");
    expect(hum.textContent ?? "").toMatch(/55\s*→\s*58/);
    expect(getByTestId("sensor-snapshot-card-edit-history-entry-reason").textContent ?? "")
      .toMatch(/Recalibrated hygrometer/);
  });
});
