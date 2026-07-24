/**
 * AppShell global-search entry points (base behavior, preserved by #418).
 *
 * Covers the mobile + desktop search triggers and the Cmd/Ctrl+K shortcut that
 * must NOT steal keystrokes while the grower is typing in an input, textarea,
 * select, or contenteditable surface.
 */
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    entitlement: { isActive: true, effectivePlanId: "pro_monthly" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/GlobalFastAddButton", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));
// Reflect the open state so the shortcut/guard is observable.
vi.mock("@/components/GlobalSearchDialog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="global-search-dialog-open" /> : null,
}));

import AppShell from "@/components/AppShell";

function renderShell(children?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="*" element={<AppShell>{children}</AppShell>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppShell global-search triggers", () => {
  it("renders both the desktop and mobile search triggers", () => {
    renderShell();
    expect(screen.getByTestId("global-search-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-global-search-trigger")).toBeInTheDocument();
  });

  it("opens search on Cmd/Ctrl+K from a non-typing target", () => {
    renderShell();
    expect(screen.queryByTestId("global-search-dialog-open")).toBeNull();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(screen.getByTestId("global-search-dialog-open")).toBeInTheDocument();
  });

  it("does not steal Cmd/Ctrl+K while typing in an input", () => {
    renderShell(<input data-testid="typing-field" />);
    const input = screen.getByTestId("typing-field");
    input.focus();
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    expect(screen.queryByTestId("global-search-dialog-open")).toBeNull();
  });
});
