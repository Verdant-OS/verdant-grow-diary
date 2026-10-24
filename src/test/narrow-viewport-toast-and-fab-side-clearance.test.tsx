import { type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "@/components/ui/sonner";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import {
  QUICK_LOG_FAB_CONTENT_GAP_REM,
  QUICK_LOG_FAB_TIMELINE_FILTER_CLEARANCE_CLASS,
  SHELL_MAIN_PADDING_X_REM,
  SHELL_MAIN_PADDING_X_SM_REM,
  mobileFabLeftPx,
  mobileQuickLogContentClearanceRem,
  mobileQuickLogSideClearanceRem,
  mobileShellToastBottomOffset,
  mobileShellToastOffsetCss,
  timelineFilterRightPx,
} from "@/lib/quickLogFabClearanceRules";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

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

const harness = vi.hoisted(() => ({
  executeQuery: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  function queryFor(table: string) {
    const spec = { table };
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      is() {
        return query;
      },
      not() {
        return query;
      },
      gte() {
        return query;
      },
      lte() {
        return query;
      },
      lt() {
        return query;
      },
      in() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then(onfulfilled?: (value: unknown) => unknown) {
        return Promise.resolve(harness.executeQuery(spec)).then(onfulfilled);
      },
    };
    return query;
  }
  return {
    supabase: {
      from: (table: string) => queryFor(table),
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    },
  };
});

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    activeGrow: {
      id: "grow-a",
      name: "Current Run A",
      stage: "vegetative",
      started_at: "2026-07-01T00:00:00.000Z",
    },
    activeGrowId: "grow-a",
    grows: [
      {
        id: "grow-a",
        name: "Current Run A",
        stage: "vegetative",
        started_at: "2026-07-01T00:00:00.000Z",
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
  }),
}));
vi.mock("@/lib/featureEntitlements", () => ({
  canUseFeature: () => false,
}));
vi.mock("@/hooks/useActionResponseMemory", () => ({
  useActionResponseMemory: () => ({ state: { status: "ok", memories: [] }, reload: vi.fn() }),
}));
vi.mock("@/lib/useTimelineHighlightAutoScroll", () => ({
  useTimelineHighlightAutoScroll: () => undefined,
}));
vi.mock("@/hooks/useTimelineHashAnchorHandoff", () => ({
  useTimelineHashAnchorHandoff: () => undefined,
}));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/EntryEditDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogEntryIntegrityControls", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryBadges", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentCheckSnapshotLinkButton", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorCheckInTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/AiDoctorReadinessTimelineBadge", () => ({ default: () => null }));
vi.mock("@/components/WateringHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/FeedingHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/PhotoHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/QuickLogHistoryPanels", () => ({
  RecentQuickLogActivityPanel: () => null,
  PestDiseaseHistoryPanel: () => null,
  TrainingHistoryPanel: () => null,
  MeasurementHistoryPanel: () => null,
}));
vi.mock("@/components/DiaryCalendarSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineCsvContextPanel", () => ({ default: () => null }));
vi.mock("@/components/PhenoHuntTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelinePhotoLightbox", () => ({ default: () => null }));
vi.mock("@/components/TimelineEvidenceDetailDrawer", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceLegendTooltip", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/CopyTraceLinkButton", () => ({ default: () => null }));
vi.mock("@/components/ActionResponseMemoryCard", () => ({ default: () => null }));

import AppShell from "@/components/AppShell";
import Timeline from "@/pages/Timeline";

describe("narrow viewport toast offset and Timeline filter clearance", () => {
  beforeEach(() => {
    harness.executeQuery.mockReset();
    harness.executeQuery.mockImplementation((spec: { table: string }) => {
      if (spec.table === "diary_entries") {
        return {
          data: [
            {
              id: "entry-1",
              note: "Leaf check",
              photo_url: null,
              stage: "vegetative",
              details: { event_type: "note", source: "manual" },
              entry_at: "2026-07-20T12:00:00.000Z",
              plant_id: "plant-1",
              tent_id: null,
            },
          ],
          error: null,
          count: 1,
        };
      }
      return { data: [], error: null };
    });
  });

  it("builds the Timeline filter class from px-3 and sm:px-5 clearance", () => {
    expect(mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_REM)).toBe(4.75);
    expect(mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_SM_REM)).toBe(4.25);
    expect(QUICK_LOG_FAB_TIMELINE_FILTER_CLEARANCE_CLASS).toBe(
      `pr-[${mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_REM)}rem] sm:pr-[${mobileQuickLogSideClearanceRem(SHELL_MAIN_PADDING_X_SM_REM)}rem] md:pr-0`,
    );
  });

  it("at 375px the All plants row ends a gap left of the FAB", () => {
    const viewport = 375;
    const filterRight = timelineFilterRightPx(viewport, SHELL_MAIN_PADDING_X_REM);
    const fabLeft = mobileFabLeftPx(viewport);
    expect(filterRight).toBeLessThanOrEqual(fabLeft - QUICK_LOG_FAB_CONTENT_GAP_REM * 16);
    expect(fabLeft - filterRight).toBe(QUICK_LOG_FAB_CONTENT_GAP_REM * 16);
  });

  it("applies that class on the Timeline filter row and not on every shell page", async () => {
    render(
      <MemoryRouter initialEntries={["/timeline"]}>
        <Timeline />
      </MemoryRouter>,
    );
    const row = await screen.findByTestId("timeline-plant-filter-row");
    expect(row).toHaveClass(...QUICK_LOG_FAB_TIMELINE_FILTER_CLEARANCE_CLASS.split(" "));
    expect(within(row).getByLabelText("Filter by plant")).toHaveTextContent("All plants");

    const { unmount } = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="*" element={<AppShell>Settings</AppShell>} />
        </Routes>
      </MemoryRouter>,
    );
    const pageBody = screen.getByTestId("app-shell-page-content");
    expect(pageBody.className).not.toContain("pr-[");
    unmount();
  });

  it("offsets toasts above the FAB only from the signed-in shell, below md", async () => {
    expect(mobileShellToastBottomOffset()).toBe(
      `calc(${mobileQuickLogContentClearanceRem()}rem + env(safe-area-inset-bottom))`,
    );
    expect(mobileQuickLogContentClearanceRem()).toBe(9.5);

    render(<Toaster />);
    toast("Saved");
    const publicToaster = await waitFor(() => {
      const node = document.querySelector("[data-sonner-toaster]");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(publicToaster.style.getPropertyValue("--offset-bottom")).not.toContain("9.5rem");
    expect(document.querySelector("[data-testid=mobile-shell-toast-offset]")).toBeNull();

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="*" element={<AppShell>Settings</AppShell>} />
        </Routes>
      </MemoryRouter>,
    );
    const style = screen.getByTestId("mobile-shell-toast-offset");
    expect(style.textContent).toBe(mobileShellToastOffsetCss());
    expect(style.textContent).toContain("@media (max-width: 767px)");
    expect(style.textContent).toContain(mobileShellToastBottomOffset());
    expect(style.textContent).not.toContain("@media (min-width: 768px)");
  });

  it("leaves the Radix viewport at the library position until the shell stylesheet overrides it", () => {
    render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    );
    const viewport = document.querySelector("[data-verdant-toast-viewport]");
    expect(viewport?.className).toContain("sm:bottom-0");
    expect(viewport?.className).not.toContain("9.5rem");
    expect(mobileShellToastOffsetCss()).toContain("[data-verdant-toast-viewport]");
    expect(mobileShellToastOffsetCss()).toContain("min-width: 640px");
  });
});
