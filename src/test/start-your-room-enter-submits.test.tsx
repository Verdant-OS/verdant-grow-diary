import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const ATTEMPT_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const testState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id?: string }>,
  capabilities: null as unknown,
  insert: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
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
    entitlement: { capabilities: testState.capabilities },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        testState.insert(table, payload);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: payload.id,
                name: payload.name,
                user_id: payload.user_id,
                grow_id: payload.grow_id,
                tent_id: payload.tent_id,
              },
              error: null,
            }),
          }),
        };
      },
    }),
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

describe("Start your room Enter submits", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.grows = [];
    testState.tents = [];
    testState.capabilities = FREE_CAPABILITIES;
    testState.insert.mockReset();
    let n = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => ATTEMPT_IDS[n++] ?? ATTEMPT_IDS[2],
    });
  });

  it("submits the whole room once on Enter when allowed, and not when the Free gate blocks it", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "Enter Grow");
    await user.type(screen.getByTestId("start-room-plant-name"), "Enter Plant");
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(testState.insert.mock.calls.map(([table]) => table)).toEqual([
      "grows",
      "tents",
      "plants",
    ]);
    expect(testState.insert).toHaveBeenCalledWith(
      "grows",
      expect.objectContaining({ name: "Enter Grow" }),
    );

    view.unmount();
    testState.grows = [{ id: "grow-existing", name: "Existing" }];
    testState.insert.mockClear();
    renderPage();
    expect(await screen.findByTestId("start-your-room-step-room")).toBeInTheDocument();
    expect(screen.getByTestId("start-room-bound-grow")).toHaveTextContent("Existing");
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    await user.type(screen.getByTestId("start-room-tent-name"), "Bound Tent");
    await user.type(screen.getByTestId("start-room-plant-name"), "Bound Plant");
    await user.keyboard("{Enter}");
    expect(testState.insert).not.toHaveBeenCalledWith("grows", expect.anything());
    expect(testState.insert).toHaveBeenCalledWith(
      "tents",
      expect.objectContaining({ name: "Bound Tent", grow_id: "grow-existing" }),
    );
  });

  it("does not insert on Enter when the tent gate blocks the room", async () => {
    const user = userEvent.setup();
    testState.tents = [{ id: "tent-existing", name: "Existing tent" }];
    renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "Needs a tent");
    await user.type(screen.getByTestId("start-room-plant-name"), "Blocked Plant");
    await user.keyboard("{Enter}");
    expect(testState.insert).not.toHaveBeenCalled();
    expect(screen.getByTestId("start-room-submit")).toBeDisabled();
  });

  it("does not submit on Enter while the plant name is empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "Grow");
    await user.keyboard("{Enter}");
    expect(testState.insert).not.toHaveBeenCalled();
    expect(screen.getByTestId("start-room-submit")).toBeDisabled();

    await user.type(screen.getByTestId("start-room-plant-name"), "Enter Plant");
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(testState.insert).toHaveBeenCalledTimes(3);
    expect(testState.insert).toHaveBeenCalledWith(
      "plants",
      expect.objectContaining({ name: "Enter Plant" }),
    );
  });
});
