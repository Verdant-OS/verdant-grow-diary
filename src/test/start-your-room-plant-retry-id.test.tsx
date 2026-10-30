import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";
import { getStartScreenChoice, setStartScreenChoice } from "@/lib/startScreenPreferences";

const { OWNER_ID } = vi.hoisted(() => ({ OWNER_ID: "44444444-4444-4444-8444-444444444444" }));

const ATTEMPT_IDS = {
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
} as const;

const draftKey = `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${OWNER_ID}.${START_YOUR_ROOM_DRAFT_FORM_ID}`;

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
  useAuth: () => ({ user: { id: OWNER_ID }, loading: false }),
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
  window.sessionStorage.clear();
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Start Your Room plant retry id (Codex review)", () => {
  it("keeps the plant's retry id in the draft until the finished plant is recorded", async () => {
    // The refresh after the plant insert hangs, as if the grower reloads
    // while Quick Log's selectors are still refreshing.
    let plantInserted = false;
    let refreshHanging = false;
    let releaseRefresh: () => void = () => undefined;
    const insertRow = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: "grows" | "tents" | "plants") => {
      const query = insertRow(table);
      if (table !== "plants") return query;
      return {
        ...query,
        insert: (payload: Record<string, unknown>) => {
          plantInserted = true;
          return query.insert(payload);
        },
      };
    });
    refreshMock.mockImplementation(async () => {
      if (!plantInserted) return undefined;
      refreshHanging = true;
      await new Promise<void>((resolve) => (releaseRefresh = resolve));
      return undefined;
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-submit"));

    await waitFor(() => expect(refreshHanging).toBe(true));
    await act(async () => undefined);
    expect(JSON.parse(window.sessionStorage.getItem(draftKey)!)).toMatchObject({
      step: "plant",
      pendingRowIds: { plant: ATTEMPT_IDS.plant },
    });

    releaseRefresh();
    await waitFor(() => expect(navMock).toHaveBeenCalledTimes(1));
    expect(navMock).toHaveBeenCalledWith(`/plants/${ATTEMPT_IDS.plant}?open=quick-log`, {
      replace: true,
    });
  });

  it("clears the setup draft before leaving for the new plant (Copilot review)", async () => {
    // Real routing unmounts the page with the navigation, so the "done" effect
    // never runs; the draft must already be gone when navigation starts.
    refreshMock.mockImplementation(async () => undefined);
    let draftAtNavigation: string | null = "not navigated";
    navMock.mockImplementation(() => {
      draftAtNavigation = window.sessionStorage.getItem(draftKey);
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-submit"));

    await waitFor(() => expect(navMock).toHaveBeenCalledTimes(1));
    expect(draftAtNavigation).toBeNull();
    // The page stays mounted under the mocked router; the draft must stay gone.
    await act(async () => undefined);
    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
  });

  it("does not pull a grower back to the plant after they left mid-save (Copilot review)", async () => {
    let plantInserted = false;
    let releaseRefresh: () => void = () => undefined;
    const insertRow = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: "grows" | "tents" | "plants") => {
      const query = insertRow(table);
      if (table !== "plants") return query;
      return {
        ...query,
        insert: (payload: Record<string, unknown>) => {
          plantInserted = true;
          return query.insert(payload);
        },
      };
    });
    let refreshHanging = false;
    refreshMock.mockImplementation(async () => {
      if (!plantInserted) return undefined;
      refreshHanging = true;
      await new Promise<void>((resolve) => (releaseRefresh = resolve));
      return undefined;
    });
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );
    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(refreshHanging).toBe(true));

    view.unmount();
    // The grower chose another start screen on the way out.
    setStartScreenChoice(OWNER_ID, "timeline");
    await act(async () => {
      releaseRefresh();
    });
    expect(navMock).not.toHaveBeenCalled();
    // Their choice survives the save finishing behind them.
    expect(getStartScreenChoice(OWNER_ID)).toBe("timeline");
    // The room was finished, so its draft is still cleared.
    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
  });

  it("starts no tent or plant after the grower left during the grow refresh (Codex review)", async () => {
    const inserted: string[] = [];
    const insertRow = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: "grows" | "tents" | "plants") => {
      const query = insertRow(table);
      return {
        ...query,
        insert: (payload: Record<string, unknown>) => {
          inserted.push(table);
          return query.insert(payload);
        },
      };
    });
    let releaseRefresh: () => void = () => undefined;
    let refreshHanging = false;
    refreshMock.mockImplementation(async () => {
      refreshHanging = true;
      await new Promise<void>((resolve) => (releaseRefresh = resolve));
      return undefined;
    });
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );
    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(refreshHanging).toBe(true));
    expect(inserted).toEqual(["grows"]);

    view.unmount();
    await act(async () => {
      releaseRefresh();
    });
    // The reopened page owns the rest; this instance adds nothing.
    expect(inserted).toEqual(["grows"]);
    expect(navMock).not.toHaveBeenCalled();
  });

  it("starts no plant after the grower left during the tent save (review nit)", async () => {
    refreshMock.mockImplementation(async () => undefined);
    const inserted: string[] = [];
    let releaseTent: () => void = () => undefined;
    let tentHanging = false;
    const insertRow = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: "grows" | "tents" | "plants") => {
      const query = insertRow(table);
      return {
        ...query,
        insert: (payload: Record<string, unknown>) => {
          inserted.push(table);
          const chain = query.insert(payload);
          if (table !== "tents") return chain;
          return {
            select: () => ({
              single: async () => {
                tentHanging = true;
                await new Promise<void>((resolve) => (releaseTent = resolve));
                return chain.select().single();
              },
            }),
          };
        },
      };
    });
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );
    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(tentHanging).toBe(true));
    expect(inserted).toEqual(["grows", "tents"]);

    view.unmount();
    await act(async () => {
      releaseTent();
    });
    expect(inserted).toEqual(["grows", "tents"]);
    expect(navMock).not.toHaveBeenCalled();
  });
});
