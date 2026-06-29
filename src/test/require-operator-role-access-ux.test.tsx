/**
 * RequireOperatorRole — denied/granted/loading state tests.
 *
 * Verifies the improved access-restricted screen surfaces the signed-in email
 * and clear guidance, never exposes role internals, and the gate still defers
 * to the server-side useHasRole RPC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const roleState: { status: string } = { status: "denied" };
const authState: { user: { id?: string; email?: string | null } | null } = {
  user: { id: "00000000-0000-0000-0000-000000000001", email: "user@example.com" },
};

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({
    status: roleState.status,
    granted: roleState.status === "granted",
    error: null,
  }),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: authState.user, session: null, loading: false, signOut: async () => {} }),
}));

import { RequireOperatorRole } from "@/components/RequireOperatorRole";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/operator/demo-preview"]}>
      <Routes>
        <Route element={<RequireOperatorRole />}>
          <Route path="/operator/demo-preview" element={<div data-testid="granted-child">OK</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN = [
  "service_role",
  "jwt",
  "auth.uid",
  "user_roles",
  "has_role",
  "access_token",
  "refresh_token",
  "api_token",
  "bridge_token",
  "fake live",
  "automatically executes",
  "auto execute",
  "controls your grow",
  "device command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
];

describe("RequireOperatorRole — denied state", () => {
  beforeEach(() => {
    roleState.status = "denied";
    authState.user = { id: "00000000-0000-0000-0000-000000000001", email: "user@example.com" };
  });

  it("renders signed-in email", () => {
    renderGuard();
    expect(screen.getByTestId("require-operator-denied-email").textContent).toMatch(/user@example\.com/);
  });

  it("renders access guidance copy", () => {
    renderGuard();
    expect(screen.getByText(/does not have operator access/i)).toBeInTheDocument();
    expect(screen.getByText(/operator-role account or ask the project owner/i)).toBeInTheDocument();
  });

  it("renders 'No operator data was loaded.'", () => {
    renderGuard();
    expect(screen.getByText(/no operator data was loaded\./i)).toBeInTheDocument();
  });

  it("does not render the user id or role internals", () => {
    renderGuard();
    const body = (document.body.textContent ?? "").toLowerCase();
    expect(body).not.toContain("00000000-0000-0000-0000-000000000001");
    for (const term of FORBIDDEN) {
      expect(body).not.toContain(term);
    }
  });

  it("falls back to a safe message when email is unavailable", () => {
    authState.user = { id: "abc", email: null };
    renderGuard();
    expect(screen.getByTestId("require-operator-denied-email-missing").textContent).toMatch(/email is unavailable/i);
  });
});

describe("RequireOperatorRole — granted and loading", () => {
  it("renders Outlet when role is granted", () => {
    roleState.status = "granted";
    renderGuard();
    expect(screen.getByTestId("granted-child")).toBeInTheDocument();
  });

  it("does not flash operator content while loading", () => {
    roleState.status = "loading";
    renderGuard();
    expect(screen.queryByTestId("granted-child")).toBeNull();
    expect(screen.getByTestId("require-operator-loading")).toBeInTheDocument();
  });
});
