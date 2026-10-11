/**
 * QUICKLOG_OBS_INTERP_ACTION_CLOSEOUT — guided Obs|Interp|Action fields
 * compose into the accurate note only when Apply is used.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { composeGrowWalkCloseoutNote } from "@/lib/growWalkContracts";

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

describe("composeGrowWalkCloseoutNote", () => {
  it("formats Observation and omits empty optional sections", () => {
    expect(
      composeGrowWalkCloseoutNote({
        observation: "  Leaf tips yellow at top  ",
        interpretation: "",
        action: "  ",
      }),
    ).toBe("Observation: Leaf tips yellow at top");
  });

  it("includes Interpretation, Action, and Next checkpoint when present", () => {
    expect(
      composeGrowWalkCloseoutNote({
        observation: "Canopy dry",
        interpretation: "Possible under-watering; uncertain",
        action: "none tonight",
        nextCheckpoint: "24 hours",
      }),
    ).toBe(
      [
        "Observation: Canopy dry",
        "Interpretation: Possible under-watering; uncertain",
        "Action: none tonight",
        "Next checkpoint: 24 hours",
      ].join("\n"),
    );
  });

  it("returns empty string when everything is blank (no invented content)", () => {
    expect(
      composeGrowWalkCloseoutNote({
        observation: "   ",
        interpretation: "",
        action: undefined,
        nextCheckpoint: undefined,
      }),
    ).toBe("");
  });
});

describe("Quick Log Obs|Interp|Action guided closeout", () => {
  it("does not show closeout fields in Fast Check", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    expect(screen.getByTestId("ql-visit-mode-fast_check")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("ql-grow-walk-closeout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ql-closeout-observation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ql-apply-closeout")).not.toBeInTheDocument();
  });

  it("shows closeout fields in guided mode when target is verified", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));
    expect(screen.getByTestId("ql-grow-walk-closeout")).toBeInTheDocument();
    expect(screen.getByTestId("ql-closeout-observation")).toBeInTheDocument();
    expect(screen.getByTestId("ql-closeout-interpretation")).toHaveAttribute(
      "placeholder",
      "Mark uncertainty; no keeper claims",
    );
    expect(screen.getByTestId("ql-closeout-action")).toHaveAttribute(
      "placeholder",
      "none tonight | exact reversible task",
    );
    expect(screen.getByTestId("ql-closeout-next-checkpoint")).toBeInTheDocument();
    expect(screen.getByTestId("ql-apply-closeout")).toBeInTheDocument();
    expect(screen.getByTestId("ql-grow-walk-nonpersist-disclosure")).toHaveTextContent(
      "Closeout fields apply to the note only when you use Apply closeout to note",
    );
    expect(
      screen.getByText(/Nothing is sent to the approval-required Action Queue automatically/),
    ).toBeInTheDocument();
  });

  it("soft-requires Observation when Apply is clicked empty", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));
    fireEvent.click(screen.getByTestId("ql-apply-closeout"));
    expect(screen.getByTestId("ql-closeout-observation-required")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("Apply appends composed closeout to the note with a blank-line separator", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));

    const note = screen.getByTestId("quicklog-note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Existing grower note" } });

    fireEvent.change(screen.getByTestId("ql-closeout-observation"), {
      target: { value: "Edges curling" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-interpretation"), {
      target: { value: "Could be VPD; uncertain" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-action"), {
      target: { value: "none tonight" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-next-checkpoint"), {
      target: { value: "Next visit" },
    });
    fireEvent.click(screen.getByTestId("ql-apply-closeout"));

    expect(note.value).toBe(
      [
        "Existing grower note",
        "",
        "Observation: Edges curling",
        "Interpretation: Could be VPD; uncertain",
        "Action: none tonight",
        "Next checkpoint: Next visit",
      ].join("\n"),
    );
  });

  it("clears Obs|Interp|Action|Next after Apply so a second Apply does not double-append", () => {
    renderQuickLog({ plantId: "p1", growId: "g1", tentId: "t1" });
    fireEvent.click(screen.getByTestId("ql-visit-mode-routine_walk"));

    const note = screen.getByTestId("quicklog-note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Seed note" } });

    fireEvent.change(screen.getByTestId("ql-closeout-observation"), {
      target: { value: "Edges curling" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-interpretation"), {
      target: { value: "Could be VPD; uncertain" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-action"), {
      target: { value: "none tonight" },
    });
    fireEvent.change(screen.getByTestId("ql-closeout-next-checkpoint"), {
      target: { value: "Next visit" },
    });
    fireEvent.click(screen.getByTestId("ql-apply-closeout"));

    const afterFirst = note.value;
    expect(afterFirst).toContain("Observation: Edges curling");

    const obs = screen.getByTestId("ql-closeout-observation") as HTMLTextAreaElement;
    const interp = screen.getByTestId("ql-closeout-interpretation") as HTMLTextAreaElement;
    const action = screen.getByTestId("ql-closeout-action") as HTMLTextAreaElement;
    const next = screen.getByTestId("ql-closeout-next-checkpoint") as HTMLInputElement;
    expect(obs.value).toBe("");
    expect(interp.value).toBe("");
    expect(action.value).toBe("");
    expect(next.value).toBe("");
    expect(screen.queryByTestId("ql-closeout-observation-required")).not.toBeInTheDocument();

    // Second Apply with empty fields soft-blocks; note stays unchanged (no double-append).
    fireEvent.click(screen.getByTestId("ql-apply-closeout"));
    expect(screen.getByTestId("ql-closeout-observation-required")).toHaveAttribute(
      "role",
      "status",
    );
    expect(note.value).toBe(afterFirst);
  });
});
