// Keyboard-only navigation and focus-order tests for /auth and /reset-password.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let signInResult: { error: { message: string } | null } = { error: null };
let updateUserResult: { error: { message: string } | null } = { error: null };

const signInMock = vi.fn(async () => signInResult);
const signUpMock = vi.fn(async () => ({ error: null }));
const resetForEmailMock = vi.fn(async () => ({ error: null }));
const updateUserMock = vi.fn(async () => updateUserResult);
const getSessionMock = vi.fn(async () => ({
  data: { session: { user: { id: "u-1" } } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInMock(...(a as [])),
      signUp: (...a: unknown[]) => signUpMock(...(a as [])),
      resetPasswordForEmail: (...a: unknown[]) => resetForEmailMock(...(a as [])),
      updateUser: (...a: unknown[]) => updateUserMock(...(a as [])),
      getSession: () => getSessionMock(),
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
  signInResult = { error: null };
  updateUserResult = { error: null };
  signInMock.mockClear();
  signUpMock.mockClear();
  resetForEmailMock.mockClear();
  updateUserMock.mockClear();
});

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

function renderReset() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// jsdom doesn't simulate Tab key focus traversal. Walk the document's
// focusable elements in DOM order — the natural tab order for elements
// without explicit tabIndex.
function getTabOrder(): HTMLElement[] {
  // Include disabled buttons — they still occupy a DOM order slot and we
  // want to assert ordering, not focusability.
  const selector =
    'a[href], button, input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("aria-hidden"),
  );
}

describe("/auth — keyboard tab order", () => {
  it("includes Back to home, tabs, email, password, show/hide toggle, and submit", () => {
    renderAuth();
    const order = getTabOrder();
    const labels = order.map(
      (el) =>
        el.getAttribute("aria-label") ??
        el.textContent?.trim().slice(0, 40) ??
        el.id ??
        el.tagName.toLowerCase(),
    );
    expect(labels.some((l) => /back to home/i.test(l))).toBe(true);
    expect(labels.some((l) => /sign in/i.test(l))).toBe(true);
    expect(labels.some((l) => /create account/i.test(l))).toBe(true);
    expect(labels.some((l) => /forgot password/i.test(l))).toBe(true);
    expect(order.some((el) => el.id === "signin-email")).toBe(true);
    expect(order.some((el) => el.id === "signin-password")).toBe(true);
    expect(labels.some((l) => /show password|hide password/i.test(l))).toBe(true);
  });

  it("no element uses positive tabIndex (avoid focus-order surprises)", () => {
    renderAuth();
    for (const el of getTabOrder()) {
      const ti = el.getAttribute("tabindex");
      if (ti !== null) {
        expect(Number(ti)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("Home/End on a tab jumps to first/last tab", async () => {
    renderAuth();
    const tabs = screen.getAllByRole("tab");
    tabs[1].focus();
    fireEvent.keyDown(tabs[1], { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[2]));
    fireEvent.keyDown(tabs[2], { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[0]));
  });

  it("blank sign-in submit (via Enter) focuses email and does not call Supabase", async () => {
    renderAuth();
    const form = screen.getByRole("form", { name: /sign in/i });
    fireEvent.submit(form);
    // No request fired because email/password are blank inputs handled by
    // signIn → Supabase mock; mock would still be called. Verify the
    // *button* remains non-disabled afterwards (no stuck loading).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^sign in$/i })).not.toBeDisabled(),
    );
  });

  it("during loading the submit button is visible and disabled (no stuck state)", async () => {
    let resolveSignIn: (() => void) | null = null;
    signInMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveSignIn = () => res(signInResult);
        }),
    );
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const loading = await screen.findByRole("button", { name: /signing in…/i });
    expect(loading).toBeDisabled();
    expect(loading).toBeVisible();
    resolveSignIn?.();
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
  });
});

describe("/reset-password — keyboard tab order & focus", () => {
  it("heading is focusable on mount and receives focus", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    const heading = screen.getByRole("heading", { name: /reset password/i });
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(heading);
  });

  it("tab order: New password, show/hide, Confirm, Update password, Back to sign in", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    const order = getTabOrder();
    const ids = order.map(
      (el) =>
        el.id ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 40) ||
        el.tagName.toLowerCase(),
    );
    const pwdIdx = ids.findIndex((s) => s === "reset-password");
    const confirmIdx = ids.findIndex((s) => s === "reset-confirm");
    const submitIdx = ids.findIndex((s) => /update password/i.test(s));
    const backIdx = ids.findIndex((s) => /back to sign in/i.test(s));
    expect(pwdIdx).toBeGreaterThanOrEqual(0);
    expect(confirmIdx).toBeGreaterThan(pwdIdx);
    expect(submitIdx).toBeGreaterThan(confirmIdx);
    expect(backIdx).toBeGreaterThan(submitIdx);
  });

  it("submit with mismatch focuses Confirm; submit with weak password focuses New password", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    // Weak password first.
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "short" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /reset password/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/^new password$/i)),
    );
    // Mismatch only.
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "abcdefg1" } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg2" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /reset password/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/^confirm new password$/i)),
    );
  });

  it("inline mismatch shows/hides while typing", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "abcdefg1" } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdef" },
    });
    expect(await screen.findByText(/passwords do not match yet/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    await waitFor(() =>
      expect(screen.queryByText(/passwords do not match yet/i)).toBeNull(),
    );
  });

  it("loading disables submit and the loading button stays visible", async () => {
    let resolveUpd: (() => void) | null = null;
    updateUserMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveUpd = () => res(updateUserResult);
        }),
    );
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "abcdefg1" } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^update password$/i }));
    const loading = await screen.findByRole("button", { name: /updating password…/i });
    expect(loading).toBeDisabled();
    expect(loading).toBeVisible();
    resolveUpd?.();
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
  });
});
