/**
 * QuickLogV2Fab — the default target is frozen at open time.
 *
 * Pages derive `defaultTargetKey` from queries that settle independently. On
 * Tent Detail the sole-plant target only becomes provable once
 * `useGrowPlants` returns, so the prop genuinely changes while the sheet may
 * already be open. `QuickLogV2Sheet` re-initialises its whole draft whenever
 * `defaultTargetKey` changes, so without a freeze that late arrival wipes a
 * typed note.
 *
 * The first test is the CONTROL: it exercises the sheet directly and shows the
 * reset really happens. The freeze is only worth having because of it — if the
 * control ever stops failing to preserve the note, the sheet's reset semantics
 * changed and this fence should be re-derived rather than trusted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import QuickLogV2Fab from "@/components/QuickLogV2Fab";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { MemoryRouter, useLocation, useNavigate } from "@/lib/react-router-compat";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
      { id: "plant-2", name: "Plant 2", tent_id: "tent-2", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: "tent-1", name: "Tent 1", grow_id: "grow-1" },
      { id: "tent-2", name: "Tent 2", grow_id: "grow-1" },
    ],
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function noteTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
}

function openFab() {
  fireEvent.click(screen.getByRole("button", { name: "Quick Log" }));
}

const ROUTE_A = "30000000-0000-4000-8000-000000000001";
const ROUTE_B = "30000000-0000-4000-8000-000000000002";

function DetailRouteFabHarness({ kind }: { kind: "plant" | "tent" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isSecondDetail = location.pathname.endsWith(ROUTE_B);
  const targetId = `${kind}-${isSecondDetail ? "2" : "1"}`;

  return (
    <>
      <button
        type="button"
        data-testid={`open-next-${kind}`}
        onClick={() => navigate(`/${kind}s/${ROUTE_B}`)}
      >
        Open next {kind}
      </button>
      <QuickLogV2Fab defaultTargetKey={`${kind}:${targetId}`} />
    </>
  );
}

function renderRouteHarness(kind: "plant" | "tent") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/${kind}s/${ROUTE_A}`]}>
        <DetailRouteFabHarness kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function QueryRefinementFabHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRefined = location.search === "?sole=plant-1";

  return (
    <>
      <button
        type="button"
        data-testid="refine-current-tent"
        onClick={() => navigate(`${location.pathname}?sole=plant-1`)}
      >
        Refine current tent
      </button>
      <QuickLogV2Fab defaultTargetKey={isRefined ? "plant:plant-1" : "tent:tent-1"} />
    </>
  );
}

function renderQueryRefinementHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>
        <QueryRefinementFabHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => rpcMock.mockClear());
afterEach(() => cleanup());

describe("QuickLogV2Sheet — control: a defaultTargetKey change resets the draft", () => {
  it("discards a typed note when the prop changes while open", () => {
    const { rerender } = renderWithClient(
      <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="tent:tent-1" />,
    );

    fireEvent.change(noteTextarea(), { target: { value: "Leaf tips curling" } });
    expect(noteTextarea().value).toBe("Leaf tips curling");

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>
          <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // This is the hazard the FAB freeze exists to prevent.
    expect(noteTextarea().value).toBe("");
  });
});

describe("QuickLogV2Fab — freezes the launch target", () => {
  it("keeps a typed note when the page's target resolves after the sheet opened", () => {
    const { rerender } = renderWithClient(<QuickLogV2Fab defaultTargetKey="tent:tent-1" />);

    openFab();
    fireEvent.change(noteTextarea(), { target: { value: "Leaf tips curling" } });

    // useGrowPlants settles: the page can now prove the sole-plant target.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>
          <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(noteTextarea().value).toBe("Leaf tips curling");
    // And the scope the grower opened with is the scope they still have.
    expect(screen.getByTestId("qlv2-target-panel")).toHaveAttribute("data-scope", "tent");
  });

  it("uses the newly provable target on the next open", () => {
    const { rerender } = renderWithClient(<QuickLogV2Fab defaultTargetKey="tent:tent-1" />);

    openFab();
    fireEvent.change(noteTextarea(), { target: { value: "first draft" } });
    // Close via the sheet's own dismissal path.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>
          <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    openFab();

    // A fresh session: the note is gone (expected) and the frozen key has
    // advanced to the plant target the page can now prove.
    expect(noteTextarea().value).toBe("");
    expect(screen.getByTestId("qlv2-target-panel")).toHaveAttribute("data-scope", "plant");
  });

  it("never saves while the target is merely re-derived", () => {
    const { rerender } = renderWithClient(<QuickLogV2Fab defaultTargetKey="tent:tent-1" />);
    openFab();
    fireEvent.change(noteTextarea(), { target: { value: "Leaf tips curling" } });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/tents/${ROUTE_A}`]}>
          <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("preserves the open draft across a query-only target refinement", () => {
    renderQueryRefinementHarness();
    openFab();
    fireEvent.change(noteTextarea(), { target: { value: "keep this tent draft" } });

    fireEvent.click(screen.getByTestId("refine-current-tent"));

    expect(noteTextarea().value).toBe("keep this tent draft");
    expect(screen.getByTestId("qlv2-target-panel")).toHaveAttribute("data-scope", "tent");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["plant", "Plant 2"],
    ["tent", "Tent 2"],
  ] as const)(
    "closes and invalidates a frozen %s target when the detail route id changes",
    async (kind, nextTargetName) => {
      renderRouteHarness(kind);
      openFab();
      fireEvent.change(noteTextarea(), { target: { value: "belongs to the first detail" } });

      fireEvent.click(screen.getByTestId(`open-next-${kind}`));

      await waitFor(() =>
        expect(screen.queryByLabelText("Note (optional)")).not.toBeInTheDocument(),
      );
      expect(rpcMock).not.toHaveBeenCalled();

      openFab();
      expect(noteTextarea().value).toBe("");
      expect(screen.getByLabelText("Choose plant or tent for this Quick Log")).toHaveTextContent(
        nextTargetName,
      );
    },
  );
});
