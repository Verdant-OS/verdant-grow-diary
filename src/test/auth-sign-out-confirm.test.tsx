// SignOutConfirmDialog: cancel preserves session, confirm signs out and
// redirects to /auth.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u" }, loading: false, signOut: signOutMock }),
}));
const navMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navMock };
});

function setup() {
  return render(
    <MemoryRouter>
      <SignOutConfirmDialog trigger={<button>Sign out</button>} />
    </MemoryRouter>,
  );
}

describe("SignOutConfirmDialog", () => {
  it("opens on trigger and shows confirm copy", () => {
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    expect(screen.getByText("Sign out?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("cancel does not sign out or redirect", () => {
    signOutMock.mockClear();
    navMock.mockClear();
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navMock).not.toHaveBeenCalled();
  });

  it("confirm calls signOut and redirects to /auth", async () => {
    signOutMock.mockClear();
    navMock.mockClear();
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    // Action button (not the trigger): find inside dialog by role
    const buttons = screen.getAllByRole("button", { name: /sign out/i });
    // last one is the AlertDialogAction
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith("/auth", { replace: true });
  });
});
