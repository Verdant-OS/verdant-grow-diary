import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import {
  GROW_RESTORE_FAILED_COPY,
  nextActiveGrowIdAfterArchive,
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
  holdWrite: false,
  pendingWrite: null as null | ((value: unknown) => void),
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
            const resolveWrite = () => {
              if (harness.holdWrite) {
                return new Promise((resolve) => {
                  harness.pendingWrite = resolve;
                });
              }
              return Promise.resolve(harness.updateResult);
            };
            const promise = resolveWrite();
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
  harness.grows = [activeSoleGrow];
  harness.archivedGrows = [];
  harness.activeGrowId = "g-1";
  harness.maxActiveGrows = 1;
  harness.detailGrow = activeSoleGrow;
  harness.updateResult = { data: [{ id: "g-1" }], error: null };
  harness.updates = [];
  harness.eqs = [];
  harness.selectCalled = false;
  harness.holdWrite = false;
  harness.pendingWrite = null;
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

describe("My Grows card archive control (#2178)", () => {
  it("renders Archive grow on the sole active grow card for a Free user and archives it on confirm", async () => {
    renderGrowsPage();

    const archiveButton = screen.getByRole("button", { name: /archive grow/i });
    expect(archiveButton).toBeInTheDocument();

    fireEvent.click(archiveButton);

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.eqs).toEqual([["id", "g-1"]]);
    expect(harness.setActiveGrowId).toHaveBeenCalledWith(null);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Archived");
  });

  it("switches activeGrowId to the remaining active grow when archiving the current active grow", async () => {
    harness.maxActiveGrows = null;
    harness.grows = [activeSoleGrow, secondActiveGrow];
    harness.activeGrowId = "g-1";
    renderGrowsPage();

    const archiveButtons = screen.getAllByRole("button", { name: /archive grow/i });
    expect(archiveButtons).toHaveLength(2);

    fireEvent.click(archiveButtons[0]);

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.eqs).toEqual([["id", "g-1"]]);
    expect(harness.setActiveGrowId).toHaveBeenCalledWith("g-2");
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not write or clear activeGrowId when the grower cancels archive confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderGrowsPage();

    fireEvent.click(screen.getByRole("button", { name: /archive grow/i }));

    expect(harness.updates).toEqual([]);
    expect(harness.setActiveGrowId).not.toHaveBeenCalled();
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it("links each archived grow card on My Grows to its grow detail page", () => {
    harness.archivedGrows = [archivedGrow];
    renderGrowsPage();

    const archivedSection = screen.getByTestId("archived-grows");
    const link = archivedSection.querySelector('a[href="/grows/g-old"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Winter Run");
  });
});

describe("Grow Detail archive and restore controls (#2178)", () => {
  it("renders Archive grow on an active grow detail page and archives it on confirm", async () => {
    renderGrowDetailPage("g-1");

    const archiveButton = screen.getByTestId("grow-detail-archive");
    expect(archiveButton).toHaveTextContent("Archive grow");

    fireEvent.click(archiveButton);

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: true }]));
    expect(harness.eqs).toEqual([["id", "g-1"]]);
    expect(harness.setActiveGrowId).toHaveBeenCalledWith(null);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.detailRefetch).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Archived");
  });

  it("renders Restore grow on an archived grow detail page and restores it when allowed", async () => {
    harness.grows = [];
    harness.archivedGrows = [archivedGrow];
    harness.activeGrowId = null;
    harness.detailGrow = archivedGrow;
    harness.updateResult = { data: [{ id: "g-old" }], error: null };

    renderGrowDetailPage("g-old");

    const restoreButton = screen.getByTestId("grow-detail-restore");
    expect(restoreButton).toHaveTextContent("Restore grow");

    fireEvent.click(restoreButton);

    await waitFor(() => expect(harness.updates).toEqual([{ is_archived: false }]));
    expect(harness.eqs).toEqual([["id", "g-old"]]);
    expect(harness.selectCalled).toBe(true);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(harness.detailRefetch).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Grow restored");
  });

  it("blocks Restore grow on the grow detail page with Free cap copy when another grow is active", async () => {
    harness.grows = [activeSoleGrow];
    harness.archivedGrows = [archivedGrow];
    harness.activeGrowId = "g-1";
    harness.maxActiveGrows = 1;
    harness.detailGrow = archivedGrow;

    renderGrowDetailPage("g-old");

    fireEvent.click(screen.getByTestId("grow-detail-restore"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      FREE_GROW_LIMIT_BLOCKED_COPY,
    );
    expect(harness.updates).toEqual([]);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(harness.detailRefetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(FREE_GROW_LIMIT_BLOCKED_COPY);
  });

  it("shows an error on the grow detail page when restore matches zero rows", async () => {
    harness.grows = [];
    harness.archivedGrows = [archivedGrow];
    harness.activeGrowId = null;
    harness.detailGrow = archivedGrow;
    harness.updateResult = { data: [], error: null };

    renderGrowDetailPage("g-old");

    fireEvent.click(screen.getByTestId("grow-detail-restore"));

    expect(await screen.findByTestId("grow-restore-error")).toHaveTextContent(
      GROW_RESTORE_FAILED_COPY,
    );
    expect(harness.detailRefetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(GROW_RESTORE_FAILED_COPY);
  });
});

describe("nextActiveGrowIdAfterArchive pure rule (#2178)", () => {
  it("preserves activeGrowId when archiving a non-active grow", () => {
    expect(
      nextActiveGrowIdAfterArchive({
        archivedGrowId: "g-2",
        activeGrowId: "g-1",
        activeGrows: [{ id: "g-1" }, { id: "g-2" }],
      }),
    ).toBe("g-1");
  });

  it("returns null when archiving the sole active grow", () => {
    expect(
      nextActiveGrowIdAfterArchive({
        archivedGrowId: "g-1",
        activeGrowId: "g-1",
        activeGrows: [{ id: "g-1" }],
      }),
    ).toBeNull();
  });

  it("selects the first remaining active grow when archiving the current active grow", () => {
    expect(
      nextActiveGrowIdAfterArchive({
        archivedGrowId: "g-1",
        activeGrowId: "g-1",
        activeGrows: [{ id: "g-1" }, { id: "g-2" }, { id: "g-3" }],
      }),
    ).toBe("g-2");
  });
});
