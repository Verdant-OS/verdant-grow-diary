import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({
    data: [],
    isLoading: false,
  }),
}));

afterEach(() => cleanup());

describe("Plant Detail missing-photo handoff", () => {
  it("opens photo-capable Quick Log with the known plant and grow context", () => {
    const captured: CustomEvent[] = [];
    const listener = (event: Event) => captured.push(event as CustomEvent);
    window.addEventListener("verdant:open-quicklog", listener);

    try {
      render(
        <MemoryRouter>
          <PlantDetailWhatsMissing
            plantId="plant-1"
            growId="grow-1"
            stage="veg"
            hasPlantPhoto={false}
          />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByTestId("plant-detail-whats-missing-cta-no_recent_photo"));

      expect(captured).toHaveLength(1);
      expect(captured[0].detail).toEqual({
        plantId: "plant-1",
        growId: "grow-1",
        activityId: "photo",
      });
      expect(screen.queryByRole("link", { name: "Upload photo" })).not.toBeInTheDocument();
    } finally {
      window.removeEventListener("verdant:open-quicklog", listener);
    }
  });
});
