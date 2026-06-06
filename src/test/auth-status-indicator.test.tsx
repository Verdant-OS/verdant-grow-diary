// AuthStatusIndicator renders loading / signed-in / signed-out states
// and never leaks email/user-id/tokens.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthStatusIndicator from "@/components/AuthStatusIndicator";

vi.mock("@/store/auth", () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from "@/store/auth";
const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

describe("AuthStatusIndicator", () => {
  it("shows loading state", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<AuthStatusIndicator />);
    const el = screen.getByTestId("auth-status-indicator");
    expect(el).toHaveAttribute("data-auth-state", "loading");
    expect(el.textContent).toMatch(/Checking/);
  });

  it("shows signed-in state without leaking identifiers", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-abc-123", email: "secret@example.com" },
      loading: false,
    });
    render(<AuthStatusIndicator />);
    const el = screen.getByTestId("auth-status-indicator");
    expect(el).toHaveAttribute("data-auth-state", "signed-in");
    expect(el.textContent).toMatch(/Signed in/);
    expect(el.textContent).not.toMatch(/secret@example.com/);
    expect(el.textContent).not.toMatch(/user-abc-123/);
  });

  it("shows signed-out state", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<AuthStatusIndicator />);
    const el = screen.getByTestId("auth-status-indicator");
    expect(el).toHaveAttribute("data-auth-state", "signed-out");
    expect(el.textContent).toMatch(/Signed out/);
  });
});
