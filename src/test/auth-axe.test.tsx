// Automated axe a11y checks for /auth and /reset-password.
// Mocked Supabase only — no network, no real account, no real reset.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { axe } from "vitest-axe";


vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: "u-1" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";

beforeEach(() => {
  vi.clearAllMocks();
});

function activateTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

describe("Axe — /auth", () => {
  it("Sign in panel has no detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it("Create account panel has no detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );
    activateTab(/create account/i);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("Forgot password panel has no detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    );
    activateTab(/forgot password/i);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("Axe — /reset-password", () => {
  it("Reset password form has no detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth" element={<div>Sign in</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it("Reset password with confirm-mismatch has no detectable a11y violations", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/reset-password"]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth" element={<div>Sign in</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "differen2" },
    });
    expect((await axe(container)).violations).toEqual([]);
  });
});
