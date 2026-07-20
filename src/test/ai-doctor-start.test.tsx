import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
  invoke: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: state.invoke } },
}));

import AiDoctorStart from "@/pages/AiDoctorStart";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/doctor"]}>
      <LocationProbe />
      <Routes>
        <Route path="/doctor" element={<AiDoctorStart />} />
        <Route path="/plants/:id" element={<div data-testid="plant-detail">Plant detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AiDoctorStart", () => {
  beforeEach(() => {
    state.data = [];
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
    state.invoke.mockClear();
  });

  afterEach(() => cleanup());

  it("renders a distinct loading state without implying an empty plant list", () => {
    state.isLoading = true;
    renderPage();

    expect(screen.getByTestId("ai-doctor-start-loading")).toHaveAttribute("role", "status");
    expect(screen.queryByText("No active plants to review")).toBeNull();
  });

  it("renders the failed-read state and retries without inventing plant choices", () => {
    state.isError = true;
    renderPage();

    expect(screen.getByTestId("ai-doctor-start-error")).toHaveAttribute("role", "alert");
    expect(screen.getByText(/won't choose one from incomplete data/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ai-doctor-start-error-retry"));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ai-doctor-start-options")).toBeNull();
  });

  it("renders a clear empty state with a Plants handoff", () => {
    renderPage();

    expect(screen.getByText("No active plants to review")).toBeInTheDocument();
    expect(screen.getByTestId("ai-doctor-start-empty-plants-link")).toHaveAttribute(
      "href",
      "/plants",
    );
  });

  it("renders active choices in deterministic order with exact tent and anchor context", () => {
    state.data = [
      { id: "beta", name: "Beta", stage: "flower", tentId: "tent-b" },
      { id: "alpha", name: "Alpha", strain: "Kush", tentId: "tent-a" },
      { id: "archived", name: "Archived", isArchived: true },
    ];
    renderPage();

    const options = screen.getAllByRole("link", { name: /with AI Doctor/i });
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName("Review Alpha with AI Doctor");
    expect(options[0]).toHaveAttribute(
      "href",
      "/plants/alpha?tentId=tent-a#plant-ai-doctor-review",
    );
    expect(options[1]).toHaveAttribute("href", "/plants/beta?tentId=tent-b#plant-ai-doctor-review");
    expect(screen.getByTestId("ai-doctor-start-history-link")).toHaveAttribute(
      "href",
      "/doctor/sessions",
    );
  });

  it("never auto-selects or runs AI when exactly one plant is available", () => {
    state.data = [{ id: "solo", name: "Solo", tentId: "tent-1" }];
    renderPage();

    expect(screen.getByTestId("location")).toHaveTextContent("/doctor");
    expect(screen.queryByTestId("plant-detail")).toBeNull();
    expect(screen.getAllByRole("link", { name: /with AI Doctor/i })).toHaveLength(1);
    expect(
      screen.getByText(/runs only after you press the review button there/i),
    ).toBeInTheDocument();
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
