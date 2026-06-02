/**
 * PlantDetailAiDoctorSafeReviewStart — render tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PlantDetailAiDoctorSafeReviewStart from "@/components/PlantDetailAiDoctorSafeReviewStart";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("DB access not allowed in safe-review-start render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed");
      },
    },
  },
}));

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

let mockTimelineItems: unknown[] = [];
vi.mock("@/hooks/useTimelineMemory", () => ({
  TIMELINE_MEMORY_DEFAULT_LIMIT: 60,
  useTimelineMemory: () => ({ items: mockTimelineItems, isLoading: false }),
}));

const PLANT_STRONG = {
  id: "p1",
  name: "Plant A",
  strain: "NL Auto",
  stage: "veg",
  medium: "soil",
  photo: "/photo.jpg",
  growId: "g1",
  tentId: "t1",
} as const;

const PLANT_INSUFFICIENT = {
  id: "p1",
  name: "Plant A",
  strain: null,
  stage: null,
  medium: null,
  photo: null,
  growId: "g1",
  tentId: "t1",
} as const;

beforeEach(() => {
  mockTimelineItems = [];
});

const renderIt = (plant: unknown) =>
  render(
    <MemoryRouter>
      <PlantDetailAiDoctorSafeReviewStart
        plantId="p1"
        plant={plant as never}
      />
    </MemoryRouter>,
  );

describe("PlantDetailAiDoctorSafeReviewStart", () => {
  it("renders nothing for insufficient context", () => {
    mockTimelineItems = [];
    renderIt(PLANT_INSUFFICIENT);
    expect(screen.queryByTestId("plant-ai-doctor-safe-review-start")).toBeNull();
  });

  it("renders limited-confidence prep for partial context", () => {
    // Profile present + 2 recent events but no fresh snapshot → partial.
    mockTimelineItems = [
      { kind: "diary_entry", occurredAt: ago(12 * HOUR), entryType: "note" },
      { kind: "diary_entry", occurredAt: ago(24 * HOUR), entryType: "note" },
    ];
    renderIt(PLANT_STRONG);
    const root = screen.getByTestId("plant-ai-doctor-safe-review-start");
    expect(root.getAttribute("data-variant")).toBe("partial");
    fireEvent.click(
      screen.getByTestId("plant-ai-doctor-safe-review-start-button"),
    );
    expect(
      screen.getByTestId("plant-ai-doctor-safe-review-readiness-notice")
        .textContent,
    ).toMatch(/limited confidence/i);
    expect(
      screen.getByTestId("plant-ai-doctor-safe-review-no-request-notice")
        .textContent,
    ).toBe("No AI request has been sent yet.");
    // Disabled future button visible, never an active submit.
    const disabled = screen.getByTestId(
      "plant-ai-doctor-safe-review-disabled-submit",
    );
    expect(disabled.hasAttribute("disabled")).toBe(true);
  });

  it("renders strong-context prep for strong context", () => {
    mockTimelineItems = [
      {
        kind: "manual_sensor_snapshot",
        occurredAt: ago(6 * HOUR),
        card: { severity: "ok" },
      },
      { kind: "diary_entry", occurredAt: ago(12 * HOUR), entryType: "watering" },
      { kind: "diary_entry", occurredAt: ago(36 * HOUR), entryType: "note" },
    ];
    renderIt(PLANT_STRONG);
    const root = screen.getByTestId("plant-ai-doctor-safe-review-start");
    expect(root.getAttribute("data-variant")).toBe("strong");
    fireEvent.click(
      screen.getByTestId("plant-ai-doctor-safe-review-start-button"),
    );
    expect(
      screen.getByTestId("plant-ai-doctor-safe-review-readiness-notice")
        .textContent,
    ).toBe("Context is strong enough for a cautious review.");
    expect(
      screen.getByTestId("plant-ai-doctor-safe-review-no-request-notice"),
    ).toBeTruthy();
  });
});
