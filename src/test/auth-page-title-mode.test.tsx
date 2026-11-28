import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Walkthrough FA-20261119-M1 item 6: the sign-up form showed a browser tab
// titled "Sign in". The tab title must follow the form that is showing.

const mocks = vi.hoisted(() => ({ seo: vi.fn() }));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: (seo: { title: string }) => mocks.seo(seo),
}));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

import Auth from "@/pages/Auth";
import { AUTH_MODE_TABS, getAuthPageTitle } from "@/lib/authModeTabRules";

function lastTitle(): string {
  const calls = mocks.seo.mock.calls;
  return (calls[calls.length - 1]?.[0] as { title: string }).title;
}

function renderAuth(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => mocks.seo.mockReset());

describe("getAuthPageTitle", () => {
  it("gives each auth mode its own tab title", () => {
    expect(getAuthPageTitle("signin")).toBe("Sign in to Verdant Grow Diary");
    expect(getAuthPageTitle("signup")).toBe("Create your Verdant Grow Diary account");
    expect(getAuthPageTitle("forgot")).toBe("Reset your Verdant Grow Diary password");
  });

  it("never titles the sign-up or reset form as sign in", () => {
    for (const tab of AUTH_MODE_TABS) {
      if (tab.value === "signin") continue;
      expect(getAuthPageTitle(tab.value)).not.toMatch(/sign in/i);
    }
  });
});

describe("Auth page tab title", () => {
  it("keeps the sign-in title on /auth", () => {
    renderAuth("/auth");
    expect(lastTitle()).toBe("Sign in to Verdant Grow Diary");
  });

  it("titles /auth?mode=signup as create account", () => {
    renderAuth("/auth?mode=signup");
    expect(lastTitle()).toBe("Create your Verdant Grow Diary account");
  });

  it("follows the tab when the grower switches to Create account", () => {
    renderAuth("/auth");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /create account/i }));
    fireEvent.click(screen.getByRole("tab", { name: /create account/i }));
    expect(lastTitle()).toBe("Create your Verdant Grow Diary account");
  });
});
