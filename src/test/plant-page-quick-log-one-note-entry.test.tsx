/**
 * Plant-page Quick Log entries open Quick Log V2: one note field, one Save.
 * The legacy dialog stays closed for ?open=quick-log and the prefill event.
 */
import { type ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

const PLANT_ID = "40000000-0000-4000-8000-000000000001";

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
    entitlement: { isActive: false, effectivePlanId: "free" },
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
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="legacy-quick-log">legacy</div> : null,
}));
vi.mock("@/components/QuickLogV2Sheet", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="quick-log-v2-sheet">
        <label>
          Note (optional)
          <textarea aria-label="Note (optional)" defaultValue="" />
        </label>
        <button type="button">Save</button>
      </div>
    ) : null,
}));

import AppShell from "@/components/AppShell";

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell>
              <span>page</span>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function expectOneNoteAndOneSave() {
  expect(screen.getAllByLabelText("Note (optional)")).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
  expect(screen.queryByText("Short note")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save log" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("legacy-quick-log")).not.toBeInTheDocument();
}

beforeEach(() => {
  clearLocalStorageForTest();
});

describe("plant-page Quick Log entries", () => {
  it("?open=quick-log renders one note field and one Save", async () => {
    renderAt(`/plants/${PLANT_ID}?open=quick-log`);
    await screen.findByTestId("quick-log-v2-sheet");
    expectOneNoteAndOneSave();
  });

  it("the prefill event renders one note field and one Save", async () => {
    renderAt(`/plants/${PLANT_ID}`);
    expect(screen.queryByTestId("quick-log-v2-sheet")).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: { plantId: PLANT_ID } }),
      );
    });
    await screen.findByTestId("quick-log-v2-sheet");
    expectOneNoteAndOneSave();
  });
});
