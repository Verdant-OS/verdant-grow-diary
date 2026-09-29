import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssignTentDialog from "@/components/AssignTentDialog";

type Tent = { id: string; name: string; grow_id: string; is_archived: boolean };
type ReadResult = { data: Tent[] | null; error: { message: string } | null };

const state = vi.hoisted(() => ({
  rows: [] as Tent[],
  readError: false,
  fallbackError: false,
  deferred: null as Promise<ReadResult> | null,
  reads: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "fixture-owner" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "plants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { pheno_hunt_id: null }, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              state.writes.push({ table, payload });
              return { error: null };
            },
          }),
        };
      }
      if (table === "diary_entries") {
        return {
          insert: async (payload: Record<string, unknown>) => {
            state.writes.push({ table, payload });
            return { error: null };
          },
        };
      }
      if (table !== "tents") throw new Error(`Unexpected table: ${table}`);
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        order: async (): Promise<ReadResult> => {
          state.reads.push({ ...filters });
          if (state.deferred) return state.deferred;
          if (state.readError || (state.fallbackError && !filters.grow_id)) {
            return { data: null, error: { message: "tent read unavailable" } };
          }
          return {
            data: state.rows.filter((row) =>
              Object.entries(filters).every(([key, value]) => row[key as keyof Tent] === value),
            ),
            error: null,
          };
        },
      };
      return query;
    },
  },
}));

const clients: QueryClient[] = [];
const queryPrefix = ["plant-detail", "eligible-tents", "plant-fixture"];

beforeEach(() => {
  Object.assign(state, {
    rows: [
      { id: "tent-current", name: "Veg Tent B", grow_id: "grow-a", is_archived: false },
      { id: "tent-next", name: "Veg Tent A", grow_id: "grow-a", is_archived: false },
    ],
    readError: false,
    fallbackError: false,
    deferred: null,
    reads: [],
    writes: [],
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function openDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <AssignTentDialog plantId="plant-fixture" growId="grow-a" currentTentId="tent-current" open />
    </QueryClientProvider>,
  );
  return client;
}

async function chooseNextTent() {
  fireEvent.keyDown(await screen.findByTestId("assign-tent-select"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Veg Tent A" }));
}

function expectNoMoveOrEmptyClaim() {
  expect(screen.queryByTestId("assign-tent-empty")).toBeNull();
  expect(screen.queryByTestId("assign-tent-create-tent-cta")).toBeNull();
  expect(screen.queryByTestId("assign-tent-select")).toBeNull();
  expect(screen.queryByTestId("assign-tent-submit")).toBeNull();
  expect(state.writes).toEqual([]);
}

describe("Move Plant eligible-tent read honesty", () => {
  it("reports a failed first read as unavailable, with Retry and no empty or creation claim", async () => {
    state.readError = true;
    openDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Tent destinations are unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expectNoMoveOrEmptyClaim();
  });

  it("hides cached destinations after a failed refresh and restores them only after Retry succeeds", async () => {
    const client = openDialog();
    await chooseNextTent();
    expect(screen.getByTestId("assign-tent-submit")).toBeEnabled();
    state.readError = true;
    await act(() => client.refetchQueries({ queryKey: queryPrefix }));
    await screen.findByRole("alert");
    expect(client.getQueriesData({ queryKey: queryPrefix })[0]?.[1]).toHaveLength(2);
    expectNoMoveOrEmptyClaim();
    state.readError = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("assign-tent-select");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state.writes).toEqual([]);
    expect(state.reads).toHaveLength(3);
  });

  it("retries the full scoped-plus-fallback read after the owner fallback fails", async () => {
    state.rows = [{ id: "male", name: "Male Tent", grow_id: "grow-b", is_archived: false }];
    state.fallbackError = true;
    openDialog();
    await screen.findByRole("alert");
    expectNoMoveOrEmptyClaim();
    state.fallbackError = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("assign-tent-select");
    expect(state.reads).toEqual([
      { is_archived: false, grow_id: "grow-a" },
      { is_archived: false },
      { is_archived: false, grow_id: "grow-a" },
      { is_archived: false },
    ]);
    expect(state.writes).toEqual([]);
  });

  it("allows successful-empty copy and Create tent after Retry completes with no rows", async () => {
    state.readError = true;
    state.rows = [];
    openDialog();
    await screen.findByRole("alert");
    state.readError = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("assign-tent-empty")).toHaveTextContent(
      "No tents available in this grow.",
    );
    expect(screen.getByTestId("assign-tent-create-tent-cta")).toBeInTheDocument();
    expect(state.reads).toHaveLength(3);
    expect(state.writes).toEqual([]);
  });

  it("keeps a repeated failed Retry unavailable without claiming successful emptiness", async () => {
    state.readError = true;
    openDialog();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(state.reads).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled());
    expectNoMoveOrEmptyClaim();
  });

  it("disables Retry while its existing query is in flight and never starts a duplicate read", async () => {
    const client = openDialog();
    await screen.findByTestId("assign-tent-select");
    state.readError = true;
    await act(() => client.refetchQueries({ queryKey: queryPrefix }));
    await screen.findByRole("alert");
    let finish!: (result: ReadResult) => void;
    state.deferred = new Promise((resolve) => {
      finish = resolve;
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.reads).toHaveLength(3);
    await act(async () => finish({ data: state.rows, error: null }));
    await screen.findByTestId("assign-tent-select");
    expect(state.writes).toEqual([]);
  });

  it("keeps a first-read Retry pending and deduplicates clicks before the query notification", async () => {
    state.readError = true;
    openDialog();
    await screen.findByRole("alert");
    let finish!: (result: ReadResult) => void;
    state.deferred = new Promise((resolve) => {
      finish = resolve;
    });
    const retry = screen.getByRole("button", { name: "Retry" });
    act(() => {
      fireEvent.click(retry);
      fireEvent.click(retry);
    });
    await waitFor(() => expect(screen.getByText("Loading…")).toBeInTheDocument());
    expect(state.reads).toHaveLength(2);
    expectNoMoveOrEmptyClaim();
    await act(async () => finish({ data: state.rows, error: null }));
    await screen.findByTestId("assign-tent-select");
  });

  it("keeps a pending first read in Loading rather than empty or selectable", async () => {
    let finish!: (result: ReadResult) => void;
    state.deferred = new Promise((resolve) => {
      finish = resolve;
    });
    openDialog();
    await waitFor(() => expect(state.reads).toHaveLength(1));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expectNoMoveOrEmptyClaim();
    await act(async () => finish({ data: state.rows, error: null }));
    await screen.findByTestId("assign-tent-select");
  });

  it("preserves the successful-empty creation path", async () => {
    state.rows = [];
    openDialog();
    expect(await screen.findByTestId("assign-tent-empty")).toHaveTextContent(
      "No tents available in this grow.",
    );
    expect(screen.getByTestId("assign-tent-create-tent-cta")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state.reads).toHaveLength(2);
    expect(state.writes).toEqual([]);
  });

  it("preserves the same-grow move payload and movement diary note", async () => {
    openDialog();
    await chooseNextTent();
    fireEvent.click(screen.getByTestId("assign-tent-submit"));
    await waitFor(() => expect(state.writes).toHaveLength(2));
    expect(state.writes[0]).toEqual({ table: "plants", payload: { tent_id: "tent-next" } });
    expect(state.writes[1]).toMatchObject({
      table: "diary_entries",
      payload: {
        user_id: "fixture-owner",
        grow_id: "grow-a",
        plant_id: "plant-fixture",
        tent_id: "tent-next",
        note: "Moved plant from Veg Tent B to Veg Tent A.",
      },
    });
  });
});
