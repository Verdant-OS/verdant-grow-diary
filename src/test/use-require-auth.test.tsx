// useRequireAuth: calls supabase.auth.getUser on mount, redirects on
// unauthenticated, reports authenticated otherwise.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { ReactNode } from "react";

import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";

const authClient = vi.hoisted(() => ({
  auth: {} as { getUser: () => ReturnType<typeof getUserMock> },
}));
const getUserMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get auth() {
      authClient.auth.getUser = () => getUserMock();
      return authClient.auth;
    },
  },
}));
const navMock = vi.fn();
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => navMock };
});

import { useRequireAuth } from "@/hooks/useRequireAuth";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe("useRequireAuth", () => {
  it("redirects unauthenticated user to /auth", async () => {
    navMock.mockClear();
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(navMock).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("reports authenticated when getUser returns a user", async () => {
    navMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("does not redirect on getUser error (revalidation_failed, not signed-out)", async () => {
    navMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "bad jwt" },
    });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("fails closed without a marketing bounce when getUser rejects", async () => {
    navMock.mockClear();
    getUserMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("surfaces revalidation_failed when sign-out cleanup previously failed", async () => {
    navMock.mockClear();
    getUserMock.mockClear();
    // Hook consults getAuthSignOutOperation(supabase.auth), not the root client.
    const operation = getAuthSignOutOperation(authClient.auth);
    operation.clearFailedCleanup();
    await expect(
      operation.runSdkSignOut(() => Promise.reject(new Error("fixture cleanup failed"))),
    ).rejects.toThrow("fixture cleanup failed");
    expect(operation.hasFailedCleanup()).toBe(true);

    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(getUserMock).not.toHaveBeenCalled();
    expect(navMock).not.toHaveBeenCalled();
    operation.clearFailedCleanup();
  });

  it("does not redirect to /auth while an explicit sign-out is still pending", async () => {
    navMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    const operation = getAuthSignOutOperation(authClient.auth);
    operation.clearFailedCleanup();
    const exitGate = deferred<void>();
    const pendingExit = operation.runSdkSignOut(() => exitGate.promise);
    expect(operation.getSnapshot()).toBe("pending");

    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(navMock).not.toHaveBeenCalled();

    exitGate.resolve();
    await pendingExit;
    operation.clearFailedCleanup();
  });
});
