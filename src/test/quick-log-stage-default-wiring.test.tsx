/**
 * Slice A2 — Quick Log stage defaulting: COMPONENT wiring.
 *
 * The pure resolver is proven in quick-log-stage-default.test.ts. These
 * rendered tests lock the wiring the resolver cannot reach — the exact
 * behaviors an adversarial review flagged as untested:
 *
 *  1. The selected PLANT's stage actually reaches the Stage <Select> — a
 *     flowering plant opens showing "Flowering", not "Vegetative" (the literal
 *     bug this slice fixes). Grow stage is the fallback; unknown stays blank.
 *  2. The grow-stage WRITEBACK is gated on a manual stage edit: an ordinary
 *     save (grower never touched Stage) must NOT mutate grows.stage, even when
 *     the plant's default stage differs from the grow's. This is the
 *     highest-risk regression surface of the slice.
 *
 * Harness mirrors quicklog-post-save-target-plant.test.tsx (mock supabase,
 * grows, plants, tents, sonner, sensor). No real network, no auth, no writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { rpcMock, growsUpdateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  // Observable spy for supabase.from("grows").update(...). Returns the chained
  // .eq() so the component's writeback call shape stays valid.
  growsUpdateMock: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    from: (table: string) =>
      table === "grows"
        ? { update: growsUpdateMock }
        : { update: () => ({ eq: () => Promise.resolve({ error: null }) }) },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

// Mutable so each test can shape the grow / plant stage it needs.
const growState = { stage: "veg" as string | null };
let plantsData: Array<Record<string, unknown>> = [];
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "Grow #1", stage: growState.stage }],
    activeGrow: { id: "g1", name: "Grow #1", stage: growState.stage },
    activeGrowId: "g1",
    setActiveGrowId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => ({ data: plantsData }) }));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "t1", name: "Tent 1", grow_id: "g1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/components/QuickLogSensorSnapshotStrip", () => ({ default: () => null }));

import QuickLog from "@/components/QuickLog";

function renderQL(props: Parameters<typeof QuickLog>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLog {...props} />
    </QueryClientProvider>,
  );
}

/** The Stage Select trigger reflects the resolved stage as its option label. */
function stageText(): string {
  return screen.getByTestId("quick-log-stage-select").textContent ?? "";
}

beforeEach(() => {
  rpcMock.mockClear();
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
  growsUpdateMock.mockClear();
  growState.stage = "veg";
  plantsData = [];
});
afterEach(() => cleanup());

describe("QuickLog stage defaulting — plant stage reaches the Select", () => {
  it("a flowering plant opens the form showing Flowering (not Vegetative)", () => {
    // Single scoped plant → auto-selected; its stage must win over the veg grow.
    growState.stage = "veg";
    plantsData = [
      { id: "p1", name: "Zkittlez", strain: "ZK", tent_id: "t1", grow_id: "g1", stage: "flower" },
    ];
    renderQL({ open: true, onOpenChange: () => {} });
    expect(stageText()).toMatch(/Flowering/);
    expect(stageText()).not.toMatch(/Vegetative/);
  });

  it("falls back to the active grow stage when the plant has no stage", () => {
    growState.stage = "flower";
    plantsData = [
      { id: "p1", name: "Zkittlez", strain: "ZK", tent_id: "t1", grow_id: "g1" }, // no stage
    ];
    renderQL({ open: true, onOpenChange: () => {} });
    expect(stageText()).toMatch(/Flowering/);
  });

  it("a curing plant ('cure') opens showing Drying / Curing (alias mapped)", () => {
    // Plant dialogs store stage "cure"; grow.STAGES canonical is "drying".
    growState.stage = "veg";
    plantsData = [
      { id: "p1", name: "Runtz", strain: "RZ", tent_id: "t1", grow_id: "g1", stage: "cure" },
    ];
    renderQL({ open: true, onOpenChange: () => {} });
    expect(stageText()).toMatch(/Drying \/ Curing/);
    expect(stageText()).not.toMatch(/Vegetative/);
  });

  it("unknown context shows the blank placeholder — NOT Vegetative", () => {
    growState.stage = null; // neither plant nor grow stage known
    plantsData = [{ id: "p1", name: "Mystery", strain: "??", tent_id: "t1", grow_id: "g1" }];
    renderQL({ open: true, onOpenChange: () => {} });
    const txt = stageText();
    expect(txt).not.toMatch(/Vegetative/);
    // Placeholder, not a real stage label.
    expect(txt).toMatch(/Select stage/);
  });
});

describe("QuickLog stage defaulting — grow writeback is gated on manual edit", () => {
  it("an ordinary save (stage never touched) does NOT mutate the grow's stage", async () => {
    // Flower plant inside a veg grow: the defaulted stage ('flower') differs
    // from the grow ('veg'). Before the touched-ref gate this would silently
    // write 'flower' onto the grow. It must not.
    growState.stage = "veg";
    plantsData = [
      { id: "p1", name: "Zkittlez", strain: "ZK", tent_id: "t1", grow_id: "g1", stage: "flower" },
    ];
    renderQL({ open: true, onOpenChange: () => {}, prefill: { plantId: "p1", growId: "g1" } });

    // Confirm the form did default to the plant's (differing) stage.
    expect(stageText()).toMatch(/Flowering/);

    // Add a note and save via submit (no interaction with the Stage select).
    fireEvent.change(screen.getByPlaceholderText(/Watered, looking healthy/i), {
      target: { value: "routine check" },
    });
    fireEvent.submit(screen.getByTestId("quick-log-save").closest("form") as HTMLFormElement);

    // The save RPC ran (so we reached the writeback point)...
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    // ...but the grow's stage was left untouched.
    expect(growsUpdateMock).not.toHaveBeenCalled();
  });
});
