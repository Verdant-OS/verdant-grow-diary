import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import CultivationCalendarMonthGrid from "@/components/CultivationCalendarMonthGrid";
import type {
  DiaryCalendarDayGroup,
  DiaryCalendarEvent,
  DiaryCalendarEventKind,
} from "@/lib/diaryCalendarViewModel";
import {
  CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
  type CultivationCalendarProjectedReviewBlock,
} from "@/lib/cultivationCalendarProjectionRules";

function event(
  id: string,
  kind: DiaryCalendarEventKind,
  occurredAt: string,
  stage: DiaryCalendarEvent["stage"] = null,
): DiaryCalendarEvent {
  return {
    id,
    kind,
    label:
      kind === "environment"
        ? "Environment Check"
        : `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`,
    occurredAt,
    dateKey: occurredAt.slice(0, 10),
    plantName: null,
    stage,
    noteSnippet: null,
    details: {
      sectionLabel: `${kind} details`,
      subtitle: null,
      fields: [],
      ecPreview: null,
      fallback: null,
    },
  };
}

function group(dateKey: string, events: DiaryCalendarEvent[]): DiaryCalendarDayGroup {
  return {
    dateKey,
    events,
    counts: {
      watering: 0,
      feeding: 0,
      training: 0,
      diagnosis: 0,
      environment: 0,
    },
  };
}

function review(
  id: string,
  category: CultivationCalendarProjectedReviewBlock["category"],
  scheduledAt: string,
): CultivationCalendarProjectedReviewBlock {
  return {
    id,
    category,
    scheduledAt,
    title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
    advisoryText: `${CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE}. Review watering readiness.`,
    sourceFactCount: 3,
    cadenceMs: 86_400_000,
  };
}

describe("<CultivationCalendarMonthGrid />", () => {
  it("renders a UTC Sunday-first six-week grid with 42 cells", () => {
    render(
      <CultivationCalendarMonthGrid
        monthKey="2026-07"
        groups={[]}
        now={new Date("2026-07-14T12:00:00Z")}
      />,
    );

    expect(screen.getByTestId("cultivation-calendar-month-grid")).toBeInTheDocument();
    expect(screen.getAllByTestId("cultivation-calendar-day")).toHaveLength(42);
    expect(screen.getAllByTestId("cultivation-calendar-day")[0]).toHaveAttribute(
      "data-date-key",
      "2026-06-28",
    );
    expect(screen.getByTestId("cultivation-calendar-grid-empty")).toHaveTextContent(
      /No logged care or history-derived reviews/i,
    );
    expect(screen.getByText(/Swipe horizontally to see the full week/i)).toBeInTheDocument();
    const scrollRegion = screen.getByRole("region", {
      name: "Scrollable monthly cultivation calendar",
    });
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(scrollRegion).toHaveAttribute(
      "aria-describedby",
      "cultivation-calendar-mobile-scroll-hint",
    );
  });

  it("keeps logged facts clickable while history-derived reviews are non-actionable", () => {
    const watering = event("water-1", "watering", "2026-07-14T09:00:00Z", "veg");
    const onOpenEvent = vi.fn();
    render(
      <CultivationCalendarMonthGrid
        monthKey="2026-07"
        groups={[group("2026-07-14", [watering])]}
        projectedReviews={[review("review-1", "watering", "2026-07-14T12:00:00Z")]}
        activeStage="flower"
        now={new Date("2026-07-14T12:00:00Z")}
        onOpenEvent={onOpenEvent}
      />,
    );

    const day = screen
      .getAllByTestId("cultivation-calendar-day")
      .find((candidate) => candidate.getAttribute("data-date-key") === "2026-07-14");
    expect(day).toBeDefined();

    const fact = within(day!).getByTestId("cultivation-calendar-fact-block");
    fireEvent.click(fact);
    expect(onOpenEvent).toHaveBeenCalledOnce();
    expect(onOpenEvent).toHaveBeenCalledWith(watering);

    const advisory = within(day!).getByTestId("cultivation-calendar-advisory-block");
    expect(advisory.tagName).toBe("DIV");
    expect(advisory).toHaveTextContent("Suggested review");
    expect(advisory).toHaveTextContent(/history-derived/i);
    expect(within(day!).queryByRole("button", { name: /suggested review/i })).toBeNull();
  });

  it("uses only a fact's own known stage and never backfills history with the active stage", () => {
    const seedlingFact = event("seedling", "watering", "2026-07-03T09:00:00Z", "seedling");
    const historicalFactWithoutStage = event("historical", "feeding", "2026-07-03T12:00:00Z");
    render(
      <CultivationCalendarMonthGrid
        monthKey="2026-07"
        groups={[group("2026-07-03", [seedlingFact, historicalFactWithoutStage])]}
        activeStage="flower"
        now={new Date("2026-07-14T12:00:00Z")}
      />,
    );

    const blocks = screen.getAllByTestId("cultivation-calendar-fact-block");
    expect(blocks[0].className).toMatch(/emerald/);
    expect(blocks[1].className).toMatch(/secondary/);
    expect(screen.getByTestId("cultivation-calendar-active-stage")).toHaveTextContent(
      "Flowering stage",
    );
    expect(screen.getByTestId("cultivation-calendar-stage-legend")).toHaveTextContent(
      /Stage colour follows the manually logged stage/i,
    );
  });

  it("does not invent a stage colour for an unfamiliar active stage", () => {
    render(
      <CultivationCalendarMonthGrid
        monthKey="2026-07"
        groups={[group("2026-07-03", [event("water", "watering", "2026-07-03T09:00:00Z")])]}
        activeStage="transition"
        now={new Date("2026-07-14T12:00:00Z")}
      />,
    );

    expect(screen.getByTestId("cultivation-calendar-active-stage")).toHaveTextContent(
      "Stage not set",
    );
    expect(screen.getByTestId("cultivation-calendar-fact-block").className).toMatch(/secondary/);
  });

  it("has a calm invalid-month empty state rather than manufacturing calendar content", () => {
    render(
      <CultivationCalendarMonthGrid
        monthKey="not-a-month"
        groups={[]}
        now={new Date("2026-07-14T12:00:00Z")}
      />,
    );

    expect(screen.queryByTestId("cultivation-calendar-day")).toBeNull();
    expect(screen.getByTestId("cultivation-calendar-month-empty")).toHaveTextContent(
      /Choose a valid month/i,
    );
  });
});
