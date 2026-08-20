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
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import QuickLogV2Fab from "@/components/QuickLogV2Fab";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function noteTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText("Note (optional)") as HTMLTextAreaElement;
}

function openFab() {
  fireEvent.click(screen.getByRole("button", { name: "Quick Log" }));
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
        <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
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
        <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
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
        <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
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
        <QuickLogV2Fab defaultTargetKey="plant:plant-1" />
      </QueryClientProvider>,
    );

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
