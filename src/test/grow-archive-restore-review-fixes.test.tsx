import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { GROW_ARCHIVE_FAILED_COPY } from "@/lib/archivedGrowQuickLogRules";
import {
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

const harness = vi.hoisted(() => ({
  userId: "u-free" as string | null,
  grows: [] as Array<Record<string, unknown>>,
  archivedGrows: [] as Array<Record<string, unknown>>,
  activeGrowId: null as string | null,
  setActiveGrowId: vi.fn((id: string | null) => {
    harness.activeGrowId = id;
  }),
  refresh: vi.fn(),
  maxActiveGrows: 1 as number | null,
  detailGrow: null as Record<string, unknown> | null,
  detailRefetch: vi.fn(),
  updateResult: {
    data: [{ id: "g-1" }] as Array<Record<string, unknown>> | null,
    error: null as { message: string; details?: string } | null,
  },
  selectResult: {
    data: [] as Array<Record<string, unknown>> | null,
    error: null as { message: string } | null,
  },
  updates: [] as Array<Record<string, unknown>>,
  eqs: [] as Array<[string, unknown]>,
  selectCalled: false,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: harness.userId ? { id: harness.userId } : null }),
}));

vi.mock("@/store/grows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/grows")>();
  return {
    ...actual,
    useGrows: () => ({
      grows: harness.grows,
      archivedGrows: harness.archivedGrows,
      activeGrowId: harness.activeGrowId,
      setActiveGrowId: harness.setActiveGrowId,
      activeGrow: harness.grows.find((g) => g.id === harness.activeGrowId) ?? null,
      refresh: harness.refresh,
      loading: false,
      error: null,
    }),
  };
});

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: {
      effectivePlanId: harness.maxActiveGrows === 1 ? "free" : "pro_monthly",
      displayPlanId: harness.maxActiveGrows === 1 ? "free" : "pro_monthly",
      status: "active",
      isActive: true,
      capabilities: {
        ...FREE_CAPABILITIES,
        maxActiveGrows: harness.maxActiveGrows,
      },
      degraded: false,
      degradedReason: null,
    },
  }),
}));

vi.mock("@/hooks/useGrowDetailData", () => ({
  useGrowDetailData: () => ({
    grow: harness.detailGrow,
    growId: (harness.detailGrow?.id as string | undefined) ?? "g-1",
    loading: false,
    notFound: harness.detailGrow === null,
    error: false,
    counts: {
      plants: 1,
      tents: 1,
      diary: 2,
      actionsPending: 0,
      actionsTotal: 0,
      auditEvents: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      alertsWarning: 0,
    },
    recent: { status: "ok", items: [] },
    status: {
      level: "good",
      reason: "Stable",
      pending: 0,
      highestRisk: "low",
      lastDiaryAt: null,
    },
    outcomes: {
      status: "ready",
      summary: { improved: 0, unchanged: 0, worsened: 0, more_data_needed: 0 },
      recent: [],
      learning: { totals: { count: 0 } },
    },
    refetch: harness.detailRefetch,
    soleTentId: null,
  }),
  EMPTY_GROW_OUTCOMES_STATE: {},
}));

vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/ActionOutcomeLearningReport", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/StartBreedingLogButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/GrowFollowUpReviewSection", () => ({
  GrowFollowUpReviewSection: () => null,
}));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/GrowPendingOutcomeNotice", () => ({ default: () => null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "grows") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          order: () => Promise.resolve(harness.selectResult),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (column: string, value: unknown) => {
            harness.updates.push(payload);
            harness.eqs.push([column, value]);
            const promise = Promise.resolve(harness.updateResult);
            return Object.assign(promise, {
              select: () => {
                harness.selectCalled = true;
                return promise;
              },
            });
          },
        }),
      };
    },
  },
}));

import { toast } from "sonner";
import Grows from "@/pages/Grows";
import GrowDetail from "@/pages/GrowDetail";
import { GrowsProvider } from "@/store/grows";

