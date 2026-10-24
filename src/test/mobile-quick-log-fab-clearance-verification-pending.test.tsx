import { type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "grower@example.com" },
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
vi.mock("@/components/VerificationPendingBanner", () => ({
  default: () => <div data-testid="verification-pending-banner">Verify email</div>,
}));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

import AppShell from "@/components/AppShell";

describe("Issue #2205 — FAB clearance when verification banner is shown", () => {
  it("still applies main-content bottom clearance without the page body wrapper", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="*" element={<AppShell>Hidden page body</AppShell>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("verification-pending-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell-page-content")).toBeNull();
    const main = document.querySelector<HTMLElement>("main#main-content");
    expect(main).not.toBeNull();
    expect(main).toHaveClass(
      "pb-[calc(9.5rem+env(safe-area-inset-bottom))]",
      "md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
    );
  });
});
