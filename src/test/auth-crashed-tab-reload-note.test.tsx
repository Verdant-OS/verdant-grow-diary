/**
 * Grower bug item 9: after a tab crash, a new tab is signed out because the
 * session is per tab (sessionStorage, by design). The sign-in panel says that
 * reloading the crashed tab keeps the sign-in (measured in Chromium).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  AUTH_CRASHED_TAB_RELOAD_COPY,
  AUTH_CRASHED_TAB_RELOAD_TESTID,
} from "@/constants/authSessionCopy";

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

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

describe("sign-in page crashed-tab reload note (item 9)", () => {
  it("tells the grower to reload a crashed tab to stay signed in", () => {
    renderAuth();
    expect(screen.getByTestId(AUTH_CRASHED_TAB_RELOAD_TESTID)).toHaveTextContent(
      AUTH_CRASHED_TAB_RELOAD_COPY,
    );
  });

  it("does not claim a new tab keeps the sign-in", () => {
    expect(AUTH_CRASHED_TAB_RELOAD_COPY).toMatch(/reload that tab/);
    expect(AUTH_CRASHED_TAB_RELOAD_COPY).not.toMatch(/new tab/i);
  });

  it("shows only on the sign-in panel, not on Create account", () => {
    renderAuth();
    const tab = screen.getByRole("tab", { name: /^create account$/i });
    fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
    fireEvent.mouseDown(tab, { button: 0 });
    fireEvent.click(tab);
    expect(screen.queryByTestId(AUTH_CRASHED_TAB_RELOAD_TESTID)).toBeNull();
  });
});
