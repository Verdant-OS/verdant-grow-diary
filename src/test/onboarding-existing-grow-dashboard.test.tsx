// Signed-in accounts that already have a grow skip the /onboarding chooser
// and land on the dashboard. Zero-grow keyboard coverage stays in
// onboarding-keyboard.test.tsx.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "QA Test" }],
    loading: false,
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(),
    activeGrow: { id: "g1", name: "QA Test" },
    error: null,
  }),
}));

import Onboarding from "@/pages/Onboarding";
import { routeForStartScreen } from "@/lib/startScreenPreferences";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={<div data-testid="dashboard-landing" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Onboarding with an existing grow", () => {
  it("routes a signed-in account with at least one grow to the dashboard", () => {
    renderPage();
    expect(routeForStartScreen("dashboard")).toBe("/");
    expect(screen.getByTestId("dashboard-landing")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /where do you want verdant to open first/i }),
    ).not.toBeInTheDocument();
  });
});
