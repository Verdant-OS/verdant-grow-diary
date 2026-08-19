import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  refetch: vi.fn(async () => undefined),
  invoke: vi.fn(),
  // B4a: the page now validates any carried ?growId=/?tentId= against rows
  // the grower owns, so the harness has to supply those rows.
  tents: [] as Array<Record<string, unknown>>,
  grows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
  useGrowTents: () => ({ data: state.tents }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: state.grows }),
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

function renderPage(entry = "/doctor") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
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
    state.tents = [];
    state.grows = [];
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

  // ---- Tranche B+ slice B4a — carried context (D-B6, D4) ----

  const SCOPED = {
    grows: [{ id: "grow-1", name: "Autumn Run" }],
    tents: [{ id: "tent-a", name: "Tent A", grow_id: "grow-1" }],
    plants: [
      { id: "beta", name: "Beta", tentId: "tent-b" },
      { id: "alpha", name: "Alpha", tentId: "tent-a" },
    ],
  };

  it("mounts the loop card so the visual chain does not break at /doctor", () => {
    renderPage();
    expect(screen.getByTestId("ai-doctor-start-one-tent-loop-next-step-card")).toHaveAttribute(
      "data-current-step",
      "ai-doctor",
    );
  });

  it("labels a carried tent and lists its plants first WITHOUT removing any choice", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(screen.getByTestId("ai-doctor-start-tent-context")).toHaveTextContent("Tent A");
    const options = screen.getAllByRole("link", { name: /with AI Doctor/i });
    // Alpha (in tent-a) is promoted above Beta, but Beta is still choosable —
    // the doctrine is an explicit choice, and a shortened list is a soft guess.
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName("Review Alpha with AI Doctor");
    expect(screen.getByTestId("ai-doctor-start-option-0-in-tent")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-doctor-start-option-1-in-tent")).toBeNull();
  });

  it("fails closed on a tent the grower does not own and says so calmly", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-someone-else");

    expect(screen.queryByTestId("ai-doctor-start-tent-context")).toBeNull();
    expect(screen.getByTestId("ai-doctor-start-invalid-scope")).toBeInTheDocument();
    // Every active plant is still offered.
    expect(screen.getAllByRole("link", { name: /with AI Doctor/i })).toHaveLength(2);
  });

  it("never triggers an AI call from carried context", () => {
    state.grows = SCOPED.grows;
    state.tents = SCOPED.tents;
    state.data = SCOPED.plants;
    renderPage("/doctor?growId=grow-1&tentId=tent-a");

    expect(state.invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/doctor");
    expect(screen.queryByTestId("plant-detail")).toBeNull();
  });
});
