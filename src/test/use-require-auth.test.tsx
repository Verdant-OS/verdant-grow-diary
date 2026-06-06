// useRequireAuth: calls supabase.auth.getUser on mount, redirects on
// unauthenticated, reports authenticated otherwise.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const getUserMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => getUserMock() } },
}));
const navMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navMock };
});

import { useRequireAuth } from "@/hooks/useRequireAuth";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

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

  it("redirects on getUser error", async () => {
    navMock.mockClear();
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "bad jwt" },
    });
    const { result } = renderHook(() => useRequireAuth("/auth"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(navMock).toHaveBeenCalledWith("/auth", { replace: true });
  });
});
