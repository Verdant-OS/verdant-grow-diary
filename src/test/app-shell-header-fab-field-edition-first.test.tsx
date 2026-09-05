/**
 * QUICKLOG_HEADER_FAB_FIELD_EDITION_FIRST — header/+ and FAB open grower
 * QuickLog with Field Edition visit modes before any legacy activity chooser.
 *
 * Live FAIL (measured signed-in on 8990f84): plant Quick Log first paint PASS
 * after #1286, but header "+ Quick Log" still opened the legacy
 * "Choose what you want to log." 8-type GlobalFastAdd menu.
 */
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: vi.fn(),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => {
              const chain: Record<string, unknown> = {
                abortSignal: () => chain,
                then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(r, j),
              };
              return chain;
            },
          }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "grower@example.com", email_confirmed_at: "2026-07-01" },
    loading: false,
  }),
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/useRequireAuth", () => ({
  useRequireAuth: () => ({ status: "authenticated" }),
  AUTH_REVALIDATE_EVENT: "verdant:auth-revalidate",
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro_monthly" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/hooks/useCheckoutReturnCompletionTracking", () => ({
  useCheckoutReturnCompletionTracking: () => undefined,
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
vi.mock("@/components/BrandLogo", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow #1", stage: "veg" }],
    activeGrow: { id: "g1", name: "Grow #1", stage: "veg" },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "p1", name: "PlantA", tent_id: "t1", grow_id: "g1", stage: "flowering" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", captured_at: null, source: null, metrics: {} },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import AppShell from "@/components/AppShell";

const PLANT_PATH = "/plants/p1";

function isBeforeInDocument(earlier: HTMLElement, later: HTMLElement): boolean {
  return (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function renderShell(pathname = PLANT_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[pathname]}>
        <Routes>
          <Route
            path="/plants/:plantId"
            element={
              <AppShell>
                <div data-testid="plant-page">PlantA</div>
              </AppShell>
            }
          />
          <Route
            path="*"
            element={
              <AppShell>
                <div data-testid="shell-page">page</div>
              </AppShell>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => cleanup());

describe("AppShell header/FAB Field Edition first paint", () => {
  it("header Quick Log opens Field Edition visit modes before All activity types", () => {
    renderShell(PLANT_PATH);

    expect(screen.queryByTestId("global-fast-add-menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose what you want to log.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("header-quick-log-trigger"));

    expect(screen.queryByTestId("global-fast-add-menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose what you want to log.")).not.toBeInTheDocument();

    const fieldEdition = screen.getByTestId("ql-guided-grow-walk");
    const fastCheck = screen.getByTestId("ql-visit-mode-fast_check");
    const allActivities = screen.getByTestId("quick-log-dialog-all-activities");

    expect(fastCheck).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("All activity types")).toBeInTheDocument();
    expect(isBeforeInDocument(fieldEdition, allActivities)).toBe(true);
    expect(isBeforeInDocument(fastCheck, allActivities)).toBe(true);
    for (const modeId of [
      "ql-visit-mode-routine_walk",
      "ql-visit-mode-deep_evidence_walk",
      "ql-visit-mode-alert_walk",
    ] as const) {
      expect(isBeforeInDocument(screen.getByTestId(modeId), allActivities)).toBe(true);
    }
  });

  it("mobile FAB opens the same Field Edition first paint", () => {
    renderShell(PLANT_PATH);

    fireEvent.click(screen.getByTestId("mobile-quick-log-fab"));

    expect(screen.queryByTestId("global-fast-add-menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose what you want to log.")).not.toBeInTheDocument();

    const fieldEdition = screen.getByTestId("ql-guided-grow-walk");
    const fastCheck = screen.getByTestId("ql-visit-mode-fast_check");
    const allActivities = screen.getByTestId("quick-log-dialog-all-activities");

    expect(fastCheck).toHaveAttribute("aria-pressed", "true");
    expect(isBeforeInDocument(fieldEdition, allActivities)).toBe(true);
    expect(isBeforeInDocument(fastCheck, allActivities)).toBe(true);
  });
});
