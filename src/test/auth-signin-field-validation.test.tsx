// Sign-in form validates email and a non-empty password on the page
// before supabase.auth.signInWithPassword. Copy and the email rule match
// the forgot-password validator. Server failures stay on the friendly path.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

const signInMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInMock(...args),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
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

beforeEach(() => {
  signInMock.mockReset();
  signInMock.mockResolvedValue({ data: { session: null }, error: null });
});

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("sign-in on-page field validation", () => {
  it("empty submit shows email and password errors and does not call Supabase", async () => {
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const emailAlert = await screen.findByText("Enter the email for your Verdant account.");
    expect(emailAlert).toHaveAttribute("role", "alert");
    expect(emailAlert).toHaveAttribute("id", "signin-email-error");
    const passwordAlert = screen.getByText("Enter your password.");
    expect(passwordAlert).toHaveAttribute("role", "alert");
    expect(passwordAlert).toHaveAttribute("id", "signin-password-error");
    expect(signInMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't sign you in/i)).not.toBeInTheDocument();
    const email = screen.getByLabelText(/^email$/i);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email.getAttribute("aria-describedby")).toContain("signin-email-error");
    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password.getAttribute("aria-describedby")).toContain("signin-password-error");
    await waitFor(() => expect(document.activeElement).toBe(email));
  });

  it("rejects a malformed email without a sign-in request", async () => {
    renderAuth();
    fill(/^email$/i, "notanemail");
    fill(/^password$/i, "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const alert = await screen.findByText("Enter a valid email address.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(signInMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^password$/i)).not.toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a blank password when the email is valid", async () => {
    renderAuth();
    fill(/^email$/i, "  grower@verdant.app  ");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const alert = await screen.findByText("Enter your password.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(signInMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^email$/i)).not.toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^password$/i)));
  });

  it("sends the trimmed email when both fields pass", async () => {
    renderAuth();
    fill(/^email$/i, "  grower@verdant.app  ");
    fill(/^password$/i, "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    expect(signInMock).toHaveBeenCalledWith({
      email: "grower@verdant.app",
      password: "longenough1",
    });
  });
});
