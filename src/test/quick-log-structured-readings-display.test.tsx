/**
 * Grower bug report 2026-11-03, item 14: saved structured readings show as
 * manual chips in Recent Quick Logs; implausible values are flagged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { structuredReadingChips } from "@/lib/quickLogStructuredReadingRules";

vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Correction history unavailable.",
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "ok" }),
}));
vi.mock("@/components/RetractedQuickLogPanel", () => ({ default: () => null }));

import { RecentQuickLogActivityPanel } from "@/components/QuickLogHistoryPanels";

afterEach(() => cleanup());

const snapshot = {
  source: "manual",
  soil_temp_c: 20,
  soil_moisture_pct: 42,
  soil_ec_ms_cm: 1450,
  co2_ppm: 800,
  ppfd: 650,
};

describe("structuredReadingChips", () => {
  it("formats each saved reading with its unit and flags implausible ones", () => {
    expect(structuredReadingChips(snapshot, "C")).toEqual([
      { label: "Soil temp", value: "20 °C", invalid: false },
      { label: "Water content", value: "42 % VWC", invalid: false },
      { label: "Soil EC", value: "1450 mS/cm", invalid: true },
      { label: "CO₂", value: "800 ppm", invalid: false },
      { label: "PPFD", value: "650 µmol/m²/s", invalid: false },
    ]);
  });
  it("shows soil temp in °F for a °F viewer", () => {
    expect(structuredReadingChips({ source: "manual", soil_temp_c: 20 }, "F")).toEqual([
      { label: "Soil temp", value: "68 °F", invalid: false },
    ]);
  });
  it("ignores snapshots that are not labelled manual, and non-numbers", () => {
    expect(structuredReadingChips({ soil_temp_c: 20 }, "C")).toEqual([]);
    expect(structuredReadingChips({ source: "manual", co2_ppm: "800" }, "C")).toEqual([]);
    expect(structuredReadingChips(null, "C")).toEqual([]);
  });
});

describe("Recent Quick Logs row", () => {
  it("shows saved structured readings as manual chips", () => {
    render(
      <RecentQuickLogActivityPanel
        rawEntries={[
          {
            id: "n-1",
            entry_type: "note",
            created_at: "2026-11-03T15:00:00Z",
            note: "Pot check",
            details: { manual_sensor_snapshot: snapshot },
          },
        ]}
      />,
    );
    const box = within(screen.getByTestId("quicklog-history-section-recent")).getByTestId(
      "quicklog-history-manual-readings",
    );
    expect(box).toHaveTextContent("not live sensor data");
    expect(box).toHaveTextContent("Soil EC1450 mS/cm· outside valid range, not used");
    expect(box).toHaveTextContent("CO₂800 ppm");
  });
});
