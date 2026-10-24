import { type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "@/components/ui/sonner";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";

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
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

import AppShell from "@/components/AppShell";
import {
  QUICK_LOG_FAB_SIDE_CLEARANCE_CLASS,
  TOAST_ABOVE_MOBILE_NAV_OFFSET,
  TOAST_VIEWPORT_OFFSET_CLASS,
  mobileQuickLogSideClearanceRem,
} from "@/lib/quickLogFabClearanceRules";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

describe("narrow viewport toast offset and FAB side clearance", () => {
  it("reserves 4.75rem of trailing padding so the mobile FAB cannot cover a trailing control", () => {
    expect(mobileQuickLogSideClearanceRem()).toBe(4.75);
    expect(QUICK_LOG_FAB_SIDE_CLEARANCE_CLASS).toBe("pr-[4.75rem] md:pr-0");
  });

  it("applies the side clearance class on the scrollable page body", () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Routes>
          <Route
            path="*"
            element={
              <AppShell>
                <select aria-label="Filter by plant">
                  <option>All plants</option>
                </select>
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("app-shell-page-content")).toHaveClass(
      ...QUICK_LOG_FAB_SIDE_CLEARANCE_CLASS.split(" "),
    );
  });

  it("offsets Sonner above the bottom nav and the safe-area inset", async () => {
    render(<Toaster />);
    toast("Saved");
    const toaster = await waitFor(() => {
      const node = document.querySelector("[data-sonner-toaster]");
      expect(node).not.toBeNull();
      return node;
    });
    expect(toaster).toHaveStyle({
      "--offset-bottom": TOAST_ABOVE_MOBILE_NAV_OFFSET,
      "--mobile-offset-bottom": TOAST_ABOVE_MOBILE_NAV_OFFSET,
    });
  });

  it("offsets the Radix toast viewport above the bottom nav until md", () => {
    render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    );
    const viewport = document.querySelector("ol");
    expect(viewport).not.toBeNull();
    for (const token of TOAST_VIEWPORT_OFFSET_CLASS.split(" ")) {
      expect(viewport?.className).toContain(token);
    }
  });
});
