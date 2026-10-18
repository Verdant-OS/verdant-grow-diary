/**
 * Regression test for GitHub issue #2204:
 * Mobile (375px): Quick Log 'Deep Evidence Walk' button text overflows its border.
 *
 * Root cause: `GuidedGrowWalkPanel` renders the four Field Edition visit-mode
 * buttons in a `grid-cols-2` container using `<Button size="sm">` without
 * overriding shadcn `Button`'s base `whitespace-nowrap` and fixed `h-9` height.
 * At a 375px mobile viewport each grid column is ~120–146px wide, while the
 * unwrapped "Deep Evidence Walk" label is wider than the column, causing the
 * text to overflow the button's border box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import GuidedGrowWalkPanel from "@/components/GuidedGrowWalkPanel";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import QuickLog from "@/components/QuickLog";
import { GROW_WALK_VISIT_MODES } from "@/lib/growWalkContracts";

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
    grows: [{ id: "grow-1", name: "Grow 1", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Grow 1", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1", stage: "flowering" },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }] }),
}));
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "empty",
    snapshot: { status: "empty", captured_at: null, source: null, metrics: {} },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: 375,
  });
});

afterEach(() => cleanup());

describe("Issue #2204 — Quick Log 'Deep Evidence Walk' button wraps within its border at 375px", () => {
  it("overrides Button's whitespace-nowrap and fixed h-9 on the 'Deep Evidence Walk' button in QuickLogV2Sheet", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLogV2Sheet open onOpenChange={vi.fn()} defaultTargetKey="plant:plant-1" />
      </QueryClientProvider>,
    );

    const deepEvidenceButton = screen.getByTestId("qlv2-visit-mode-deep_evidence_walk");
    expect(deepEvidenceButton).toHaveTextContent("Deep Evidence Walk");
    expect(deepEvidenceButton).toHaveClass(
      "whitespace-normal",
      "h-auto",
      "min-h-9",
      "min-w-0",
      "break-words",
    );
    expect(deepEvidenceButton).not.toHaveClass("whitespace-nowrap");
    expect(deepEvidenceButton).not.toHaveClass("h-9");
  });

  it("keeps all four Visit mode buttons wrap-safe inside the 2-column grid in GuidedGrowWalkPanel and preserves mode switching", () => {
    const onVisitModeChange = vi.fn();
    render(
      <GuidedGrowWalkPanel
        visitMode="fast_check"
        onVisitModeChange={onVisitModeChange}
        targetOk
        tentId="tent-1"
        targetType="plant"
        stage="flowering"
      />,
    );

    const group = screen.getByRole("group", { name: "Visit mode" });
    expect(group).toHaveClass("grid", "grid-cols-2");

    for (const mode of GROW_WALK_VISIT_MODES) {
      const btn = within(group).getByRole("button", { name: mode.label });
      expect(btn).toHaveClass("whitespace-normal", "h-auto", "min-h-9", "min-w-0", "break-words");
      expect(btn).not.toHaveClass("whitespace-nowrap");
      expect(btn).not.toHaveClass("h-9");
    }

    fireEvent.click(within(group).getByRole("button", { name: "Deep Evidence Walk" }));
    expect(onVisitModeChange).toHaveBeenCalledWith("deep_evidence_walk");
  });

  it("applies the same wrap-safe classes to the 'Deep Evidence Walk' button in the grower QuickLog dialog", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <QuickLog
          open
          onOpenChange={vi.fn()}
          prefill={{ plantId: "plant-1", growId: "grow-1", tentId: "tent-1" }}
        />
      </QueryClientProvider>,
    );

    const deepEvidenceButton = screen.getByTestId("ql-visit-mode-deep_evidence_walk");
    expect(deepEvidenceButton).toHaveTextContent("Deep Evidence Walk");
    expect(deepEvidenceButton).toHaveClass(
      "whitespace-normal",
      "h-auto",
      "min-h-9",
      "min-w-0",
      "break-words",
    );
    expect(deepEvidenceButton).not.toHaveClass("whitespace-nowrap");
    expect(deepEvidenceButton).not.toHaveClass("h-9");
  });
});
