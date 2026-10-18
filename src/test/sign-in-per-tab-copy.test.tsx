import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

function activateTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

describe("sign-in page per-tab session copy", () => {
  it("renders the per-tab sign-in explanation on the sign-in panel", () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    expect(screen.getByText(PER_TAB_SIGN_IN_COPY)).toBeInTheDocument();
  });

  it("hides the per-tab explanation when the create-account tab is active", () => {
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );

    activateTab(/^create account$/i);
    expect(screen.queryByText(PER_TAB_SIGN_IN_COPY)).not.toBeInTheDocument();
  });
});
