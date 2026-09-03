/**
 * #588 — AppShell must withhold protected pageContent until useRequireAuth
 * (getUser) settles, and must not enable alerts while status is still loading.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const APP_SHELL = readFileSync(resolve(__dirname, "../..", "src/components/AppShell.tsx"), "utf8");

// ---- runtime harness for the revalidation_failed branch (no JSX: .ts file) ----
const { signOutSpy } = vi.hoisted(() => ({ signOutSpy: vi.fn(async () => {}) }));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com", email_confirmed_at: "2026-07-01" },
    loading: false,
    signOut: signOutSpy,
  }),
}));
// Keep the real AUTH_REVALIDATE_EVENT constant; pin the status the branch renders for.
vi.mock("@/hooks/useRequireAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useRequireAuth")>("@/hooks/useRequireAuth");
  return { ...actual, useRequireAuth: () => ({ status: "revalidation_failed", retry: vi.fn() }) };
});
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro_monthly" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/GlobalFastAddButton", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AppShell from "@/components/AppShell";
import { AUTH_REVALIDATE_EVENT } from "@/hooks/useRequireAuth";

function renderShellWithProtectedChild() {
  const child = createElement("div", { "data-testid": "protected-child" }, "private page");
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dashboard"] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: "*", element: createElement(AppShell, null, child) }),
      ),
    ),
  );
}

afterEach(() => {
  cleanup();
  signOutSpy.mockClear();
});

describe("AppShell auth revalidation gate (#588)", () => {
  it("holds the loading shell while authStatus is loading", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']loading["']/);
    expect(APP_SHELL).toMatch(/!hydrated \|\| loading \|\| authStatus === ["']loading["']/);
  });

  it("does not mount pageContent for unauthenticated after revalidation", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']unauthenticated["']/);
  });

  it("gates useAlertsList on server-validated session, not cache alone", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']authenticated["']/);
    expect(APP_SHELL).toMatch(/enabled:\s*sessionReady/);
    // Must not re-introduce the cache-only enable.
    expect(APP_SHELL).not.toMatch(/enabled:\s*!loading && !!user\s*}/);
  });

  it("withholds pageContent on revalidation_failed (no welcome bounce), but never as a dead end", () => {
    expect(APP_SHELL).toMatch(/authStatus === ["']revalidation_failed["']/);
    const start = APP_SHELL.indexOf('if (authStatus === "revalidation_failed")');
    const end = APP_SHELL.indexOf('if (!user || authStatus === "unauthenticated") return null;');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = APP_SHELL.slice(start, end);
    // Still fail-closed for private REST: no page content, no Outlet, no bounce.
    expect(branch).not.toMatch(/pageContent|<Outlet|nav\(|navigate\(/);
    // But recoverable: a Retry that re-runs getUser and an explicit sign-out,
    // not a bare Loading shell the grower can never leave.
    expect(branch).toMatch(/data-testid="app-shell-revalidation-failed"/);
    expect(branch).toMatch(/AUTH_REVALIDATE_EVENT/);
    expect(branch).toMatch(/SignOutConfirmDialog/);
    expect(branch).not.toMatch(/Loading…/);
  });
  it("gates useMyEntitlements on sessionReady, the same trust gate as alerts (#1256 P2)", () => {
    expect(APP_SHELL).toMatch(/useMyEntitlements\(\{\s*enabled:\s*sessionReady,?\s*\}\)/);
    // sessionReady must be declared before the entitlements call reads it.
    const sessionReadyAt = APP_SHELL.indexOf("const sessionReady =");
    expect(sessionReadyAt).toBeGreaterThan(-1);
    expect(sessionReadyAt).toBeLessThan(APP_SHELL.indexOf("useMyEntitlements({"));
    // Must not regress to the narrower authStatus-only gate, nor to an ungated call.
    expect(APP_SHELL).not.toMatch(/enabled:\s*authStatus === ["']authenticated["']/);
    expect(APP_SHELL).not.toMatch(/useMyEntitlements\(\)/);
  });
});

describe("AppShell revalidation_failed at runtime (#1262)", () => {
  it("renders the recovery card and keeps protected children unmounted, with no bare Loading", () => {
    renderShellWithProtectedChild();
    expect(screen.getByTestId("app-shell-revalidation-failed")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByText(/^Loading/)).toBeNull();
  });

  it("Retry dispatches the auth revalidation event the hook listens for", () => {
    const revalidate = vi.fn();
    window.addEventListener(AUTH_REVALIDATE_EVENT, revalidate);
    try {
      renderShellWithProtectedChild();
      fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
      expect(revalidate).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("protected-child")).toBeNull();
    } finally {
      window.removeEventListener(AUTH_REVALIDATE_EVENT, revalidate);
    }
  });

  it("Sign out opens the usual confirmation and signs nobody out until confirmed", async () => {
    renderShellWithProtectedChild();
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/sign out\?/i);
    expect(signOutSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("protected-child")).toBeNull();
  });
});
