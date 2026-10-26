/**
 * VER-276 / VERDANT-WEB-1: /onboarding must render when the grows context
 * arrives as null. Sentry redacted the TypeError message and stack; a null
 * list throws on `.length` during render and is the crash this page can hit.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: {} },
    refetch: vi.fn(),
  }),
}));

import Onboarding from "@/pages/Onboarding";

describe("Onboarding with a null grows list", () => {
  it("renders the start-screen choice instead of throwing", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/onboarding"]}>
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    ).not.toThrow();
    expect(
      screen.getByRole("heading", { name: /or choose where to open first/i }),
    ).toBeInTheDocument();
  });
});
