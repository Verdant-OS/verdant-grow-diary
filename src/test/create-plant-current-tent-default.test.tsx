/**
 * New plant opened outside a tent starts on the setup's only tent (issue #3063,
 * QA walks FA-20261123-M1 and FA-20261125-M1). Several tents, no tent, a tent in
 * another setup, an unsettled or failed tent read, and a supplied tent keep the
 * existing behavior. A grower's own "No tent" choice is never overridden.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCreatePlantCurrentTentId } from "@/lib/createPlantCurrentTentDefaultRules";

const GROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_GROW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECOND_TENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const settled = { tentsSettled: true, tentsReadFailed: false } as const;

describe("resolveCreatePlantCurrentTentId", () => {
  it("returns the only tent in the target setup", () => {
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: GROW,
        selectableTents: [{ id: TENT, grow_id: GROW }],
      }),
    ).toBe(TENT);
  });

  it("matches the setup id without regard to letter case or padding", () => {
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: ` ${GROW.toUpperCase()} `,
        selectableTents: [{ id: TENT, grow_id: GROW }],
      }),
    ).toBe(TENT);
  });

  it("never guesses between several tents", () => {
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: GROW,
        selectableTents: [
          { id: TENT, grow_id: GROW },
          { id: SECOND_TENT, grow_id: GROW },
        ],
      }),
    ).toBeNull();
  });

  it("returns null when the setup has no tent", () => {
    expect(
      resolveCreatePlantCurrentTentId({ ...settled, targetGrowId: GROW, selectableTents: [] }),
    ).toBeNull();
  });

  it("ignores a tent from another setup", () => {
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: GROW,
        selectableTents: [{ id: TENT, grow_id: OTHER_GROW }],
      }),
    ).toBeNull();
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: GROW,
        selectableTents: [
          { id: TENT, grow_id: GROW },
          { id: SECOND_TENT, grow_id: OTHER_GROW },
        ],
      }),
    ).toBe(TENT);
  });

  it("leaves a supplied tent to the supplied-tent rules", () => {
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        suppliedTentId: SECOND_TENT,
        targetGrowId: GROW,
        selectableTents: [{ id: TENT, grow_id: GROW }],
      }),
    ).toBeNull();
  });

  it("returns null until the tent read settles, and on a failed read", () => {
    const base = { targetGrowId: GROW, selectableTents: [{ id: TENT, grow_id: GROW }] };
    expect(resolveCreatePlantCurrentTentId({ ...base, tentsSettled: false })).toBeNull();
    expect(resolveCreatePlantCurrentTentId(base)).toBeNull();
    expect(
      resolveCreatePlantCurrentTentId({ ...base, tentsSettled: true, tentsReadFailed: true }),
    ).toBeNull();
  });

  it("is null-safe on missing setup, rows and ids", () => {
    expect(resolveCreatePlantCurrentTentId({ ...settled })).toBeNull();
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: "   ",
        selectableTents: [{ id: TENT, grow_id: GROW }],
      }),
    ).toBeNull();
    expect(
      resolveCreatePlantCurrentTentId({
        ...settled,
        targetGrowId: GROW,
        selectableTents: [null, undefined, { id: 42, grow_id: GROW }, { id: "  ", grow_id: GROW }],
      }),
    ).toBeNull();
    expect(
      resolveCreatePlantCurrentTentId({ ...settled, targetGrowId: GROW, selectableTents: null }),
    ).toBeNull();
  });
});

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

const mocks = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  grows: {
    grows: [] as Array<{ id: string; name: string | null }>,
    activeGrowId: null as string | null,
    loading: false,
    error: null as unknown,
    refresh: vi.fn(async () => undefined),
  },
  tents: {
    data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
    isLoading: false,
    isFetching: false,
    isError: false,
    isFetched: true,
    refetch: vi.fn(async () => undefined),
  },
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: mocks.userId }, loading: false }),
}));
vi.mock("@/store/grows", () => ({ useGrows: () => mocks.grows }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => mocks.tents }));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));
vi.mock("@/lib/entitlements/freeTierGates", () => ({
  evaluateTentCreationGate: () => ({ allowed: true, blockedCopy: "" }),
  FREE_TIER_UPGRADE_PATH: "/pricing",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        mocks.inserts.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: payload.id,
                name: payload.name,
                user_id: payload.user_id,
                grow_id: payload.grow_id,
                tent_id: payload.tent_id ?? null,
              },
              error: null,
            }),
          }),
        };
      },
    })),
  },
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";

function renderDialog(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(wrap());
  return { ...result, rerenderDialog: () => result.rerender(wrap()) };
}

function tentSelect() {
  return screen.getByTestId("create-plant-tent-select");
}

function openTentSelect() {
  fireEvent.pointerDown(tentSelect(), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(tentSelect());
}

async function createPlant(user: ReturnType<typeof userEvent.setup>, name: string) {
  fireEvent.change(screen.getByPlaceholderText("Plant A"), { target: { value: name } });
  await user.click(screen.getByTestId("plant-create-submit"));
  await waitFor(() =>
    expect(mocks.inserts.filter((call) => call.table === "plants")).toHaveLength(1),
  );
  return mocks.inserts.find((call) => call.table === "plants")!.payload;
}

beforeEach(() => {
  mocks.grows.grows = [{ id: GROW, name: "North Room" }];
  mocks.grows.activeGrowId = GROW;
  mocks.grows.loading = false;
  mocks.grows.error = null;
  mocks.tents.data = [];
  mocks.tents.isLoading = false;
  mocks.tents.isFetching = false;
  mocks.tents.isError = false;
  mocks.tents.isFetched = true;
  mocks.inserts.length = 0;
  vi.clearAllMocks();
});

describe("New plant Tent field outside a tent", () => {
  it("starts on the setup's only tent and writes it", async () => {
    mocks.tents.data = [{ id: TENT, name: "Tent 1", grow_id: GROW }];
    const user = userEvent.setup();
    renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);

    await waitFor(() => expect(tentSelect()).toHaveTextContent("Tent 1"));
    const payload = await createPlant(user, "First Plant");
    expect(payload).toEqual(expect.objectContaining({ grow_id: GROW, tent_id: TENT }));
  });

  it("keeps No tent selectable next to the defaulted tent", async () => {
    mocks.tents.data = [{ id: TENT, name: "Tent 1", grow_id: GROW }];
    renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);

    await waitFor(() => expect(tentSelect()).toHaveTextContent("Tent 1"));
    openTentSelect();
    expect(await screen.findByRole("option", { name: "No tent" })).toBeVisible();
  });

  it("keeps No tent when the setup has several tents", async () => {
    mocks.tents.data = [
      { id: TENT, name: "Tent 1", grow_id: GROW },
      { id: SECOND_TENT, name: "Tent 2", grow_id: GROW },
    ];
    renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);

    expect(tentSelect()).toHaveTextContent("No tent");
  });

  it("keeps No tent when the only tent belongs to another setup", async () => {
    mocks.tents.data = [{ id: TENT, name: "Other Room Tent", grow_id: OTHER_GROW }];
    renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);

    expect(tentSelect()).toHaveTextContent("No tent");
  });

  it("waits for the tent read, then starts on the only tent", async () => {
    mocks.tents.data = [{ id: TENT, name: "Tent 1", grow_id: GROW }];
    mocks.tents.isLoading = true;
    mocks.tents.isFetched = false;
    const view = renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);

    expect(tentSelect()).toHaveTextContent("No tent");

    mocks.tents.isLoading = false;
    mocks.tents.isFetched = true;
    view.rerenderDialog();
    await waitFor(() => expect(tentSelect()).toHaveTextContent("Tent 1"));
  });

  it("respects the grower switching back to No tent, through a refetch", async () => {
    mocks.tents.data = [{ id: TENT, name: "Tent 1", grow_id: GROW }];
    const user = userEvent.setup();
    const view = renderDialog(<CreatePlantDialog initiallyOpen defaultGrowId={GROW} />);
    await waitFor(() => expect(tentSelect()).toHaveTextContent("Tent 1"));

    openTentSelect();
    await user.click(await screen.findByRole("option", { name: "No tent" }));
    expect(tentSelect()).toHaveTextContent("No tent");

    mocks.tents.isFetching = true;
    view.rerenderDialog();
    mocks.tents.isFetching = false;
    view.rerenderDialog();
    expect(tentSelect()).toHaveTextContent("No tent");

    const payload = await createPlant(user, "Tentless On Purpose");
    expect(payload.grow_id).toBe(GROW);
    expect(payload.tent_id ?? null).toBeNull();
  });

  it("leaves a supplied tent to the supplied-tent rules", async () => {
    mocks.tents.data = [
      { id: TENT, name: "Tent 1", grow_id: GROW },
      { id: SECOND_TENT, name: "Tent 2", grow_id: GROW },
    ];
    renderDialog(
      <CreatePlantDialog initiallyOpen defaultGrowId={GROW} defaultTentId={SECOND_TENT} />,
    );

    await waitFor(() => expect(tentSelect()).toHaveTextContent("Tent 2"));
  });
});
