/**
 * Grower bug item 11: after sign-in, /onboarding hands a grower with grows to
 * `/`, and the page went blank before the dashboard. RootEntry kept its own
 * `hydrated` state, which starts false on every mount, so a client-side mount
 * for a signed-in grower first rendered (and lazy-loaded) the public Landing,
 * then swapped to AppShell. Measured in mocked Chromium: ~1 s of blank page.
 *
 * Fixed by the shared useHydrated() (useSyncExternalStore): false only during
 * SSR and the hydration render, true on any later client mount.
 */
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  loading: false,
  user: null as null | { id: string },
}));
const landingRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/store/auth", () => ({ useAuth: () => auth }));
vi.mock("@/pages/Landing", () => ({
  default: () => {
    landingRenders.count += 1;
    return <div data-testid="landing">Landing</div>;
  },
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
  landingRenders.count = 0;
});

describe("RootEntry client-side mount for a signed-in grower (item 11)", () => {
  it("goes straight to AppShell + Dashboard and never renders Landing", async () => {
    // Warm every lazy chunk first, as a real session has after its first page load.
    const warmOut = render(<RootEntry />);
    await screen.findByTestId("landing");
    warmOut.unmount();
    auth.user = { id: "grower-1" };
    const warmIn = render(<RootEntry />);
    await screen.findByTestId("dashboard");
    warmIn.unmount();
    landingRenders.count = 0;

    // The client-side navigation to `/`: a fresh RootEntry mount, signed in.
    render(<RootEntry />);

    expect(await screen.findByTestId("dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(landingRenders.count).toBe(0);
  });

  it("still hydrates the server landing without a mismatch, then shows the dashboard", async () => {
    auth.user = { id: "grower-1" };
    // Warm the lazy chunks so the server render resolves synchronously enough to compare.
    render(<RootEntry />);
    await screen.findByTestId("dashboard");

    const serverHtml = renderToString(<RootEntry />);
    expect(serverHtml).toContain("Landing");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, <RootEntry />, { onRecoverableError: recoverable });
    });
    await vi.waitFor(() =>
      expect(container.querySelector('[data-testid="dashboard"]')).not.toBeNull(),
    );
    expect(recoverable).not.toHaveBeenCalled();
    container.remove();
  });
});
