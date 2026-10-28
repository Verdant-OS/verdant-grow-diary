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
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id?: string }>,
  plantsRead: "ok" as "ok" | "throw",
  failTable: null as string | null,
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
  useAuth: () => ({ user: { id: "44444444-4444-4444-8444-444444444444" }, loading: false }),
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
                      name: payload.name,
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

describe("Start your room in one submit", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.grows = [];
    testState.tents = [];
    testState.plantsRead = "ok";
    testState.failTable = null;
    testState.insertGate = null;
    testState.insertOutcome = "ok";
    testState.insert.mockReset();
    testState.nav.mockReset();
    let n = 0;
    const order = [IDS.grow, IDS.tent, IDS.plant];
    vi.stubGlobal("crypto", { randomUUID: () => order[n++] ?? IDS.plant });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    // An unknown outcome leaves a same-runtime fence; never leak it to the next case.
    delete (globalThis as Record<string, unknown>)[
      "__verdantHierarchyCreateOutcomeRecoveryRuntimeState"
    ];
  });

  it("creates the grow, tent and plant in order from one submit and opens the plant", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByTestId("start-your-room-step-room")).toBeInTheDocument();
    await user.type(screen.getByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));

    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(testState.nav).toHaveBeenCalledWith(`/plants/${IDS.plant}?open=quick-log`, {
      replace: true,
    });
    expect(insertedTables()).toEqual(["grows", "tents", "plants"]);
    const [grow, tent, plant] = testState.insert.mock.calls.map(([, payload]) => payload);
    // Blank optional names fall back to the defaults the form promises.
    expect(grow).toMatchObject({ id: IDS.grow, name: "My grow" });
    expect(tent).toMatchObject({ id: IDS.tent, name: "Tent 1", grow_id: IDS.grow });
    expect(plant).toMatchObject({
      id: IDS.plant,
      name: "Plant A",
      grow_id: IDS.grow,
      tent_id: IDS.tent,
    });
  });

  it("creates only the missing tent and plant on a Free partial resume", async () => {
    testState.grows = [{ id: "grow-existing", name: "QA Mid" }];
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent("QA Mid");
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));

    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(insertedTables()).toEqual(["tents", "plants"]);
    expect(testState.insert).toHaveBeenCalledWith(
      "plants",
      expect.objectContaining({ grow_id: "grow-existing" }),
    );
  });

  it("retries a failed tent save on the same row without creating a second grow", async () => {
    testState.failTable = "tents";
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByTestId("start-room-plant-name"), "Plant A");
    await user.click(screen.getByTestId("start-room-submit"));
    expect(await screen.findByTestId("start-your-room-error")).toHaveTextContent(
      "Verdant could not save this tent",
    );
    expect(insertedTables()).toEqual(["grows", "tents"]);
    expect(testState.nav).not.toHaveBeenCalled();

    testState.failTable = null;
    const retry = screen.getByTestId("start-room-save-retry");
    fireEvent.click(retry);
    fireEvent.click(retry);

    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(insertedTables()).toEqual(["grows", "tents", "tents", "plants"]);
    const tentIds = testState.insert.mock.calls
      .filter(([table]) => table === "tents")
      .map(([, payload]) => payload.id);
    expect(tentIds).toEqual([IDS.tent, IDS.tent]);
  });

  it("shows the Free gate and inserts nothing when a grow exists and cannot be resumed", async () => {
    testState.grows = [{ id: "grow-existing", name: "QA Mid" }];
    testState.plantsRead = "throw";
    renderPage();
    expect(await screen.findByTestId("start-room-creation-gate")).toHaveTextContent(
      "Free includes 1 active grow",
    );
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Plant A" },
    });
    const submit = screen.getByTestId("start-room-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    fireEvent.submit(submit.closest("form")!);
    expect(testState.insert).not.toHaveBeenCalled();
    expect(testState.nav).not.toHaveBeenCalled();
  });

  it("ignores a second submit while the first save is still in flight", async () => {
    let release: () => void = () => undefined;
    testState.insertGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPage();
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Plant A" },
    });
    // Submit the form directly: the disabled button must not be the only fence.
    const form = screen.getByTestId("start-room-submit").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(testState.insert).toHaveBeenCalled());
    expect(insertedTables()).toEqual(["grows"]);

    release();
    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(insertedTables()).toEqual(["grows", "tents", "plants"]);
  });

  it("refuses a new submit after a save whose outcome is unknown", async () => {
    testState.insertOutcome = "lost";
    renderPage();
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Plant A" },
    });
    const form = screen.getByTestId("start-room-submit").closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByTestId("start-room-create-outcome-unknown")).toBeInTheDocument();
    expect(insertedTables()).toEqual(["grows"]);

    fireEvent.submit(form);
    expect(await screen.findByTestId("start-your-room-error")).toHaveTextContent(
      "Refresh this page before trying to create another room item.",
    );
    expect(insertedTables()).toEqual(["grows"]);
    expect(testState.nav).not.toHaveBeenCalled();
  });

  it("puts the cursor in the plant name on first paint", async () => {
    renderPage();
    const plantName = await screen.findByTestId("start-room-plant-name");
    await waitFor(() => expect(plantName).toHaveFocus());
  });

  it("submits the room on Enter from the plant name", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByTestId("start-room-plant-name"), "Plant A{Enter}");
    await waitFor(() => expect(testState.nav).toHaveBeenCalledTimes(1));
    expect(insertedTables()).toEqual(["grows", "tents", "plants"]);
  });
});
