/**
 * QA pass 2026-11-19, B1 and B3 on Start your room:
 * - B1: the submit leaves a one-shot marker so the first Quick Log close lands
 *   on the dashboard (AppShell side: onboarding-dashboard-handoff.test.tsx).
 * - B3: the grow and tent names Verdant will create are visible without
 *   opening the optional names group.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { START_ROOM_DASHBOARD_HANDOFF_KEY } from "@/lib/startRoomDashboardHandoff";
import {
  startRoomPendingNamesLine,
  type StartYourRoomForm,
  type StartYourRoomIds,
} from "@/lib/startYourRoomRules";

const ATTEMPT_IDS = {
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
} as const;

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

beforeEach(() => {
  navMock.mockClear();
  fromMock.mockReset();
  refreshMock.mockClear();
  invalidateQueriesMock.mockClear();
  setActiveGrowIdMock.mockClear();
  entitlementState.capabilities = FREE_CAPABILITIES;
  clearLocalStorageForTest();
  vi.stubGlobal("crypto", {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce(ATTEMPT_IDS.grow)
      .mockReturnValueOnce(ATTEMPT_IDS.tent)
      .mockReturnValueOnce(ATTEMPT_IDS.plant),
  });

  fromMock.mockImplementation((table: "grows" | "tents" | "plants") => ({
    insert: (payload: Record<string, unknown>) => ({
      select: () => ({
        single: async () => ({
          data: {
            id: payload.id,
            name: payload.name,
            user_id: payload.user_id,
            ...(table === "grows" ? {} : { grow_id: payload.grow_id }),
            ...(table === "plants" ? { tent_id: payload.tent_id } : {}),
          },
          error: null,
        }),
      }),
    }),
  }));
});

describe("Start your room names what it creates (B3)", () => {
  const NO_IDS: StartYourRoomIds = { growId: null, tentId: null, plantId: null };
  const BLANK: StartYourRoomForm = {
    growName: "",
    tentName: "",
    plantName: "",
    plantStage: "seedling",
  };

  it("names the default grow and tent when the grower types nothing", () => {
    expect(startRoomPendingNamesLine(BLANK, NO_IDS)).toBe(
      "Creates grow “My grow” and tent “Tent 1”.",
    );
  });

  it("uses typed names, trimmed, and leaves out items that already exist", () => {
    const typed: StartYourRoomForm = { ...BLANK, growName: "  Winter run ", tentName: "Closet" };
    expect(startRoomPendingNamesLine(typed, NO_IDS)).toBe(
      "Creates grow “Winter run” and tent “Closet”.",
    );
    expect(startRoomPendingNamesLine(typed, { ...NO_IDS, growId: "g" })).toBe(
      "Creates tent “Closet”.",
    );
    expect(startRoomPendingNamesLine(BLANK, { ...NO_IDS, tentId: "t" })).toBe(
      "Creates grow “My grow”.",
    );
    const bothSaved: StartYourRoomIds = { growId: "g", tentId: "t", plantId: null };
    expect(startRoomPendingNamesLine(typed, bothSaved)).toBeNull();
  });

  it("shows the default names on the page before the names group is opened", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    const line = screen.getByTestId("start-room-pending-names");
    expect(line).toBeVisible();
    expect(line).toHaveTextContent("Creates grow “My grow” and tent “Tent 1”.");

    await user.type(screen.getByTestId("start-room-tent-name"), "Closet");
    expect(line).toHaveTextContent("Creates grow “My grow” and tent “Closet”.");
  });
});

describe("Start your room dashboard hand-off (B1)", () => {
  it("leaves a one-shot marker for the new plant before opening its Quick Log", async () => {
    window.sessionStorage.clear();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(screen.getByTestId("start-room-plant-name"), "First plant");
    expect(window.sessionStorage.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBeNull();
    await user.click(screen.getByTestId("start-room-submit"));
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();

    expect(window.sessionStorage.getItem(START_ROOM_DASHBOARD_HANDOFF_KEY)).toBe(
      ATTEMPT_IDS.plant,
    );
    expect(navMock).toHaveBeenCalledTimes(1);
    expect(navMock).toHaveBeenCalledWith(`/plants/${ATTEMPT_IDS.plant}?open=quick-log`, {
      replace: true,
    });
    window.sessionStorage.clear();
  });
});
