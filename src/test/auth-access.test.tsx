// Auth access UI tests — sign in, create account, forgot password, back to home.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const resetForEmailMock = vi.fn().mockResolvedValue({ data: {}, error: null });
const signInMock = vi.fn();
const signUpMock = vi.fn();
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: null } });
const onAuthStateChangeMock = vi.fn((_a?: any, _b?: any) => ({
  data: { subscription: { unsubscribe: () => {} } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (a?: any, b?: any) => resetForEmailMock(a, b),
      signInWithPassword: (a?: any, b?: any) => signInMock(a, b),
      signUp: (a?: any, b?: any) => signUpMock(a, b),
      getSession: () => getSessionMock(),
      onAuthStateChange: (a?: any, b?: any) => onAuthStateChangeMock(a, b),
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

describe("Auth page essentials", () => {
  it("shows Sign in, Create account, Forgot password, and Back to home", () => {
    renderAuth();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/welcome",
    );
  });

  it("renders product positioning copy", () => {
    renderAuth();
    expect(
      screen.getByText(/plant memory\. sensor truth\. better decisions\./i),
    ).toBeInTheDocument();
  });

  it("sign-in form has accessible email and password labels", () => {
    renderAuth();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("password field has show/hide toggle", () => {
    renderAuth();
    const pwd = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(pwd.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(pwd.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(pwd.type).toBe("password");
  });
});

describe("Forgot password flow", () => {
  it("validates blank email", async () => {
    renderAuth();
    fireEvent.click(screen.getByRole("tab", { name: /forgot password/i }));
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/enter the email/i);
    expect(resetForEmailMock).not.toHaveBeenCalled();
  });

  it("validates invalid email", async () => {
    renderAuth();
    fireEvent.click(screen.getByRole("tab", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(resetForEmailMock).not.toHaveBeenCalled();
  });

  it("calls resetPasswordForEmail with /reset-password redirect and shows generic success", async () => {
    resetForEmailMock.mockClear();
    renderAuth();
    fireEvent.click(screen.getByRole("tab", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "grower@verdant.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    await waitFor(() => expect(resetForEmailMock).toHaveBeenCalledTimes(1));
    const [email, opts] = resetForEmailMock.mock.calls[0];
    expect(email).toBe("grower@verdant.app");
    expect(String(opts.redirectTo)).toMatch(/\/reset-password$/);
    expect(
      await screen.findByText(/if an account exists for that email/i),
    ).toBeInTheDocument();
  });
});

describe("Auth source — safety static checks", () => {
  const SRC = readFileSync(resolve(__dirname, "../pages/Auth.tsx"), "utf8");
  const RESET = readFileSync(resolve(__dirname, "../pages/ResetPassword.tsx"), "utf8");
  const RULES = readFileSync(
    resolve(__dirname, "../lib/passwordResetRules.ts"),
    "utf8",
  );
  const ALL = SRC + RESET + RULES;

  it("does not import service_role", () => {
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("does not perform admin password reset", () => {
    expect(ALL).not.toMatch(/auth\.admin/);
  });
  it("does not log passwords, tokens, sessions, or recovery urls", () => {
    expect(ALL).not.toMatch(
      /console\.(log|warn|error|info|debug)\s*\([^)]*\b(password|token|session|recovery|access_token|refresh_token|email)\b/i,
    );
  });
  it("does not hardcode reset tokens", () => {
    expect(ALL).not.toMatch(/access_token=|refresh_token=|recovery_token=/);
  });
  it("redirects forgot password to /reset-password", () => {
    expect(SRC).toMatch(/buildResetRedirectUrl/);
  });
});
