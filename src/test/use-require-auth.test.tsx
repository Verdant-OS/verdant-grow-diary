// useRequireAuth: calls supabase.auth.getUser on mount, redirects on
// unauthenticated, reports authenticated otherwise. A getUser error is
// revalidation_failed (stay on the protected URL), not a marketing bounce.
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import type { ReactNode } from "react";

const getUserMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => getUserMock() } },
}));
const navMock = vi.fn();
vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => navMock };
});

import { AUTH_REVALIDATE_EVENT, useRequireAuth } from "@/hooks/useRequireAuth";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

/** Live bounce target AppShell used to hand the hook for /grows. */
const GROWS_SIGNED_OUT = "/welcome?redirectTo=%2Fgrows";

describe("useRequireAuth", () => {
  beforeEach(() => {
    navMock.mockClear();
    getUserMock.mockReset();
  });

  it("redirects unauthenticated user to /auth", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(navMock).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("true signed-out still bounces to /welcome (no user, no getUser error)", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(navMock).toHaveBeenCalledWith(GROWS_SIGNED_OUT, { replace: true });
  });

  it("reports authenticated when getUser returns a user", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("does not bounce to /welcome on getUser error (revalidation_failed, not signed-out)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "bad jwt" },
    });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("fails closed without a marketing bounce when getUser rejects", async () => {
    getUserMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(navMock).not.toHaveBeenCalled();
  });

  it("retry re-runs getUser after a transport error and stays off /welcome", async () => {
    getUserMock
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "bad jwt" },
      })
      .mockResolvedValue({
        data: { user: { id: "u-1" } },
        error: null,
      });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    const callsBeforeRetry = getUserMock.mock.calls.length;

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(getUserMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    expect(navMock).not.toHaveBeenCalled();
  });

  it("AUTH_REVALIDATE_EVENT re-runs getUser the same way Retry does", async () => {
    getUserMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({
      data: { user: { id: "u-1" } },
      error: null,
    });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    const callsBeforeRetry = getUserMock.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT));
    });

    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(getUserMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    expect(navMock).not.toHaveBeenCalled();
  });
});
