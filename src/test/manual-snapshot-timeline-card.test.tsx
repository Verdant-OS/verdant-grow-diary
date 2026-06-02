/**
 * ManualSnapshotTimelineCard — presenter rendering.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  buildManualSnapshotTimelineCard,
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotRecord,
} from "@/lib/manualSensorSnapshotViewModel";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";

function mkCard(overrides: Partial<ManualSnapshotRecord> = {}) {
  const rec: ManualSnapshotRecord = {
    id: overrides.id ?? "snap-1",
    capturedAt: overrides.capturedAt ?? "2026-01-01T10:00:00.000Z",
    tentId: overrides.tentId ?? "tent-1",
    plantId: overrides.plantId ?? "plant-1",
    notes: overrides.notes ?? null,
    validation:
      overrides.validation ??
      validateManualSnapshot({ airTemp: 75, airTempUnit: "F", humidityPct: 55 }),
  };
  return buildManualSnapshotTimelineCard(rec);
}

describe("ManualSnapshotTimelineCard", () => {
  it("renders the manual snapshot title and source label", () => {
    render(<ManualSnapshotTimelineCard card={mkCard()} />);
    const card = screen.getByTestId("manual-snapshot-timeline-card");
    expect(within(card).getByText(MANUAL_SNAPSHOT_CARD_TITLE)).toBeInTheDocument();
    expect(within(card).getByText(MANUAL_SNAPSHOT_SOURCE_LABEL)).toBeInTheDocument();
    expect(card.getAttribute("data-source")).toBe("manual");
  });

  it("never includes live / synced / connected / imported language", () => {
    render(<ManualSnapshotTimelineCard card={mkCard()} />);
    const text = screen
      .getByTestId("manual-snapshot-timeline-card")
      .textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bsynced\b/);
    expect(text).not.toMatch(/\bconnected\b/);
    expect(text).not.toMatch(/\bimported\b/);
  });

  it("shows captured_at and readings", () => {
    render(<ManualSnapshotTimelineCard card={mkCard()} />);
    expect(
      screen.getByTestId("manual-snapshot-timeline-card-captured-at"),
    ).toHaveTextContent("2026-01-01T10:00:00.000Z");
    expect(
      screen.getAllByTestId("manual-snapshot-timeline-card-reading").length,
    ).toBeGreaterThan(0);
  });

  it("renders validation warnings when present", () => {
    const card = mkCard({
      validation: validateManualSnapshot({
        airTemp: 24, // suspicious — looks like Celsius in the °F field
        airTempUnit: "F",
        humidityPct: 50,
      }),
    });
    render(<ManualSnapshotTimelineCard card={card} />);
    expect(
      screen.getAllByTestId("manual-snapshot-timeline-card-warning").length,
    ).toBeGreaterThan(0);
  });

  it("renders notes when provided", () => {
    render(
      <ManualSnapshotTimelineCard
        card={mkCard({ notes: "tent at lights-on" })}
      />,
    );
    expect(
      screen.getByTestId("manual-snapshot-timeline-card-notes"),
    ).toHaveTextContent("tent at lights-on");
  });
});
