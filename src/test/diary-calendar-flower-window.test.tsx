/**
 * DiaryCalendarSection — flower window band + plant day N integration.
 * Covers wiring from grow anchors through deriveFlowerWindowCalendar into
 * CultivationCalendarMonthGrid without diary entries.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DiaryCalendarSection from "@/components/DiaryCalendarSection";
import { FLOWER_WINDOW_SUGGESTED_DURATION_LABEL } from "@/lib/flowerWindowCalendarRules";

const PLANT_START = "2026-01-01T00:00:00.000Z";
const FLOWER_FLIP = "2026-03-02T00:00:00.000Z";
const NOW = new Date("2026-03-12T12:00:00.000Z");

describe("DiaryCalendarSection — flower window integration", () => {
  it("shows the month grid and flower band when anchors exist but diary entries are empty", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[]}
        now={NOW}
        plantStartedAt={PLANT_START}
        flowerFlipAt={FLOWER_FLIP}
        flowerDurationDays={60}
        flowerDurationKind="grower_set"
      />,
    );

    expect(screen.getByTestId("cultivation-calendar-month-grid")).toBeInTheDocument();
    expect(screen.getByTestId("cultivation-calendar-plant-day")).toHaveTextContent("Plant day 70");
    expect(screen.getByTestId("cultivation-calendar-flower-day")).toHaveTextContent(
      "Flower day 10 of 60",
    );
    expect(screen.queryByTestId("cultivation-calendar-duration-honesty")).toBeNull();

    const banded = screen
      .getAllByTestId("cultivation-calendar-day")
      .filter((day) => day.getAttribute("data-stage-band") === "flower");
    expect(banded.length).toBeGreaterThan(0);
    expect(banded[0]?.getAttribute("data-date-key")).toBe("2026-03-02");
  });

  it("labels suggested duration honesty without treating the preset as grower schedule", () => {
    render(
      <DiaryCalendarSection
        rawEntries={[]}
        now={NOW}
        plantStartedAt={PLANT_START}
        flowerFlipAt={FLOWER_FLIP}
        flowerDurationDays={75}
        flowerDurationKind="suggested"
      />,
    );

    expect(screen.getByTestId("cultivation-calendar-duration-honesty")).toHaveTextContent(
      FLOWER_WINDOW_SUGGESTED_DURATION_LABEL,
    );
    expect(screen.getByTestId("cultivation-calendar-flower-day")).toHaveTextContent(
      "Flower day 10 of 75",
    );
  });

  it("does not invent plant day 0 or a flower band without anchors", () => {
    render(<DiaryCalendarSection rawEntries={[]} now={NOW} plantStartedAt={null} />);

    expect(screen.queryByTestId("cultivation-calendar-month-grid")).toBeNull();
    expect(screen.queryByTestId("cultivation-calendar-plant-day")).toBeNull();
    expect(screen.queryByTestId("cultivation-calendar-flower-day")).toBeNull();
    expect(screen.queryByText(/Plant day 0/i)).toBeNull();
  });
});
