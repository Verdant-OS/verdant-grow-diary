/**
 * Render tests for ReportsHubOnboardingSection.
 *
 * - Returns null when there are no cards (section hides).
 * - Renders 3 setup cards with their CTAs.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportsHubOnboardingSection from "@/components/ReportsHubOnboardingSection";
import type { ReportsHubOnboardingCard } from "@/lib/reportsHubOnboarding";

const cards: ReportsHubOnboardingCard[] = [
  {
    id: "add_plant",
    title: "Add a plant",
    description: "Plant profiles anchor the diary.",
    href: "/plants?growId=grow-1",
    hrefLabel: "Open plants",
  },
  {
    id: "add_sensor_snapshot",
    title: "Add a manual sensor snapshot",
    description: "A quick entry gives recent sensor context.",
    href: "/sensors",
    hrefLabel: "Open sensors",
  },
  {
    id: "review_action_outcome",
    title: "Review an action outcome",
    description: "Mark a completed action with what you observed.",
    href: "/actions?growId=grow-1",
    hrefLabel: "Open actions",
  },
];

describe("ReportsHubOnboardingSection", () => {
  it("renders nothing when there are no cards", () => {
    const { container } = render(
      <MemoryRouter>
        <ReportsHubOnboardingSection cards={[]} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the three setup cards with links", () => {
    render(
      <MemoryRouter>
        <ReportsHubOnboardingSection cards={cards} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("reports-onboarding")).toBeInTheDocument();
    expect(
      screen.getByTestId("reports-onboarding-card-add_plant"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("reports-onboarding-link-add_sensor_snapshot")
        .getAttribute("href"),
    ).toBe("/sensors");
    expect(
      screen
        .getByTestId("reports-onboarding-link-review_action_outcome")
        .getAttribute("href"),
    ).toBe("/actions?growId=grow-1");
  });
});
