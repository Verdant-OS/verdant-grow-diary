import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import {
  GROW_ARCHIVE_FAILED_COPY,
  GROW_RESTORE_FAILED_COPY,
} from "@/lib/archivedGrowQuickLogRules";

const harness = vi.hoisted(() => ({
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
  updates: [] as Array<Record<string, unknown>>,
  eqs: [] as Array<[string, unknown]>,
  selectCalled: false,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u-free" } }),
}));

vi.mock("@/store/grows", () => ({
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
}));

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

const secondActiveGrow = {
  ...activeSoleGrow,
  id: "g-2",
  name: "Summer Run",
};

const archivedGrow = {
  ...activeSoleGrow,
  id: "g-old",
  name: "Winter Run",
  stage: "flower",
  is_archived: true,
};

beforeEach(() => {
  harness.grows = [activeSoleGrow];
  harness.archivedGrows = [];
  harness.activeGrowId = "g-1";
  harness.maxActiveGrows = 1;
  harness.detailGrow = activeSoleGrow;
  harness.updateResult = { data: [{ id: "g-1" }], error: null };
  harness.updates = [];
  harness.eqs = [];
  harness.selectCalled = false;
  harness.setActiveGrowId.mockClear();
  harness.refresh.mockReset().mockResolvedValue(undefined);
  harness.detailRefetch.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("grow archive and restore failure paths (#2178 regression)", () => {
  it("My Grows: archive write error toast and no activeGrowId mutation", async () => {
    harness.updateResult = {
      data: null,
      error: { message: "permission denied" },
    };
    render(
      <MemoryRouter initialEntries={["/grows"]}>
        <Grows />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /archive grow/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Unable to archive this grow. Please try again."),
    );
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("Grow Detail: archive write error toast and no refresh", async () => {
    harness.updateResult = {
      data: null,
      error: { message: "permission denied" },
    };
    render(
      <MemoryRouter initialEntries={["/grows/g-1"]}>
        <Routes>
          <Route path="/grows/:growId" element={<GrowDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("grow-detail-archive"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(GROW_ARCHIVE_FAILED_COPY));
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.detailRefetch).not.toHaveBeenCalled();
  });

  it("Grow Detail: server free-tier cap on restore surfaces blocked copy", async () => {
    harness.grows = [];
    harness.archivedGrows = [archivedGrow];
    harness.activeGrowId = null;
    harness.detailGrow = archivedGrow;
    harness.maxActiveGrows = null;
    harness.updateResult = {
      data: null,
      error: {
        message: "free_active_grow_limit_reached",
        details: "Free accounts may have one active grow.",
      },
    };

    render(
      <MemoryRouter initialEntries={["/grows/g-old"]}>
        <Routes>
          <Route path="/grows/:growId" element={<GrowDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("grow-detail-restore"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
    expect(harness.detailRefetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(FREE_GROW_LIMIT_BLOCKED_COPY);
  });

  it("Grow Detail: generic restore failure copy when write returns no rows", async () => {
    harness.grows = [];
    harness.archivedGrows = [archivedGrow];
    harness.detailGrow = archivedGrow;
    harness.updateResult = { data: [], error: null };

    render(
      <MemoryRouter initialEntries={["/grows/g-old"]}>
        <Routes>
          <Route path="/grows/:growId" element={<GrowDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("grow-detail-restore"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      GROW_RESTORE_FAILED_COPY,
    );
  });

  it("Grow Detail: archiving a non-active grow does not change activeGrowId", async () => {
    harness.maxActiveGrows = null;
    harness.grows = [activeSoleGrow, secondActiveGrow];
    harness.activeGrowId = "g-1";
    harness.detailGrow = secondActiveGrow;

    render(
      <MemoryRouter initialEntries={["/grows/g-2"]}>
        <Routes>
          <Route path="/grows/:growId" element={<GrowDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("grow-detail-archive"));

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.eqs).toEqual([["id", "g-2"]]);
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
  });
});
