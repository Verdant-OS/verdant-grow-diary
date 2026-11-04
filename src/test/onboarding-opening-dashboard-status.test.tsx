/**
 * Grower bug item 11: a signed-in grower who already has grows must not see an
 * empty /onboarding outlet while the redirect to the dashboard lands (measured
 * in mocked Chromium as a blank main area between "Loading your grows…" and `/`).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-new" }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Run 1" }],
    loading: false,
    error: null,
    refresh: vi.fn(),
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import Onboarding, { ONBOARDING_OPENING_DASHBOARD_COPY } from "@/pages/Onboarding";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

describe("Onboarding redirect for a grower with grows", () => {
  it("shows a visible status while it hands off to the dashboard", async () => {
    // No <Routes>, so the page stays mounted after the redirect and its output is inspectable.
    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Onboarding />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("onboarding-opening-dashboard")).toHaveTextContent(
      ONBOARDING_OPENING_DASHBOARD_COPY,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/));
  });
});
