/**
 * A grows read still rejected for an expired JWT after every retry must send
 * the grower to sign in, not offer a "Try again" that cannot succeed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const state = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined) }));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false, signOut: state.signOut }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    loading: false,
    error: "session_expired",
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
import { GROWS_READ_SESSION_EXPIRED, growsReadErrorValue } from "@/lib/growsReadRetryRules";

afterEach(cleanup);

describe("Onboarding when the session expired during the grows read", () => {
  it("offers Sign in again (which signs out) instead of Try again", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/onboarding"]}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("onboarding-grows-session-expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.queryByTestId("onboarding-grows-error")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sign in again/i }));
    expect(state.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("growsReadErrorValue", () => {
  it("names an expired JWT that outlasted the retries", () => {
    expect(growsReadErrorValue({ kind: "db", code: "PGRST301" })).toBe(GROWS_READ_SESSION_EXPIRED);
  });
  it("keeps the existing values for timeouts and other failures", () => {
    expect(growsReadErrorValue({ kind: "timeout", code: "critical_read_deadline" })).toBe(
      "critical_read_deadline",
    );
    expect(growsReadErrorValue({ kind: "network", code: "network" })).toBe("Unable to load grows");
    expect(growsReadErrorValue({ kind: "db", code: "42501" })).toBe("Unable to load grows");
  });
});
