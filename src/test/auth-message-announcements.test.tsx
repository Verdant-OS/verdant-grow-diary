// Verifies every visible auth message uses role="alert" or
// role="status" / aria-live correctly, and that no raw Supabase
// errors leak through to the user.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let signInResult: { error: { message: string } | null } = { error: null };
let signUpResult: { error: { message: string } | null } = { error: null };
let resetForEmailResult: { error: { message: string } | null } = { error: null };
let updateUserResult: { error: { message: string } | null } = { error: null };
let sessionResult: { data: { session: unknown } } = {
  data: { session: { user: { id: "u-1" } } },
};

const signInMock = vi.fn(async () => signInResult);
const signUpMock = vi.fn(async () => signUpResult);
const resetForEmailMock = vi.fn(async () => resetForEmailResult);
const updateUserMock = vi.fn(async () => updateUserResult);
const getSessionMock = vi.fn(async () => sessionResult);

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
  signUpResult = { error: null };
  resetForEmailResult = { error: null };
  updateUserResult = { error: null };
  sessionResult = { data: { session: { user: { id: "u-1" } } } };
  signInMock.mockClear();
  signUpMock.mockClear();
  resetForEmailMock.mockClear();
  updateUserMock.mockClear();
  getSessionMock.mockClear();
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
        <Route path="/auth" element={<div>Sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function activateTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

const RAW_SUPABASE_FRAGMENTS = [
  /Invalid login credentials/i,
  /AuthApiError/i,
  /User already registered/i,
  /rate limited/i,
  /token expired/i,
  /JWT/i,
];

function expectNoRawSupabase(text: string) {
  for (const r of RAW_SUPABASE_FRAGMENTS) {
    expect(text).not.toMatch(r);
  }
}

describe("/auth — message announcement coverage", () => {
  it("sign-in failure renders inside role=alert with friendly copy", async () => {
    signInResult = { error: { message: "Invalid login credentials" } };
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn['’]t sign you in/i);
    expectNoRawSupabase(alert.textContent ?? "");
  });

  it("create-account local validation error is in role=alert and not enumerating", async () => {
    renderAuth();
    activateTab(/create account/i);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/at least 8 characters/i);
    expect(alert).not.toHaveTextContent(/already exists|already registered|in use/i);
  });

  it("create-account server failure shows friendly copy in role=alert", async () => {
    signUpResult = { error: { message: "User already registered" } };
    renderAuth();
    activateTab(/create account/i);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn['’]t create that account/i);
    expectNoRawSupabase(alert.textContent ?? "");
  });

  it("forgot-password blank email shows role=alert near the field", async () => {
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/enter the email/i);
    // describedby wires the field to the error
    const field = screen.getByLabelText(/email/i);
    expect(field.getAttribute("aria-describedby")).toContain("forgot-email-error");
  });

  it("forgot-password rate-limit failure shows role=alert with generic retry copy", async () => {
    resetForEmailResult = { error: { message: "rate limited" } };
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/try again in a few minutes/i);
    expectNoRawSupabase(alert.textContent ?? "");
  });

  it("forgot-password success uses role=status / aria-live=polite (non-enumerating)", async () => {
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/if an account exists for that email/i);
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});

describe("/reset-password — message announcement coverage", () => {
  it("missing/expired recovery session renders in role=alert", async () => {
    sessionResult = { data: { session: null } };
    renderReset();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/missing or expired/i);
  });

  it("checking state uses role=status with aria-live=polite", async () => {
    // Keep getSession pending so we observe the "checking" state.
    let resolveSession: ((v: typeof sessionResult) => void) | null = null;
    getSessionMock.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveSession = res;
        }) as Promise<typeof sessionResult>,
    );
    renderReset();
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/checking reset link/i);
    expect(status.getAttribute("aria-live")).toBe("polite");
    resolveSession?.({ data: { session: { user: { id: "u-1" } } } });
  });

  it("confirm mismatch is announced via aria-live=polite as user types", async () => {
    renderReset();
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "differen2" },
    });
    const live = await screen.findByText(/passwords do not match yet/i);
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.getAttribute("role")).toBe("status");
    const confirm = screen.getByLabelText(/^confirm new password$/i);
    expect(confirm.getAttribute("aria-invalid")).toBe("true");
    expect(confirm.getAttribute("aria-describedby") ?? "").toContain(
      "reset-confirm-mismatch",
    );
    // When they match, mismatch disappears.
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    await waitFor(() =>
      expect(screen.queryByText(/passwords do not match yet/i)).toBeNull(),
    );
  });

  it("reset failure renders in role=alert with non-enumerating copy", async () => {
    updateUserResult = { error: { message: "token expired" } };
    renderReset();
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^update password$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired|new reset email/i);
    expectNoRawSupabase(alert.textContent ?? "");
  });
});

describe("/reset-password — focus on submit by error type", () => {
  it("focuses Confirm when mismatch is the only blocker on submit", async () => {
    renderReset();
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg2" },
    });
    // Even though submit is disabled in UI, simulate form submit directly.
    const form = screen.getByRole("form", { name: /reset password/i });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(/^confirm new password$/i),
      ),
    );
  });

  it("focuses New password when password rule fails before confirm check", async () => {
    renderReset();
    await waitFor(() =>
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "short" },
    });
    const form = screen.getByRole("form", { name: /reset password/i });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/^new password$/i)),
    );
  });
});
