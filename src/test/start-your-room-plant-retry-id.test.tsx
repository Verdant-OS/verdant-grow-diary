import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";

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

describe("Start Your Room plant retry id (Codex review)", () => {
  it("keeps the plant's retry id in the draft until the finished plant is recorded", async () => {
    // The refresh after the plant insert hangs, as if the grower reloads
    // while Quick Log's selectors are still refreshing.
    let releaseRefresh: () => void = () => undefined;
    refreshMock
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(
        () => new Promise<undefined>((resolve) => (releaseRefresh = () => resolve(undefined))),
      );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start-room"]}>
        <StartYourRoom />
      </MemoryRouter>,
    );

    await user.type(await screen.findByTestId("start-room-grow-name"), "E2E Grow");
    await user.click(screen.getByTestId("start-room-grow-submit"));
    await user.type(await screen.findByTestId("start-room-tent-name"), "E2E Tent");
    await user.click(screen.getByTestId("start-room-tent-submit"));
    await user.type(await screen.findByTestId("start-room-plant-name"), "E2E Plant");
    await user.click(screen.getByTestId("start-room-plant-submit"));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(2));
    const stored = JSON.parse(window.sessionStorage.getItem(draftKey) ?? "null");
    expect(JSON.stringify(stored)).toContain(`"plant":"${ATTEMPT_IDS.plant}"`);
    expect(JSON.stringify(stored)).toContain('"step":"plant"');

    releaseRefresh();
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
  });
});
