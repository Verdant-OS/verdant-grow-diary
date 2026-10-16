import { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_QUICK_LOG_FAB_BOTTOM_REM,
  DESKTOP_QUICK_LOG_FAB_HEIGHT_REM,
  MOBILE_QUICK_LOG_FAB_BOTTOM_REM,
  MOBILE_QUICK_LOG_FAB_HEIGHT_REM,
  QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS,
  QUICK_LOG_FAB_CONTENT_GAP_REM,
  QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS,
  desktopQuickLogContentClearanceRem,
  mobileQuickLogContentClearanceRem,
} from "@/lib/quickLogFabClearanceRules";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com", email_confirmed_at: "2026-07-01" },
    loading: false,
  }),
}));
vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "free" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [] }),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({
  default: () => <div data-testid="legal-footer-links">Terms · Privacy · Refunds</div>,
}));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

import AppShell from "@/components/AppShell";
import QuickLogV2Fab from "@/components/QuickLogV2Fab";

function renderAppShellAt(pathname: string, pageContent: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<AppShell>{pageContent}</AppShell>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Issue #2205 — mobile (375px) Quick Log FAB bottom clearance on Plant, Alerts, and Settings", () => {
  it("calculates mobile FAB clearance from bottom offset (5rem), button height (3.5rem), and gap (1rem)", () => {
    expect(mobileQuickLogContentClearanceRem()).toBe(
      MOBILE_QUICK_LOG_FAB_BOTTOM_REM +
        MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
        QUICK_LOG_FAB_CONTENT_GAP_REM,
    );
    expect(mobileQuickLogContentClearanceRem()).toBe(9.5);
  });

  it("calculates desktop FAB clearance from bottom offset (1.5rem), button height (2.75rem), and gap (1rem)", () => {
    expect(desktopQuickLogContentClearanceRem()).toBe(
      DESKTOP_QUICK_LOG_FAB_BOTTOM_REM +
        DESKTOP_QUICK_LOG_FAB_HEIGHT_REM +
        QUICK_LOG_FAB_CONTENT_GAP_REM,
    );
    expect(desktopQuickLogContentClearanceRem()).toBe(5.25);
  });

  it("builds safe-area-aware responsive bottom padding classes that exceed the mobile FAB top edge", () => {
    expect(QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS).toBe(
      "pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
    );
    expect(QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS).toBe("pb-24 md:pb-6");
  });

  it("renders the mobile Quick Log FAB at bottom-[calc(5rem+env(safe-area-inset-bottom))] with h-14 (8.5rem top edge)", () => {
    renderAppShellAt("/settings", <div data-testid="settings-content">Settings content</div>);
    const fab = screen.getByTestId("mobile-quick-log-fab");
    expect(fab).toHaveClass(
      "fixed",
      "bottom-[calc(5rem+env(safe-area-inset-bottom))]",
      "h-14",
      "w-14",
      "md:hidden",
    );
  });

  it("renders QuickLogV2Fab with desktop bottom-6 offset and hidden on mobile", () => {
    render(
      <MemoryRouter initialEntries={["/plants/40000000-0000-4000-8000-000000000001"]}>
        <QuickLogV2Fab defaultTargetKey="plant:40000000-0000-4000-8000-000000000001" />
      </MemoryRouter>,
    );
    const desktopFab = screen.getByRole("button", { name: "Quick Log" });
    expect(desktopFab).toHaveClass("hidden", "md:inline-flex", "md:bottom-6");
  });

  it("applies mobile and desktop FAB clearance to rendered AppShell #main-content and page body across Plant, Alerts, and Settings routes", () => {
    for (const [pathname, label] of [
      ["/plants/40000000-0000-4000-8000-000000000001", "Ask Doctor"],
      ["/alerts", "Action Queue items are approval-required."],
      ["/settings", "This setting is live and reflects your current configuration."],
    ] as const) {
      const { unmount } = renderAppShellAt(
        pathname,
        <div data-testid="route-last-readable-line">{label}</div>,
      );
      const main = document.querySelector<HTMLElement>("main#main-content");
      expect(main, `main#main-content on ${pathname}`).not.toBeNull();
      expect(main).toHaveClass(
        "pb-[calc(9.5rem+env(safe-area-inset-bottom))]",
        "md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
      );
      expect(main).not.toHaveClass("md:pb-9");
      const pageBody = screen.getByTestId("app-shell-page-content");
      expect(pageBody).toHaveClass("pb-24", "md:pb-6");
      expect(screen.getByTestId("route-last-readable-line")).toHaveTextContent(label);
      unmount();
    }
  });
});
