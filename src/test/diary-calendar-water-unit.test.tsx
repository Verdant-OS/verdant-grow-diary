/**
 * Diary calendar — the watering Amount follows the grower's Quick Log Water unit
 * on the detailed history row and in View event details (issue #3072).
 * Display only: stored values stay canonical ml.
 */
import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import {
  buildDiaryCalendarViewModel,
  type DiaryCalendarRawEntry,
} from "@/lib/diaryCalendarViewModel";
import {
  buildDiaryCalendarEventDrawerViewModel,
  DIARY_CALENDAR_DRAWER_VIEW_LABEL,
} from "@/lib/diaryCalendarEventDrawerViewModel";
import type { WaterEntryUnit } from "@/lib/quickLogWaterVolumeUnitRules";
import {
  saveWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";

function watering(details: Record<string, unknown>): DiaryCalendarRawEntry[] {
  return [{ id: "w1", entry_at: "2026-06-10T09:00:00Z", event_type: "watering", details }];
}

function rowAmount(details: Record<string, unknown>, waterUnit?: WaterEntryUnit) {
  const ev = buildDiaryCalendarViewModel(watering(details), "celsius", { waterUnit })[0].events[0];
  return ev.details.fields.find((f) => f.label === "Amount")?.value;
}

function drawerAmount(details: Record<string, unknown>, waterUnit?: WaterEntryUnit) {
  const ev = buildDiaryCalendarViewModel(watering(details))[0].events[0];
  const model = buildDiaryCalendarEventDrawerViewModel(ev, details, "celsius", waterUnit);
  return model.measurements.fields.find((f) => f.label === "Amount")?.value;
}

describe("diary calendar watering Amount — water unit", () => {
  it.each([
    ["detailed history row", rowAmount],
    ["View event details", drawerAmount],
  ])("%s: 1500 ml reads 1.5 L in L and 1500 ml in ml", (_surface, amount) => {
    expect(amount({ watering_amount_ml: 1500 }, "L")).toBe("1.5 L");
    expect(amount({ watering_amount_ml: 1500 }, "ml")).toBe("1500 ml");
    expect(amount({ watering_amount_ml: 3785 }, "gal")).toBe("1 gal");
  });

  it.each([
    ["detailed history row", rowAmount],
    ["View event details", drawerAmount],
  ])("%s: a row that stores litres follows the same unit", (_surface, amount) => {
    expect(amount({ watering_amount_l: 1.5 }, "L")).toBe("1.5 L");
    expect(amount({ watering_amount_l: 1.5 }, "ml")).toBe("1500 ml");
    expect(amount({ watering_amount_l: 0.3 }, "ml")).toBe("300 ml");
  });

  it.each([
    ["detailed history row", rowAmount],
    ["View event details", drawerAmount],
  ])("%s: no unit keeps the ml text", (_surface, amount) => {
    expect(amount({ watering_amount_ml: 350 })).toBe("350 ml");
  });
});

describe("DiaryCalendarSection — watering Amount in the device water unit", () => {
  const entries = watering({ watering_amount_ml: 1500, method: "Top watering" });

  function openDrawer() {
    fireEvent.click(screen.getAllByRole("button", { name: DIARY_CALENDAR_DRAWER_VIEW_LABEL })[0]);
    return screen.getByTestId("diary-calendar-event-drawer");
  }

  it("shows 1.5 L on the row and in the drawer when the unit is L", () => {
    saveWaterVolumeEntryUnit("L");
    render(<DiaryCalendarSection rawEntries={entries} />);
    expect(screen.getByTestId("diary-calendar-event-details")).toHaveTextContent("1.5 L");
    expect(within(openDrawer()).getByText("1.5 L")).toBeInTheDocument();
    expect(screen.queryByText("1500 ml")).not.toBeInTheDocument();
  });

  it("uses the L default for a phone with no saved unit", () => {
    window.localStorage.removeItem(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
    render(<DiaryCalendarSection rawEntries={entries} />);
    expect(screen.getByTestId("diary-calendar-event-details")).toHaveTextContent("1.5 L");
  });

  it("keeps 1500 ml when the unit is ml, and follows a unit change", () => {
    render(<DiaryCalendarSection rawEntries={entries} />);
    expect(screen.getByTestId("diary-calendar-event-details")).toHaveTextContent("1500 ml");
    act(() => {
      saveWaterVolumeEntryUnit("L");
    });
    expect(screen.getByTestId("diary-calendar-event-details")).toHaveTextContent("1.5 L");
  });
});
