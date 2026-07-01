/**
 * HarvestTimelineCard — dedicated render tests. Verifies the card
 * shows/hides fields honestly, never claims yield/readiness, and
 * never leaks raw JSON or private ids.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HarvestTimelineCard from "@/components/HarvestTimelineCard";

describe("HarvestTimelineCard", () => {
  it("renders label, timestamp, and headline", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="2 hours ago"
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-label"),
    ).toHaveTextContent(/Harvest/i);
    expect(
      screen.getByTestId("harvest-timeline-card-headline"),
    ).toHaveTextContent(/Harvest logged/i);
    expect(
      screen.getByTestId("harvest-timeline-card-timestamp"),
    ).toHaveTextContent("2 hours ago");
  });

  it("shows wet + dry weight with unit when present", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          harvest={{ wetWeight: "120", dryWeight: "22", weightUnit: "g" }}
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-wet-weight"),
    ).toHaveTextContent("120 g");
    expect(
      screen.getByTestId("harvest-timeline-card-dry-weight"),
    ).toHaveTextContent("22 g");
  });

  it("hides missing weight fields", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          harvest={{ wetWeight: "120", weightUnit: "g" }}
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-wet-weight"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("harvest-timeline-card-dry-weight"),
    ).toBeNull();
  });

  it("shows note when present, hides when empty", () => {
    const { rerender } = render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          note="Removed main cola and lower branches."
        />
      </ul>,
    );
    expect(
      screen.getByTestId("harvest-timeline-card-note"),
    ).toHaveTextContent(/Removed main cola/);

    rerender(
      <ul>
        <HarvestTimelineCard entryId="e1" timestampLabel="t" note="   " />
      </ul>,
    );
    expect(screen.queryByTestId("harvest-timeline-card-note")).toBeNull();
  });

  it("does not surface entryId as visible text", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="priv-uuid-should-not-render"
          timestampLabel="t"
        />
      </ul>,
    );
    const card = screen.getByTestId("harvest-timeline-card");
    expect(card.textContent ?? "").not.toContain("priv-uuid-should-not-render");
  });

  it("never claims yield/readiness/potency/quality", () => {
    render(
      <ul>
        <HarvestTimelineCard
          entryId="e1"
          timestampLabel="t"
          note="Trimmed"
          harvest={{ wetWeight: "10", weightUnit: "g" }}
        />
      </ul>,
    );
    const text = screen.getByTestId("harvest-timeline-card").textContent ?? "";
    expect(text.toLowerCase()).not.toMatch(
      /final yield|ready to harvest|harvest ready|potency|quality|success/,
    );
  });
});
