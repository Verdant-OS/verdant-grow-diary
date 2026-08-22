import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const IDS = {
  owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  grow: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tent: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  plant: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
} as const;

const state = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  tents: [] as Array<{ id: string; name: string }>,
  inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  durableRows: new Map<string, Record<string, unknown>>(),
  reconciliation: "confirmed" as "confirmed" | "missing",
  insertGate: null as Promise<void> | null,
  refresh: vi.fn(async () => undefined),
  setActiveGrowId: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
  onTentCreated: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: IDS.owner }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: state.grows,
    activeGrowId: state.activeGrowId,
    loading: false,
    error: null,
    refresh: state.refresh,
    setActiveGrowId: state.setActiveGrowId,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: state.tents,
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        state.inserted.push({ table, payload });
        state.durableRows.set(table, payload);
        return {
          select: () => ({
            single: async () => {
              await state.insertGate;
              throw new TypeError("Failed to fetch after commit");
            },
          }),
        };
      },
      select: () => ({
        eq: (_field: string, id: string) => ({
          maybeSingle: async () => {
            const row = state.durableRows.get(table);
            return {
              data: state.reconciliation === "confirmed" && row?.id === id ? row : null,
              error: null,
            };
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreateTentDialog from "@/components/CreateTentDialog";
import Grows from "@/pages/Grows";
import StartYourRoom from "@/pages/StartYourRoom";

beforeEach(() => {
  state.grows = [];
  state.activeGrowId = null;
  state.tents = [];
  state.inserted = [];
  state.durableRows.clear();
  state.reconciliation = "confirmed";
  state.insertGate = null;
  state.refresh.mockClear();
  state.setActiveGrowId.mockClear();
  state.invalidateQueries.mockClear();
  state.onTentCreated.mockClear();
  vi.stubGlobal("crypto", {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce(IDS.grow)
      .mockReturnValueOnce(IDS.tent)
      .mockReturnValueOnce(IDS.plant),
  });
});

describe("hierarchy creators recover an ambiguous committed insert", () => {
  it("reconciles a Grow response loss by its preallocated owner row", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Grows />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("grows-new-button"));
    await user.type(screen.getByPlaceholderText("Tent #1, Backyard, Mothers…"), "Recovery Grow");
    await user.click(screen.getByRole("button", { name: "Create grow" }));

    await waitFor(() => expect(state.inserted).toHaveLength(1));
    expect(state.inserted[0]).toMatchObject({
      table: "grows",
      payload: { id: IDS.grow, user_id: IDS.owner, name: "Recovery Grow" },
    });
    await waitFor(() => expect(state.setActiveGrowId).toHaveBeenCalledWith(IDS.grow));
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it("reconciles a standalone Tent response loss within its requested grow", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => IDS.tent) });
    state.grows = [{ id: IDS.grow, name: "Recovery Grow" }];
    state.activeGrowId = IDS.grow;
    render(
      <MemoryRouter>
        <CreateTentDialog initiallyOpen defaultGrowId={IDS.grow} onCreated={state.onTentCreated} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Tent #1"), "Recovery Tent");
    await user.click(screen.getByTestId("tent-create-submit"));

    await waitFor(() => expect(state.inserted).toHaveLength(1));
    expect(state.inserted[0]).toMatchObject({
      table: "tents",
      payload: { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow, name: "Recovery Tent" },
    });
    await waitFor(() =>
      expect(state.onTentCreated).toHaveBeenCalledWith({
        id: IDS.tent,
        name: "Recovery Tent",
        grow_id: IDS.grow,
      }),
    );
  });

  it("reconciles every Start Your Room stage before advancing", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-grow-name"), "Recovery Grow");
    await user.click(screen.getByTestId("start-room-grow-submit"));
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();

    await user.type(screen.getByTestId("start-room-tent-name"), "Recovery Tent");
    await user.click(screen.getByTestId("start-room-tent-submit"));
    expect(await screen.findByTestId("start-your-room-step-plant")).toBeInTheDocument();

    await user.type(screen.getByTestId("start-room-plant-name"), "Recovery Plant");
    await user.click(screen.getByTestId("start-room-plant-submit"));
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();

    expect(state.inserted).toMatchObject([
      { table: "grows", payload: { id: IDS.grow, user_id: IDS.owner } },
      { table: "tents", payload: { id: IDS.tent, user_id: IDS.owner, grow_id: IDS.grow } },
      {
        table: "plants",
        payload: {
          id: IDS.plant,
          user_id: IDS.owner,
          grow_id: IDS.grow,
          tent_id: IDS.tent,
        },
      },
    ]);
  });

  it("locks a Grow retry when its committed outcome cannot be reconciled", async () => {
    const user = userEvent.setup();
    state.reconciliation = "missing";
    render(
      <MemoryRouter>
        <Grows />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("grows-new-button"));
    await user.type(screen.getByPlaceholderText("Tent #1, Backyard, Mothers…"), "Unknown Grow");
    await user.click(screen.getByRole("button", { name: "Create grow" }));

    expect(await screen.findByTestId("grow-create-outcome-unknown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create grow" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Create grow" }));
    expect(state.inserted).toHaveLength(1);
  });

  it("locks a standalone Tent retry when its committed outcome cannot be reconciled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => IDS.tent) });
    state.reconciliation = "missing";
    state.grows = [{ id: IDS.grow, name: "Recovery Grow" }];
    state.activeGrowId = IDS.grow;
    render(
      <MemoryRouter>
        <CreateTentDialog initiallyOpen defaultGrowId={IDS.grow} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Tent #1"), "Unknown Tent");
    await user.click(screen.getByTestId("tent-create-submit"));

    expect(await screen.findByTestId("tent-create-outcome-unknown")).toBeInTheDocument();
    expect(screen.getByTestId("tent-create-submit")).toBeDisabled();
    await user.click(screen.getByTestId("tent-create-submit"));
    expect(state.inserted).toHaveLength(1);
  });

  it("locks the guided path when its first committed outcome cannot be reconciled", async () => {
    const user = userEvent.setup();
    state.reconciliation = "missing";
    render(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-grow-name"), "Unknown Grow");
    await user.click(screen.getByTestId("start-room-grow-submit"));

    expect(await screen.findByTestId("start-room-create-outcome-unknown")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-grow-submit")).toBeDisabled();
    await user.click(screen.getByTestId("start-room-grow-submit"));
    expect(state.inserted).toHaveLength(1);
  });

  it("allows the Grow dialog to settle confirmed even when its list refresh rejects", async () => {
    const user = userEvent.setup();
    state.refresh.mockRejectedValueOnce(new Error("refresh unavailable"));
    render(
      <MemoryRouter>
        <Grows />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("grows-new-button"));
    await user.type(screen.getByPlaceholderText("Tent #1, Backyard, Mothers…"), "Confirmed Grow");
    await user.click(screen.getByRole("button", { name: "Create grow" }));

    await waitFor(() => expect(state.setActiveGrowId).toHaveBeenCalledWith(IDS.grow));
    expect(screen.queryByPlaceholderText("Tent #1, Backyard, Mothers…")).not.toBeInTheDocument();
    expect(state.inserted).toHaveLength(1);
  });

  it("advances Start Your Room after a confirmed grow even when its list refresh rejects", async () => {
    const user = userEvent.setup();
    state.refresh.mockRejectedValueOnce(new Error("refresh unavailable"));
    render(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-grow-name"), "Confirmed Grow");
    await user.click(screen.getByTestId("start-room-grow-submit"));

    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();
    expect(screen.queryByTestId("start-room-grow-submit")).not.toBeInTheDocument();
    expect(state.inserted).toHaveLength(1);
  });

  it("closes the standalone Tent dialog when its post-confirm callback throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => IDS.tent) });
    state.grows = [{ id: IDS.grow, name: "Recovery Grow" }];
    state.activeGrowId = IDS.grow;
    state.onTentCreated.mockImplementationOnce(() => {
      throw new Error("parent callback unavailable");
    });
    render(
      <MemoryRouter>
        <CreateTentDialog initiallyOpen defaultGrowId={IDS.grow} onCreated={state.onTentCreated} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Tent #1"), "Confirmed Tent");
    await user.click(screen.getByTestId("tent-create-submit"));

    await waitFor(() => expect(state.inserted).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument());
  });

  it("prevents double submits during delayed Grow persistence", async () => {
    const user = userEvent.setup();
    let releaseInsert: (() => void) | undefined;
    state.insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    render(
      <MemoryRouter>
        <Grows />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId("grows-new-button"));
    await user.type(screen.getByPlaceholderText("Tent #1, Backyard, Mothers…"), "Delayed Grow");
    const form = screen.getByRole("button", { name: "Create grow" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(state.inserted).toHaveLength(1);
    releaseInsert?.();
    await waitFor(() => expect(state.setActiveGrowId).toHaveBeenCalledWith(IDS.grow));
  });

  it("prevents double submits during delayed standalone Tent persistence", async () => {
    const user = userEvent.setup();
    let releaseInsert: (() => void) | undefined;
    state.insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => IDS.tent) });
    state.grows = [{ id: IDS.grow, name: "Recovery Grow" }];
    state.activeGrowId = IDS.grow;
    render(
      <MemoryRouter>
        <CreateTentDialog initiallyOpen defaultGrowId={IDS.grow} />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("Tent #1"), "Delayed Tent");
    const form = screen.getByTestId("tent-create-submit").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(state.inserted).toHaveLength(1);
    releaseInsert?.();
    await waitFor(() => expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument());
  });

  it("prevents double submits during delayed Start Your Room persistence", async () => {
    const user = userEvent.setup();
    let releaseInsert: (() => void) | undefined;
    state.insertGate = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    render(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-grow-name"), "Delayed Grow");
    fireEvent.click(screen.getByTestId("start-room-grow-submit"));
    fireEvent.click(screen.getByTestId("start-room-grow-submit"));

    expect(state.inserted).toHaveLength(1);
    releaseInsert?.();
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();
  });
});
