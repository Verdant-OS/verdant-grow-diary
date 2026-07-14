import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import OnboardingChecklistCard from "@/components/OnboardingChecklistCard";
import { buildOnboardingChecklistViewModel } from "@/lib/onboardingChecklistViewModel";

function renderCard(input: Parameters<typeof buildOnboardingChecklistViewModel>[0]) {
  return render(
    <MemoryRouter>
      <OnboardingChecklistCard vm={buildOnboardingChecklistViewModel(input)} />
    </MemoryRouter>,
  );
}

describe("post-value grower invite entry", () => {
  it("appears only after the existing activation contract is complete", () => {
    renderCard({
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 1,
      sensorReadingCount: 0,
    });
    expect(screen.getByRole("link", { name: "Invite a grower" })).toHaveAttribute(
      "href",
      "/invite",
    );
  });

  it("does not interrupt an incomplete first-run checklist", () => {
    renderCard({
      growCount: 1,
      tentCount: 1,
      plantCount: 1,
      diaryEntryCount: 0,
      sensorReadingCount: 0,
    });
    expect(screen.queryByRole("link", { name: "Invite a grower" })).toBeNull();
    expect(screen.getByTestId("onboarding-checklist-card")).toBeInTheDocument();
  });
});
