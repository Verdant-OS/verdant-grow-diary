/**
 * A signed-in new account must not see a blank /onboarding outlet while the
 * grows read is still in flight. AppShell has already passed its auth gate
 * by the time this page mounts.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-new" }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [], loading: true, refresh: vi.fn() }),
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

import Onboarding, { ONBOARDING_GROWS_LOADING_COPY } from "@/pages/Onboarding";

describe("Onboarding while grows are loading", () => {
  it("shows a status instead of an empty outlet", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector("#onboarding-heading")).toBeNull();
    expect(screen.getByTestId("onboarding-grows-loading")).toHaveTextContent(
      ONBOARDING_GROWS_LOADING_COPY,
    );
    expect(ONBOARDING_GROWS_LOADING_COPY).not.toBe("Loading…");
  });
});
