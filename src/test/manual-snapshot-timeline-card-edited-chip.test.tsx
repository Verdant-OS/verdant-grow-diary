/**
 * ManualSnapshotTimelineCard — Edited chip.
 *
 * Guarantees:
 *  - When editSummary.count > 0 the chip renders with count + timestamp.
 *  - MANUAL badge and Captured prefix remain intact.
 *  - No chip renders when editSummary is undefined or count = 0.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import {
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotTimelineCard as CardModel,
} from "@/lib/manualSensorSnapshotViewModel";

const CARD: CardModel = {
  id: "card-1",
  title: MANUAL_SNAPSHOT_CARD_TITLE,
  source: "manual",
  sourceLabel: MANUAL_SNAPSHOT_SOURCE_LABEL,
  capturedAt: "2026-07-01T12:00:00.000Z",
  severity: "ok",
  tentId: "tent-1",
  plantId: null,
  isTentLevel: true,
  readings: [{ field: "air_temp_c", value: 24, unit: "°C", derived: false }],
  notes: null,
  errors: [],
  warnings: [],
};

describe("ManualSnapshotTimelineCard edited chip", () => {
  it("renders the Edited chip when editSummary.count > 0", () => {
    const { getByTestId } = render(
      <ManualSnapshotTimelineCard
        card={CARD}
        editSummary={{ count: 2, lastChangedAt: "2026-07-02T09:15:00.000Z" }}
      />,
    );
    const chip = getByTestId("manual-snapshot-timeline-card-edited-chip");
    expect(chip.getAttribute("data-edit-count")).toBe("2");
    expect(chip.textContent ?? "").toMatch(/Edited\s+/);
    expect(chip.textContent ?? "").toMatch(/2 fields/);
    // Source badge stays MANUAL.
    expect(
      getByTestId("manual-snapshot-timeline-card-source").textContent ?? "",
    ).toMatch(/manual/i);
    // Captured prefix stays visible.
    expect(
      getByTestId("manual-snapshot-timeline-card-captured-at").textContent ?? "",
    ).toMatch(/^Captured:/);
  });

  it("does not render the chip when editSummary is undefined or count = 0", () => {
    const { queryByTestId, rerender } = render(
      <ManualSnapshotTimelineCard card={CARD} />,
    );
    expect(queryByTestId("manual-snapshot-timeline-card-edited-chip")).toBeNull();
    rerender(
      <ManualSnapshotTimelineCard
        card={CARD}
        editSummary={{ count: 0, lastChangedAt: null }}
      />,
    );
    expect(queryByTestId("manual-snapshot-timeline-card-edited-chip")).toBeNull();
  });
});
