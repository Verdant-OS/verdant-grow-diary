/**
 * Codex review on #2111 (P2): when the temperature preference changes while
 * Timeline memory stays mounted, the diary rows re-rendered but sibling
 * `ManualSnapshotTimelineCard` instances did not subscribe, so one timeline
 * could show diary chips in °C beside manual snapshot cards still in °F.
 * The section now subscribes once and hands the same unit to both branches,
 * and the card subscribes itself when rendered standalone.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimelineMemorySection from "@/components/TimelineMemorySection";
import ManualSnapshotTimelineCard from "@/components/ManualSnapshotTimelineCard";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard as CardModel } from "@/lib/manualSensorSnapshotViewModel";
import { saveTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const timelineMemoryMock = vi.hoisted(() => ({
  current: null as unknown,
}));

vi.mock("@/hooks/useTimelineMemory", () => ({
  useTimelineMemory: () => timelineMemoryMock.current,
}));

const card: CardModel = {
  id: "snap-1",
  title: "Manual sensor snapshot",
  capturedAt: "2026-10-14T11:00:00.000Z",
  sourceLabel: "Manual",
  source: "manual",
  tentId: "tent-1",
  plantId: null,
  isTentLevel: true,
  notes: null,
  readings: [{ field: "air_temp_c", value: 24, unit: "°C", derived: false }],
  severity: "ok",
  warnings: [],
  errors: [],
};

const manualItem: TimelineMemoryItem = {
  kind: "manual_sensor_snapshot",
  key: "snap-1",
  occurredAt: card.capturedAt,
  card,
};

const diaryItem: TimelineMemoryItem = {
  kind: "diary",
  key: "diary-1",
  occurredAt: "2026-10-14T10:00:00.000Z",
  eventType: "observation",
  hasPhoto: false,
  note: null,
  sensorSnapshot: { temp_c: 24, source: "manual" },
};

function readingText(): string {
  const reading = screen.getByTestId("manual-snapshot-timeline-card-reading");
  return reading.textContent ?? "";
}

afterEach(() => {
  cleanup();
  clearLocalStorageForTest();
});

describe("Timeline memory follows a temperature unit change without a remount", () => {
  it("re-renders manual snapshot cards together with diary chips", () => {
    saveTemperatureUnitPreference("fahrenheit");
    timelineMemoryMock.current = {
      items: [manualItem, diaryItem],
      displayItems: [manualItem, diaryItem],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    render(<TimelineMemorySection scope="tent" tentId="tent-1" />);
    expect(readingText()).toContain("75.2 °F");

    act(() => {
      saveTemperatureUnitPreference("celsius");
    });

    expect(readingText()).toContain("24.0 °C");
    expect(readingText()).not.toContain("°F");
    const chips = screen.getByTestId("timeline-diary-sensor-chips");
    expect(within(chips).queryByText(/°F/)).toBeNull();
    expect(within(chips).getByText(/°C/)).toBeInTheDocument();
  });

  it("a standalone card subscribes to the preference itself", () => {
    saveTemperatureUnitPreference("fahrenheit");
    render(<ManualSnapshotTimelineCard card={card} />);
    expect(readingText()).toContain("75.2 °F");

    act(() => {
      saveTemperatureUnitPreference("celsius");
    });

    expect(readingText()).toContain("24.0 °C");
  });

  it("an explicit unit from the parent wins over the saved preference", () => {
    saveTemperatureUnitPreference("fahrenheit");
    render(<ManualSnapshotTimelineCard card={card} temperatureUnit="celsius" />);
    expect(readingText()).toContain("24.0 °C");
  });
});
