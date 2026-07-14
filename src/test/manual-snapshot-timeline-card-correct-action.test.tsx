/**
 * ManualSnapshotTimelineCard — "Correct manual reading" action.
 *
 * Guarantees:
 *  - Renders the link ONLY when card.source === "manual" AND the caller
 *    supplies at least one real original reading UUID.
 *  - Hidden when originalReadingIds is undefined.
 *  - Hidden for non-manual snapshots even if IDs are supplied.
 *  - The link target includes the correction hash (r_<metric>=<uuid>).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import {
  MANUAL_SNAPSHOT_CARD_TITLE,
  MANUAL_SNAPSHOT_SOURCE_LABEL,
  type ManualSnapshotTimelineCard as CardModel,
} from "@/lib/manualSensorSnapshotViewModel";

const TENT = "11111111-1111-4111-8111-111111111111";
const R_TEMP = "22222222-2222-4222-8222-222222222222";
const R_RH = "33333333-3333-4333-8333-333333333333";

const BASE: CardModel = {
  id: "card-1",
  title: MANUAL_SNAPSHOT_CARD_TITLE,
  source: "manual",
  sourceLabel: MANUAL_SNAPSHOT_SOURCE_LABEL,
  capturedAt: "2026-07-01T12:00:00.000Z",
  severity: "ok",
  tentId: TENT,
  plantId: null,
  isTentLevel: true,
  readings: [
    { field: "air_temp_c", value: 24, unit: "°C", derived: false },
    { field: "humidity_pct", value: 58, unit: "%", derived: false },
  ],
  notes: null,
  errors: [],
  warnings: [],
};

function renderCard(props: Parameters<typeof ManualSnapshotTimelineCard>[0]) {
  return render(
    <MemoryRouter>
      <ManualSnapshotTimelineCard {...props} />
    </MemoryRouter>,
  );
}

describe("ManualSnapshotTimelineCard — Correct manual reading action", () => {
  it("renders the correction link for a manual snapshot with real original IDs", () => {
    const { getByTestId } = renderCard({
      card: BASE,
      originalReadingIds: { air_temp_c: R_TEMP, humidity_pct: R_RH },
    });
    const link = getByTestId("manual-snapshot-timeline-card-correct-action") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href") ?? "").toMatch(/^\/sensors#manual-reading\?/);
    expect(link.getAttribute("href") ?? "").toContain(`r_temperature_c=${R_TEMP}`);
    expect(link.getAttribute("href") ?? "").toContain(`r_humidity_pct=${R_RH}`);
    expect(link.getAttribute("href") ?? "").toContain(`tent_id=${TENT}`);
  });

  it("hides the link when originalReadingIds is undefined", () => {
    const { queryByTestId } = renderCard({ card: BASE });
    expect(queryByTestId("manual-snapshot-timeline-card-correct-action")).toBeNull();
  });

  it("hides the link when originalReadingIds is empty", () => {
    const { queryByTestId } = renderCard({ card: BASE, originalReadingIds: {} });
    expect(queryByTestId("manual-snapshot-timeline-card-correct-action")).toBeNull();
  });

  it("hides the link when originalReadingIds contains no real UUIDs", () => {
    const { queryByTestId } = renderCard({
      card: BASE,
      originalReadingIds: { air_temp_c: "not-a-uuid" },
    });
    expect(queryByTestId("manual-snapshot-timeline-card-correct-action")).toBeNull();
  });

  it("hides the link for a non-manual snapshot even with IDs (defensive)", () => {
    const notManual: CardModel = { ...BASE, source: "manual" as const };
    // Force source to a non-manual literal via cast to prove the guard —
    // presenter must not render a correction link for anything but manual.
    const bad = { ...notManual, source: "csv" as unknown as CardModel["source"] };
    const { queryByTestId } = renderCard({
      card: bad,
      originalReadingIds: { air_temp_c: R_TEMP },
    });
    expect(queryByTestId("manual-snapshot-timeline-card-correct-action")).toBeNull();
  });
});
