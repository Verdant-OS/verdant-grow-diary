/**
 * Skip link: activating "Skip to main content" must move keyboard focus into
 * #main-content, so the next Tab reaches the first control in main instead of
 * starting over at the skip link and the sidebar.
 */
import { type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/plants"]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell>
              <button type="button">First control in main</button>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Skip to main content", () => {
  it("moves focus to the main region when activated", () => {
    renderShell();
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const main = document.getElementById("main-content");
    expect(main?.tagName).toBe("MAIN");

    skip.focus();
    fireEvent.click(skip);

    expect(document.activeElement).toBe(main);
    expect(main?.contains(screen.getByRole("button", { name: "First control in main" }))).toBe(
      true,
    );
  });
});
