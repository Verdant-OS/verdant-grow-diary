// Auth & ResetPassword a11y / UX behavior tests.
//  - ARIA tab roles + keyboard navigation
//  - loading / disabled button states
//  - friendly non-enumerating error copy
//  - reset page password-requirements helper
//  - focus management on submit error
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let signInResult: { error: { message: string } | null } = { error: null };
let signUpResult: { error: { message: string } | null } = { error: null };
let resetForEmailResult: { error: { message: string } | null } = { error: null };
let updateUserResult: { error: { message: string } | null } = { error: null };

let signInResolve: (() => void) | null = null;
let signUpResolve: (() => void) | null = null;
let resetForEmailResolve: (() => void) | null = null;
let updateUserResolve: (() => void) | null = null;

const signInMock = vi.fn(
  () =>
    new Promise((res) => {
      signInResolve = () => res(signInResult);
    }),
);
const signUpMock = vi.fn(
  () =>
    new Promise((res) => {
      signUpResolve = () => res(signUpResult);
    }),
);
const resetForEmailMock = vi.fn(
  () =>
    new Promise((res) => {
      resetForEmailResolve = () => res(resetForEmailResult);
    }),
);
const updateUserMock = vi.fn(
  () =>
    new Promise((res) => {
      updateUserResolve = () => res(updateUserResult);
    }),
);

const getSessionMock = vi
  .fn()
  .mockResolvedValue({ data: { session: { user: { id: "u-1" } } } });

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
  signInResolve = null;
  signUpResolve = null;
  resetForEmailResolve = null;
  updateUserResolve = null;
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

function activateTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

describe("Auth tabs — ARIA & keyboard", () => {
  it("renders a tablist with three tabs and one selected", () => {
    renderAuth();
    const list = screen.getByRole("tablist");
    expect(list).toBeInTheDocument();
    const tabs = within(list).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    const selected = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toBeTruthy();
    expect(selected).toHaveTextContent(/sign in/i);
  });

  it("each tab controls a tabpanel", () => {
    renderAuth();
    const tabs = screen.getAllByRole("tab");
    for (const tab of tabs) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();
    }
    // Active panel is rendered with role=tabpanel.
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("ArrowRight / ArrowLeft / Home / End move focus between tabs", async () => {
    renderAuth();
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[1]));
    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[2]));
    fireEvent.keyDown(tabs[2], { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[1]));
    fireEvent.keyDown(tabs[1], { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[2]));
    fireEvent.keyDown(tabs[2], { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[0]));
  });
});

describe("Auth — loading & disabled states", () => {
  it("sign-in button shows Signing in… and disables during request", async () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    const btn = screen.getByRole("button", { name: /^sign in$/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /signing in…/i })).toBeDisabled(),
    );
    // resolve the pending promise
    signInResolve?.();
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
  });

  it("create-account button shows Creating account… and disables during request", async () => {
    renderAuth();
    activateTab(/create account/i);
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /creating account…/i })).toBeDisabled(),
    );
    signUpResolve?.();
    await waitFor(() => expect(signUpMock).toHaveBeenCalledTimes(1));
  });

  it("forgot button shows Sending reset link… and disables during request", async () => {
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sending reset link…/i })).toBeDisabled(),
    );
    resetForEmailResolve?.();
    await waitFor(() => expect(resetForEmailMock).toHaveBeenCalledTimes(1));
  });
});

describe("Auth — friendly non-enumerating errors", () => {
  it("sign-in failure shows friendly copy and focuses email", async () => {
    signInResult = { error: { message: "Invalid login credentials" } };
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    signInResolve?.();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn['’]t sign you in/i);
    expect(alert).not.toHaveTextContent(/no account|user does not exist|email not registered/i);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/^email$/i)),
    );
  });

  it("forgot-password network failure shows generic retry copy", async () => {
    resetForEmailResult = { error: { message: "rate limited" } };
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    resetForEmailResolve?.();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/try again in a few minutes/i);
    expect(alert).not.toHaveTextContent(/no account|user does not exist/i);
  });

  it("forgot-password success copy is generic (does not reveal account)", async () => {
    renderAuth();
    activateTab(/forgot password/i);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    resetForEmailResolve?.();
    expect(
      await screen.findByText(/if an account exists for that email/i),
    ).toBeInTheDocument();
  });
});

describe("ResetPassword — requirements helper, loading, errors", () => {
  it("renders local-only requirements helper without server-certainty claims", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    expect(screen.getByText(/checked locally before submit/i)).toBeInTheDocument();
    // None of these claims should appear.
    for (const phrase of [/strong password/i, /secure/i, /server approved/i, /guaranteed/i, /breached/i]) {
      expect(screen.queryByText(phrase)).toBeNull();
    }
    // All four requirement rows present.
    expect(screen.getByTestId("req-minLength")).toBeInTheDocument();
    expect(screen.getByTestId("req-hasLetter")).toBeInTheDocument();
    expect(screen.getByTestId("req-hasNumber")).toBeInTheDocument();
    expect(screen.getByTestId("req-matchesConfirm")).toBeInTheDocument();
  });

  it("submit is disabled until all local rules pass", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    const submit = screen.getByRole("button", { name: /^update password$/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it("button shows Updating password… and disables during request", async () => {
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^update password$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /updating password…/i })).toBeDisabled(),
    );
    updateUserResolve?.();
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledTimes(1));
  });

  it("reset failure shows friendly expired-link copy and refocuses password", async () => {
    updateUserResult = { error: { message: "token expired" } };
    renderReset();
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    const pwd = screen.getByLabelText(/^new password$/i);
    fireEvent.change(pwd, { target: { value: "abcdefg1" } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: "abcdefg1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^update password$/i }));
    updateUserResolve?.();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/expired|new reset email/i);
    expect(alert).not.toHaveTextContent(/no account|user does not exist|email not registered/i);
    await waitFor(() => expect(document.activeElement).toBe(pwd));
  });
});
