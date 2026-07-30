import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import TimelineLightingGuideCard from "@/components/TimelineLightingGuideCard";
import { resolveTimelineLightingGuide } from "@/lib/timelineLightingGuideRules";

describe("TimelineLightingGuideCard", () => {
  it("renders the four-way stress comparison, next-log prompts, and guide links", () => {
    const view = resolveTimelineLightingGuide({ note: "Possible light burn and bleaching." });
    if (!view) throw new Error("expected a lighting guide view");

    render(
      <MemoryRouter>
        <TimelineLightingGuideCard view={view} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("timeline-lighting-guide-card")).toHaveAttribute(
      "data-lighting-guide-kind",
      "stress",
    );
    for (const label of ["Possible excess light", "Bleaching", "Heat stress", "Look-alikes"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Log next")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /distance, ppfd, dli/i })).toHaveAttribute(
      "href",
      "/guides/cannabis-grow-light-distance-and-schedule",
    );
  });
});
