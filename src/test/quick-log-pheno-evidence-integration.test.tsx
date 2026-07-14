import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const saveMock = vi.fn();
const huntResult = {
  current: {
    data: {
      id: "hunt-1",
      name: "Blue Dream Hunt",
      evidence_goals: ["structure", "aroma"],
    } as Record<string, unknown> | null,
    error: null as unknown,
  },
};

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: (...args: unknown[]) => saveMock(...args),
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "pheno_hunts") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => huntResult.current }),
          }),
        };
      }
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.in = chain;
      builder.or = chain;
      builder.order = chain;
      builder.update = () => ({ eq: vi.fn() });
      builder.limit = async () => ({ data: [], error: null });
      return builder;
    },
  },
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "flower" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "flower" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      {
        id: "plant-1",
        name: "Candidate Plant",
        tent_id: "tent-1",
        grow_id: "grow-1",
        stage: "flower",
        created_at: "2026-06-01T00:00:00Z",
        pheno_hunt_id: "hunt-1",
        candidate_label: "#7",
      },
    ],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Tent 1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import QuickLog from "@/components/QuickLog";

function renderQuickLog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog open onOpenChange={vi.fn()} prefill={{ plantId: "plant-1", growId: "grow-1" }} />
    </QueryClientProvider>,
  );
}

describe("Quick Log Pheno evidence integration", () => {
  beforeEach(() => {
    saveMock.mockReset();
    saveMock.mockResolvedValue({ ok: true });
    huntResult.current = {
      data: {
        id: "hunt-1",
        name: "Blue Dream Hunt",
        evidence_goals: ["structure", "aroma"],
      },
      error: null,
    };
  });

  it("adds an explicitly selected configured goal to the existing RPC payload", async () => {
    renderQuickLog();
    const panel = await screen.findByTestId("quick-log-pheno-evidence-panel");
    await waitFor(() => expect(panel).toHaveAttribute("data-status", "ready"));
    expect(within(panel).getByText(/Pheno evidence · #7/)).toBeInTheDocument();
    expect(within(panel).queryByText("Yield")).toBeNull();

    fireEvent.click(within(panel).getByTestId("quick-log-pheno-evidence-goal-structure"));
    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "Strong lateral branching." },
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      p_action: "note",
      p_target_id: "plant-1",
      p_details: {
        kind: "pheno_evidence_receipt",
        source: "manual",
        hunt_id: "hunt-1",
        plant_id: "plant-1",
        evidence_goal: "structure",
        stage: "flower",
        automatic_selection: false,
        action_queue_created: false,
        device_control: false,
      },
    });
  });

  it("fails closed for an unavailable hunt but still saves a normal Quick Log", async () => {
    huntResult.current = { data: null, error: { message: "denied" } };
    renderQuickLog();
    const panel = await screen.findByTestId("quick-log-pheno-evidence-panel");
    await waitFor(() => expect(panel).toHaveAttribute("data-status", "error"));
    expect(within(panel).getByText(/regular Quick Log can still be saved/i)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("quicklog-note"), {
      target: { value: "Manual observation only." },
    });
    fireEvent.click(screen.getByTestId("quick-log-save"));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0][0].p_details).toBeNull();
  });
});
