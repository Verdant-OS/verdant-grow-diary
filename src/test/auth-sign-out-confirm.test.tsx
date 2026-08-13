// SignOutConfirmDialog: cancel preserves session, confirm signs out and
// redirects to /welcome; failure still redirects with a non-sensitive toast.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { SIGN_OUT_FAILURE_MESSAGE } from "@/lib/authSessionExitRules";

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u" }, loading: false, signOut: signOutMock }),
}));
const navMock = vi.fn();
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => navMock };
});
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() },
}));

function setup() {
  return render(
    <MemoryRouter>
      <SignOutConfirmDialog trigger={<button>Sign out</button>} />
    </MemoryRouter>,
  );
}

describe("SignOutConfirmDialog", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
    navMock.mockClear();
    toastError.mockClear();
  });

  it("opens on trigger and shows confirm copy", () => {
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    expect(screen.getByText("Sign out?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("cancel does not sign out or redirect", () => {
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navMock).not.toHaveBeenCalled();
  });

  it("confirm calls signOut and redirects to /welcome", async () => {
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    const buttons = screen.getAllByRole("button", { name: /sign out/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("on signOut throw: still redirects and toasts non-sensitive failure copy (#588)", async () => {
    signOutMock.mockRejectedValueOnce(new Error("network token session"));
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    const buttons = screen.getAllByRole("button", { name: /sign out/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(toastError).toHaveBeenCalledWith(SIGN_OUT_FAILURE_MESSAGE);
    expect(toastError.mock.calls[0][0]).not.toMatch(/network|token|session/i);
  });
});
