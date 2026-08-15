import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const {
  navMock,
  fromMock,
  refreshMock,
  invalidateQueriesMock,
  setActiveGrowIdMock,
  entitlementState,
} = vi.hoisted(() => ({
  navMock: vi.fn(),
  fromMock: vi.fn(),
  refreshMock: vi.fn(async () => undefined),
  invalidateQueriesMock: vi.fn(async () => undefined),
  setActiveGrowIdMock: vi.fn(),
  entitlementState: { capabilities: null as unknown },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => navMock };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    loading: false,
    error: null,
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: setActiveGrowIdMock,
    refresh: refreshMock,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: entitlementState.capabilities },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

import StartYourRoom from "@/pages/StartYourRoom";

const INSERT_RESULTS = {
  grows: { data: { id: "grow-1", name: "E2E Grow" }, error: null },
  tents: { data: { id: "tent-1", name: "E2E Tent" }, error: null },
  plants: {
    data: {
      id: "plant / 1",
      name: "E2E Plant",
      grow_id: "grow-1",
      tent_id: "tent-1",
    },
    error: null,
  },
} as const;

beforeEach(() => {
  navMock.mockClear();
  fromMock.mockReset();
  refreshMock.mockClear();
  invalidateQueriesMock.mockClear();
  setActiveGrowIdMock.mockClear();
  entitlementState.capabilities = FREE_CAPABILITIES;
  clearLocalStorageForTest();

  fromMock.mockImplementation((table: keyof typeof INSERT_RESULTS) => ({
    insert: () => ({
      select: () => ({
        single: async () => INSERT_RESULTS[table],
      }),
    }),
  }));
});

describe("Start Your Room Quick Log handoff", () => {
  it("finishes the wizard on encoded Plant Detail with the global one-shot Quick Log intent", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-grow-name"), "E2E Grow");
    await user.click(screen.getByTestId("start-room-grow-submit"));
    expect(await screen.findByTestId("start-your-room-step-tent")).toBeInTheDocument();

    await user.type(screen.getByTestId("start-room-tent-name"), "E2E Tent");
    await user.click(screen.getByTestId("start-room-tent-submit"));
    expect(await screen.findByTestId("start-your-room-step-plant")).toBeInTheDocument();

    await user.type(screen.getByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-plant-submit"));
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["tents"] });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["plants"] });
    expect(refreshMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByTestId("start-room-finish"));

    expect(navMock).toHaveBeenCalledTimes(1);
    expect(navMock).toHaveBeenCalledWith("/plants/plant%20%2F%201?open=quick-log", {
      replace: true,
    });
  });
});
