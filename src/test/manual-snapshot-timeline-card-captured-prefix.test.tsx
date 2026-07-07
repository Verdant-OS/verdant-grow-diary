/**
 * ManualSnapshotTimelineCard — Captured timestamp prefix + ISO title.
 *
 * Guarantees:
 *  - Timeline manual snapshot displays "Captured: <formatted>".
 *  - The ISO timestamp is exposed via title/aria-label for a11y and audit.
 *  - Source label remains "Manual"; never "live".
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import type { ManualSnapshotTimelineCard as CardModel } from "@/lib/manualSensorSnapshotViewModel";

import {
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
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
  readings: [
    { field: "air_temp_c", value: 24, unit: "°C", derived: false },
    { field: "humidity_pct", value: 55, unit: "%", derived: false },
  ],
  notes: null,
  errors: [],
  warnings: [],
};

describe("ManualSnapshotTimelineCard captured timestamp", () => {
  it("renders Captured: <formatted> and exposes ISO in title + aria-label", () => {
    const { getByTestId } = render(<ManualSnapshotTimelineCard card={CARD} />);
    const el = getByTestId("manual-snapshot-timeline-card-captured-at");
    expect(el.textContent ?? "").toMatch(/^Captured:\s/);
    expect(el.getAttribute("title")).toBe("2026-07-01T12:00:00.000Z");
    expect(el.getAttribute("aria-label") ?? "").toContain("2026-07-01T12:00:00.000Z");
    expect(el.getAttribute("aria-label") ?? "").toMatch(/^Captured:\s/);
  });

  it("keeps source badge on Manual (never live)", () => {
    const { getByTestId } = render(<ManualSnapshotTimelineCard card={CARD} />);
    const badge = getByTestId("manual-snapshot-timeline-card-source");
    expect(badge.textContent ?? "").toMatch(/manual/i);
    expect(badge.textContent ?? "").not.toMatch(/live/i);
  });
});
