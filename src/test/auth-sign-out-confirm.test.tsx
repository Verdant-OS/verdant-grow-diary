// SignOutConfirmDialog: cancel preserves session, confirm signs out and
// redirects to /welcome; failure still redirects with a non-sensitive toast.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { SIGN_OUT_FAILURE_MESSAGE } from "@/lib/authSessionExitRules";

const signOutMock = vi.fn().mockResolvedValue(undefined);
const finishMock = vi.fn();
let isCurrent = true;
const beginSignOutNavigationMock = vi.fn(() => ({
  isCurrent: () => isCurrent,
  finish: finishMock,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "u" },
    loading: false,
    signOut: signOutMock,
    beginSignOutNavigation: beginSignOutNavigationMock,
  }),
}));
const navMock = vi.fn().mockResolvedValue(undefined);
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

async function confirmSignOut() {
  fireEvent.click(screen.getByText("Sign out"));
  const buttons = screen.getAllByRole("button", { name: /sign out/i });
  fireEvent.click(buttons[buttons.length - 1]);
}

describe("SignOutConfirmDialog", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
    beginSignOutNavigationMock.mockReset();
    beginSignOutNavigationMock.mockImplementation(() => ({
      isCurrent: () => isCurrent,
      finish: finishMock,
    }));
    finishMock.mockReset();
    isCurrent = true;
    navMock.mockClear();
    navMock.mockResolvedValue(undefined);
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
    expect(beginSignOutNavigationMock).not.toHaveBeenCalled();
  });

  it("confirm acquires navigation ownership, signs out, navigates, and releases the lease", async () => {
    setup();
    await confirmSignOut();
    await waitFor(() => expect(beginSignOutNavigationMock).toHaveBeenCalledTimes(1));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navMock).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(finishMock).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("does not start a duplicate exit when navigation ownership is already held", async () => {
    beginSignOutNavigationMock.mockReturnValueOnce(null as never);
    setup();
    await confirmSignOut();
    await waitFor(() => expect(beginSignOutNavigationMock).toHaveBeenCalledTimes(1));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navMock).not.toHaveBeenCalled();
    expect(finishMock).not.toHaveBeenCalled();
  });

  it("ignores stale navigation when the operation is superseded before redirect", async () => {
    isCurrent = false;
    setup();
    await confirmSignOut();
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(finishMock).toHaveBeenCalledTimes(1);
  });

  it("double confirm does not invoke signOut twice", async () => {
    let releaseSignOut!: () => void;
    signOutMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSignOut = resolve;
        }),
    );
    setup();
    fireEvent.click(screen.getByText("Sign out"));
    const confirm = screen.getAllByRole("button", { name: /sign out/i }).at(-1)!;
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    releaseSignOut();
    await waitFor(() => expect(navMock).toHaveBeenCalledTimes(1));
  });

  it("on resolved { error }: still redirects, toasts non-sensitive copy, and releases the lease (#588)", async () => {
    signOutMock.mockResolvedValueOnce({ error: { message: "Auth session missing" } });
    setup();
    await confirmSignOut();
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(toastError).toHaveBeenCalledWith(SIGN_OUT_FAILURE_MESSAGE);
    expect(toastError.mock.calls[0][0]).not.toMatch(/session|token|Auth/i);
    expect(finishMock).toHaveBeenCalledTimes(1);
  });

  it("on signOut throw: still redirects and toasts non-sensitive failure copy (#588)", async () => {
    signOutMock.mockRejectedValueOnce(new Error("network token session"));
    setup();
    await confirmSignOut();
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(toastError).toHaveBeenCalledWith(SIGN_OUT_FAILURE_MESSAGE);
    expect(toastError.mock.calls[0][0]).not.toMatch(/network|token|session/i);
    expect(finishMock).toHaveBeenCalledTimes(1);
  });
});
