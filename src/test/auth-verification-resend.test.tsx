// Targeted tests for auth error classifier + verification-required UI surface.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  classifyAuthError,
  EMAIL_VERIFICATION_REQUIRED_MESSAGE,
  RESEND_VERIFICATION_GENERIC_SUCCESS,
  RESEND_VERIFICATION_GENERIC_FAILURE,
  FORBIDDEN_AUTH_ERROR_FRAGMENTS,
} from "@/lib/authErrorRules";

const signInMock = vi.fn();
const resendMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (a: unknown) => signInMock(a),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resend: (a: unknown) => resendMock(a),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: () => {} } },
      })),
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

import Auth from "@/pages/Auth";

beforeEach(() => {
  signInMock.mockReset();
  resendMock.mockReset();
});

describe("classifyAuthError", () => {
  it("recognizes email-not-confirmed shapes", () => {
    expect(classifyAuthError({ message: "Email not confirmed" })).toBe("emailNotConfirmed");
    expect(classifyAuthError({ code: "email_not_confirmed" })).toBe("emailNotConfirmed");
    expect(classifyAuthError({ error_description: "email-not-confirmed" })).toBe(
      "emailNotConfirmed",
    );
  });
  it("returns unknown for nulls / unrelated errors", () => {
    expect(classifyAuthError(null)).toBe("unknown");
    expect(classifyAuthError({ message: "Invalid login credentials" })).toBe("unknown");
    expect(classifyAuthError({})).toBe("unknown");
  });
  it("classifier itself does not return raw strings (return type is opaque tag)", () => {
    const tag = classifyAuthError({ message: "Email not confirmed" });
    for (const re of FORBIDDEN_AUTH_ERROR_FRAGMENTS) {
      expect(re.test(tag)).toBe(false);
    }
  });
});

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <Auth />
    </MemoryRouter>,
  );
}

describe("Sign-in verification-required UI", () => {
  it("shows verification-required state + resend button on email-not-confirmed error", async () => {
    signInMock.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed", code: "email_not_confirmed" },
    });
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "noop@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() =>
      expect(screen.getByText(EMAIL_VERIFICATION_REQUIRED_MESSAGE)).toBeInTheDocument(),
    );
    // Generic sign-in error is NOT shown in this branch.
    expect(screen.queryByText(/couldn['’]t sign you in/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /resend verification email/i }),
    ).toBeInTheDocument();
  });

  it("resend success uses generic non-enumerating copy", async () => {
    signInMock.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed" },
    });
    resendMock.mockResolvedValue({ data: {}, error: null });
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "noop@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await screen.findByRole("button", { name: /resend verification email/i });
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() => expect(resendMock).toHaveBeenCalledTimes(1));
    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "noop@example.invalid",
    });
    await waitFor(() =>
      expect(screen.getByText(RESEND_VERIFICATION_GENERIC_SUCCESS)).toBeInTheDocument(),
    );
  });

  it("resend failure uses generic non-enumerating copy", async () => {
    signInMock.mockResolvedValue({
      data: {},
      error: { message: "Email not confirmed" },
    });
    resendMock.mockRejectedValue(new Error("boom"));
    renderAuth();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "noop@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await screen.findByRole("button", { name: /resend verification email/i });
    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));
    await waitFor(() =>
      expect(screen.getByText(RESEND_VERIFICATION_GENERIC_FAILURE)).toBeInTheDocument(),
    );
  });
});
