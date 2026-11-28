/**
 * First-use friction item 9 (walkthrough FA-20261119-M1, 2026-11-19): the
 * "Quick Log" start-screen option must say what it does.
 *
 * Behaviour (unchanged, pinned here too): Continue on /onboarding opens Quick
 * Log once (/dashboard?open=quick-log). Every later sign-in lands on the
 * dashboard with Quick Log closed (ecdd084a3, 2026-11-10;
 * src/lib/returningSignInNoAutoOpen.test.ts). The walkthrough saw the
 * dashboard after a later sign-in while the option still read "Quick Log", so
 * the copy now names both steps: on /onboarding, "now" then later sign-ins;
 * in Settings, where saving opens nothing, only what sign-in does.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-copy-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

// Zero grows keep the onboarding chooser on screen.
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    loading: false,
    activeGrowId: null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(),
    activeGrow: null,
    error: null,
  }),
}));

import Onboarding from "@/pages/Onboarding";
import Settings from "@/pages/Settings";
import {
  QUICK_LOG_START_SCREEN_ONBOARDING_COPY,
  QUICK_LOG_START_SCREEN_SIGN_IN_COPY,
  START_SCREEN_OPTIONS,
  routeForStartScreen,
} from "@/lib/startScreenPreferences";
import { resolveReturningSignInRoute } from "@/lib/quickLogStartScreenTargetRules";

const quickLogOption = START_SCREEN_OPTIONS.find((opt) => opt.key === "quickLog");

describe("Quick Log start-screen option copy", () => {
  it("keeps the behaviour the copy describes", () => {
    // First time (onboarding Continue): Quick Log opens.
    expect(routeForStartScreen("quickLog")).toBe("/dashboard?open=quick-log");
    // Later sign-ins: the dashboard, Quick Log closed.
    expect(resolveReturningSignInRoute({ savedChoice: "quickLog" })).toBe("/dashboard");
  });

  it("says where later sign-ins land, in short plain words", () => {
    expect(QUICK_LOG_START_SCREEN_SIGN_IN_COPY).toBe(
      "Diary-first. Sign-ins open your dashboard, one tap from Quick Log.",
    );
    expect(QUICK_LOG_START_SCREEN_ONBOARDING_COPY).toBe(
      "Opens Quick Log now. Later sign-ins open your dashboard, one tap from Quick Log.",
    );
    expect(quickLogOption?.description).toBe(QUICK_LOG_START_SCREEN_SIGN_IN_COPY);
    expect(quickLogOption?.onboardingDescription).toBe(QUICK_LOG_START_SCREEN_ONBOARDING_COPY);
    expect(quickLogOption?.label).toBe("Quick Log");
    expect(quickLogOption?.recommended).toBe(true);
  });

  it("onboarding shows the first-time copy under the Quick Log option", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/onboarding"]}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const desc = container.querySelector("#start-screen-quickLog-desc");
    expect(desc?.textContent).toBe(QUICK_LOG_START_SCREEN_ONBOARDING_COPY);
  });

  it("Settings shows only what sign-in does, since saving opens nothing", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    expect(screen.getByText(QUICK_LOG_START_SCREEN_SIGN_IN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(QUICK_LOG_START_SCREEN_ONBOARDING_COPY)).toBeNull();
  });
});
