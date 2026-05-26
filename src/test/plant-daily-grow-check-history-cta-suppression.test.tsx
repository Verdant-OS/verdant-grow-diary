/**
 * Tests for the duplicate Daily Grow Check CTA suppression.
 *
 * The History card's header "Start Daily Grow Check" CTA should hide
 * when its sibling Consistency card already shows the primary CTA, and
 * remain when the History card is standalone. Onboarding empty-state
 * note/sensor CTAs are unaffected.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [] }),
}));

import PlantDailyGrowCheckHistoryCard from "@/components/PlantDailyGrowCheckHistoryCard";

function renderCard(props: { hideHeaderCta?: boolean }) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantDailyGrowCheckHistoryCard
          plantId="plant-1"
          currentTentId="tent-1"
          hideHeaderCta={props.hideHeaderCta}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlantDailyGrowCheckHistoryCard · duplicate CTA suppression", () => {
  it("hides the header CTA when hideHeaderCta is true", () => {
    renderCard({ hideHeaderCta: true });
    expect(screen.queryByTestId("plant-daily-grow-check-history-cta")).toBeNull();
  });

  it("shows the header CTA by default (standalone usage)", () => {
    renderCard({});
    expect(screen.getByTestId("plant-daily-grow-check-history-cta")).toBeTruthy();
  });

  it("still renders the onboarding note + sensor CTAs in empty state when header CTA is hidden", () => {
    renderCard({ hideHeaderCta: true });
    expect(screen.getByTestId("plant-daily-grow-check-history-onboarding")).toBeTruthy();
    expect(screen.getByTestId("plant-daily-grow-check-history-cta-note")).toBeTruthy();
    expect(screen.getByTestId("plant-daily-grow-check-history-cta-sensor")).toBeTruthy();
  });
});

describe("PlantDetail · passes hideHeaderCta to History card", () => {
  const PLANT_DETAIL = readFileSync(
    resolve(__dirname, "../pages/PlantDetail.tsx"),
    "utf-8",
  );

  it("renders the History card with hideHeaderCta alongside the Consistency card", () => {
    expect(PLANT_DETAIL).toMatch(
      /PlantDailyGrowCheckHistoryCard[\s\S]*?hideHeaderCta[\s\S]*?\/>/,
    );
    expect(PLANT_DETAIL).toContain("PlantDailyGrowCheckConsistencyCard");
  });
});
