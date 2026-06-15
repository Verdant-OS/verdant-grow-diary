/**
 * ManualSnapshotTimelineCard — historical snapshot quality badge.
 *
 * Presenter checks:
 *  - badge renders inside the timeline card
 *  - historical helper copy is present
 *  - valid captured values render Historical usable reading
 *  - suspicious humidity renders Historical invalid reading with reason
 *  - no raw_payload, tokens, or fixture JSON leak into the card
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import {
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotTimelineCard as ManualSnapshotTimelineCardModel,
} from "@/lib/manualSensorSnapshotViewModel";

function baseCard(
  overrides: Partial<ManualSnapshotTimelineCardModel> = {},
): ManualSnapshotTimelineCardModel {
  return {
    id: "snap-1",
    title: MANUAL_SNAPSHOT_CARD_TITLE,
    capturedAt: "2026-06-08T12:00:00.000Z",
    sourceLabel: MANUAL_SNAPSHOT_SOURCE_LABEL,
    source: "manual",
    tentId: "tent-1",
    plantId: null,
    isTentLevel: true,
    notes: null,
    readings: [
      { field: "air_temp_c", value: 24, unit: "°C", derived: false },
      { field: "humidity_pct", value: 55, unit: "%", derived: false },
    ],
    severity: "ok",
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("ManualSnapshotTimelineCard — historical quality badge", () => {
  it("renders the historical quality badge with helper copy", () => {
    render(<ManualSnapshotTimelineCard card={baseCard()} />);
    const section = screen.getByTestId("manual-snapshot-timeline-card-quality");
    expect(
      within(section).getByText("Historical usable reading"),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/Historical reading — quality reflects captured values/i),
    ).toBeInTheDocument();
  });

  it("flags humidity stuck at 0% as historical invalid with reason", () => {
    render(
      <ManualSnapshotTimelineCard
        card={baseCard({
          readings: [
            { field: "humidity_pct", value: 0, unit: "%", derived: false },
          ],
        })}
      />,
    );
    const quality = screen.getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).toBe("invalid");
    expect(within(quality).getByText("Historical invalid reading")).toBeInTheDocument();
    expect(
      within(quality).getByText(/Humidity appears stuck at 0 or 100%/i),
    ).toBeInTheDocument();
  });

  it("does not leak raw_payload, tokens, or fixture JSON", () => {
    const { container } = render(
      <ManualSnapshotTimelineCard card={baseCard()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/token|secret|api[_-]?key/i);
    expect(text).not.toMatch(/\{\s*"/);
  });
});
