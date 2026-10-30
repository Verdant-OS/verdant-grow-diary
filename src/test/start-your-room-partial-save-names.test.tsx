import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

// VER-296: the first grow, tent and plant are created by one submit.

const IDS = {
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
} as const;

const testState = vi.hoisted(() => ({
  userId: "44444444-4444-4444-8444-444444444444",
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id?: string }>,
  plantsRead: "ok" as "ok" | "throw",
  failTable: null as string | null,
  returnedNames: {} as Record<string, string>,
  omitNames: false,
  // Holds every insert response until released (double-submit window).
  insertGate: null as Promise<void> | null,
  // "lost": the insert commits but its response never arrives, and the
  // owner-scoped re-read finds nothing, so the outcome is unknown.
  insertOutcome: "ok" as "ok" | "lost",
  insert: vi.fn(),
  nav: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => testState.nav };
});

vi.mock("@/store/auth", () => ({
  // A UUID owner: the unknown-outcome fence records only well-formed owner ids.
  useAuth: () => ({ user: { id: testState.userId }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
    loading: false,
    error: null,
    activeGrowId: testState.grows[0]?.id ?? null,
    activeGrow: testState.grows[0] ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: testState.tents,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const insert = (payload: Record<string, unknown>) => {
        testState.insert(table, payload);
        return {
          select: () => ({
            single: async () => {
              await testState.insertGate;
              if (testState.insertOutcome === "lost") {
                throw new TypeError("Failed to fetch after commit");
              }
              return testState.failTable === table
                ? { data: null, error: { code: "P0001", message: "relation exploded" } }
                : {
                    data: {
                      id: payload.id,
                      ...(testState.omitNames
                        ? {}
                        : { name: testState.returnedNames[table] ?? payload.name }),
                      user_id: payload.user_id,
                      ...(table === "grows" ? {} : { grow_id: payload.grow_id }),
                      ...(table === "plants" ? { tent_id: payload.tent_id } : {}),
                    },
                    error: null,
                  };
            },
          }),
        };
      };
      const reRead = {
        eq: () => reRead,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      if (table !== "plants") return { insert, select: () => reRead };
      const chain = {
        select: () => {
          if (testState.plantsRead === "throw") throw new Error("plants unavailable");
          return chain;
        },
        eq: () => chain,
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
        insert,
      };
      return chain;
    },
  },
}));

import StartYourRoom from "@/pages/StartYourRoom";

function renderPage() {
  return render(
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>,
  );
}

const insertedTables = () => testState.insert.mock.calls.map(([table]) => table);

describe("Start your room saved-name summary", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.userId = "44444444-4444-4444-8444-444444444444";
    testState.grows = [];
    testState.tents = [];
    testState.plantsRead = "ok";
    testState.failTable = null;
    testState.returnedNames = {};
    testState.omitNames = false;
    testState.insertGate = null;
    testState.insertOutcome = "ok";
    testState.insert.mockReset();
    testState.nav.mockReset();
    let n = 0;
    const order = [IDS.grow, IDS.tent, IDS.plant];
    // Override only randomUUID; the rest of crypto stays real.
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
      () => (order[n++] ?? IDS.plant) as ReturnType<Crypto["randomUUID"]>,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    // An unknown outcome leaves a same-runtime fence; never leak it to the next case.
    delete (globalThis as Record<string, unknown>)[
      "__verdantHierarchyCreateOutcomeRecoveryRuntimeState"
    ];
  });

  it.each([
    ["tents", "My grow"],
    ["plants", "My grow · tent Tent 1"],
  ])("shows confirmed default names after a failed %s save", async (failedTable, summary) => {
    testState.failTable = failedTable;
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));
    await screen.findByTestId("start-room-save-retry");
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent(
      `Bound to grow: ${summary}`,
    );
    testState.failTable = null;
    await user.click(screen.getByTestId("start-room-save-retry"));
    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(testState.insert.mock.calls.filter(([table]) => table === "grows")).toHaveLength(1);
    if (failedTable === "plants") {
      expect(testState.insert.mock.calls.filter(([table]) => table === "tents")).toHaveLength(1);
    }
  });

  it("uses the confirmed row names instead of the submitted typing after a partial save", async () => {
    testState.failTable = "plants";
    testState.returnedNames = { grows: "Saved north grow", tents: "Saved north tent" };
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByText("Name your grow and tent (optional)"));
    await user.type(screen.getByTestId("start-room-grow-name"), "Typed grow");
    await user.type(screen.getByTestId("start-room-tent-name"), "Typed tent");
    await user.click(screen.getByTestId("start-room-submit"));
    await screen.findByTestId("start-room-save-retry");
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: Saved north grow · tent Saved north tent",
    );
  });

  it("reads saved names from the matching room records after remount", async () => {
    testState.failTable = "plants";
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(await screen.findByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));
    await screen.findByTestId("start-room-save-retry");
    view.unmount();
    testState.grows = [{ id: IDS.grow, name: "Renamed saved grow" }];
    testState.tents = [{ id: IDS.tent, grow_id: IDS.grow, name: "Renamed saved tent" }];
    renderPage();
    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: Renamed saved grow · tent Renamed saved tent",
    );
  });

  it("does not show the previous owner's saved names after an account switch", async () => {
    testState.failTable = "plants";
    testState.returnedNames = { grows: "Private grow A", tents: "Private tent A" };
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(await screen.findByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));
    await screen.findByTestId("start-room-save-retry");
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent("Private grow A");
    testState.userId = "55555555-5555-4555-8555-555555555555";
    view.rerender(<MemoryRouter><StartYourRoom /></MemoryRouter>);
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("");
    expect(screen.queryByTestId("start-room-bound-grow")).not.toBeInTheDocument();
    expect(screen.queryByText(/Private (grow|tent) A/)).not.toBeInTheDocument();
  });

  it("keeps unknown-name fallback when confirmation has no saved name", async () => {
    testState.failTable = "plants";
    testState.omitNames = true;
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));
    await screen.findByTestId("start-room-save-retry");
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent(
      "Bound to grow: your grow · tent your tent",
    );
  });
});