const activeSoleGrow = {
  id: "g-1",
  name: "Spring Run",
  stage: "veg",
  grow_type: "tent",
  is_archived: false,
  started_at: "2026-03-01T00:00:00.000Z",
  created_at: "2026-03-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
  notes: null,
};

const archivedGrow = {
  ...activeSoleGrow,
  id: "g-old",
  name: "Winter Run",
  stage: "flower",
  is_archived: true,
};

function renderGrowsPage() {
  return render(
    <MemoryRouter initialEntries={["/grows"]}>
      <Grows />
    </MemoryRouter>,
  );
}

function renderGrowDetailPage(growId = "g-1") {
  return render(
    <MemoryRouter initialEntries={[`/grows/${growId}`]}>
      <Routes>
        <Route path="/grows/:growId" element={<GrowDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  harness.userId = "u-free";
  harness.grows = [activeSoleGrow];
  harness.archivedGrows = [];
  harness.activeGrowId = "g-1";
  harness.maxActiveGrows = 1;
  harness.detailGrow = activeSoleGrow;
  harness.updateResult = { data: [{ id: "g-1" }], error: null };
  harness.selectResult = { data: [], error: null };
  harness.updates = [];
  harness.eqs = [];
  harness.selectCalled = false;
  harness.setActiveGrowId.mockClear();
  harness.refresh.mockReset().mockResolvedValue(undefined);
  harness.detailRefetch.mockReset();
  removeLocalStorageItemForTest("verdant.activeGrow.u-free");
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  removeLocalStorageItemForTest("verdant.activeGrow.u-free");
  vi.restoreAllMocks();
});

describe("PR #2184 review findings: archive row verification, error preservation, and archived-only state", () => {
  it("P2-1: preserves stored activeGrowId when GrowsProvider refresh fails with an error", async () => {
    setLocalStorageItemForTest("verdant.activeGrow.u-free", "g-2");
    harness.selectResult = { data: null, error: { message: "network failure" } };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <GrowsProvider>
          <div data-testid="provider-child" />
        </GrowsProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("provider-child")).toBeInTheDocument();
    expect(getLocalStorageItemForTest("verdant.activeGrow.u-free")).toBe("g-2");
  });

  it("P2-1b: clears stored activeGrowId after a successful read with zero active grows", async () => {
    setLocalStorageItemForTest("verdant.activeGrow.u-free", "g-old");
    harness.selectResult = { data: [archivedGrow], error: null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <GrowsProvider>
          <div data-testid="provider-child" />
        </GrowsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getLocalStorageItemForTest("verdant.activeGrow.u-free")).toBeNull());
  });

  it("P2-2: GrowDetail archive calls .select() and fails without clearing activeGrowId when zero rows match", async () => {
    harness.updateResult = { data: [], error: null };
    renderGrowDetailPage("g-1");

    fireEvent.click(screen.getByTestId("grow-detail-archive"));

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.selectCalled).toBe(true);
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.detailRefetch).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(GROW_ARCHIVE_FAILED_COPY);
  });

  it("CodeRabbit-2: My Grows archive calls .select() and fails without clearing activeGrowId when zero rows match", async () => {
    harness.updateResult = { data: [], error: null };
    renderGrowsPage();

    fireEvent.click(screen.getByRole("button", { name: /archive grow/i }));

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.selectCalled).toBe(true);
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(GROW_ARCHIVE_FAILED_COPY);
  });

  it("P2-3: renders a distinct No active grows state instead of No grows yet when archived grows exist", () => {
    harness.grows = [];
    harness.archivedGrows = [archivedGrow];
    harness.activeGrowId = null;
    renderGrowsPage();

    expect(screen.getByTestId("grows-no-active")).toBeInTheDocument();
    expect(screen.getByText("No active grows.")).toBeInTheDocument();
    expect(
      screen.getByText("Start a new grow or restore an archived grow below."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("grows-empty")).not.toBeInTheDocument();
    expect(screen.queryByText("No grows yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Create your first grow to start logging.")).not.toBeInTheDocument();
  });
});
