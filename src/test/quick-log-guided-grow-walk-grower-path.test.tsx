/**
 * QUICKLOG_GUIDED_WALK_ON_GROWER_PATH — Field Edition visit modes on legacy QuickLog.
 *
 * Live FAIL: Guided Walk shipped only inside QuickLogV2Sheet (#1283). Growers open
 * legacy QuickLog via PlantDetailQuickActions / mobile FAB, so visit modes never
 * appeared on the grower path. This file pins the shared panel on QuickLog.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
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
    data: [
      {
        id: "p1",
        name: "Plant 1",
        tent_id: "t1",
        grow_id: "g1",
        stage: "flowering",
      },
    ],
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

import QuickLog from "@/components/QuickLog";

function renderQuickLog(prefill?: Parameters<typeof QuickLog>[0]["prefill"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={vi.fn()} prefill={prefill} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => cleanup());

describe("Grower Quick Log Field Edition visit modes", () => {
  it("shows visit modes with Fast Check pressed by default", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    expect(screen.getByTestId("ql-guided-grow-walk")).toBeInTheDocument();
    expect(screen.getByTestId("ql-visit-mode-fast_check")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("ql-visit-mode-routine_walk")).toBeInTheDocument();
    expect(screen.getByTestId("ql-visit-mode-deep_evidence_walk")).toBeInTheDocument();
    expect(screen.getByTestId("ql-visit-mode-alert_walk")).toBeInTheDocument();
    expect(screen.queryByTestId("ql-grow-walk-backbone")).not.toBeInTheDocument();
  });

  it("fails the guided identity closed until a verified plant/tent exists", () => {
    renderQuickLog();
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));
    expect(screen.getByTestId("ql-grow-walk-identity-blocked")).toBeInTheDocument();
    expect(screen.queryByTestId("ql-grow-walk-backbone")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ql-grow-walk-nonpersist-disclosure")).not.toBeInTheDocument();
  });

  it("reveals non-persist disclosure when guided and target is verified", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));
    expect(screen.getByTestId("ql-grow-walk-backbone")).toBeInTheDocument();
    expect(screen.getByTestId("ql-grow-walk-nonpersist-disclosure")).toHaveTextContent(
      "Guided control selections (light phase, visit reason, doorway scan, risk, follow-up) apply to this visit only and are not saved. Put anything durable in the accurate note below.",
    );
    expect(screen.queryByTestId("ql-grow-walk-identity-blocked")).not.toBeInTheDocument();
  });
});
