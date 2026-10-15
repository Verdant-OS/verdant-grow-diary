import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => {} } },
      })),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

import Auth from "@/pages/Auth";

const PER_TAB_SIGN_IN_COPY =
  "Sign-in is kept separately in each tab. If you opened a new tab, sign in here or return to your signed-in tab.";

describe("sign-in page per-tab session copy", () => {
  it("renders the per-tab sign-in explanation on the sign-in panel", () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByText(PER_TAB_SIGN_IN_COPY)).toBeInTheDocument();
  });
});
