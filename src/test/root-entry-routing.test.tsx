import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  loading: false,
  user: null as null | { id: string },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => auth }));
vi.mock("@/pages/Landing", () => ({
  default: ({ canonicalPath }: { canonicalPath?: string }) => (
    <div data-testid="landing">Landing canonical: {canonicalPath}</div>
  ),
}));
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));
vi.mock("@/pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard">Private dashboard</div>,
}));

import RootEntry from "@/components/RootEntry";

beforeEach(() => {
  auth.loading = false;
  auth.user = null;
});

describe("session-aware root entry", () => {
  it("shows a calm loading state while auth is unresolved", () => {
    auth.loading = true;
    render(<RootEntry />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("landing")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("renders the public landing directly at the apex for signed-out visitors", async () => {
    render(<RootEntry />);

    expect(await screen.findByTestId("landing")).toHaveTextContent("Landing canonical: /");
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("preserves the authenticated dashboard inside AppShell", async () => {
    auth.user = { id: "grower-1" };
    render(<RootEntry />);

    expect(await screen.findByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("landing")).not.toBeInTheDocument();
  });
});
