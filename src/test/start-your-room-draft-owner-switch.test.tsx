import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";
import {
  START_YOUR_ROOM_DRAFT_FORM_ID,
  plainStartRoomSaveError,
} from "@/lib/startYourRoomDraftRules";

const STORED_ROW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MINTED_ROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STORED_ERROR = plainStartRoomSaveError("grow");
const TENT_ERROR = plainStartRoomSaveError("tent");

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: false,
  userId: "user-1",
  holdInsert: false,
  releaseInsert: null as null | (() => void),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: testState.userId }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [],
    loading: false,
    error: null,
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [],
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
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        testState.insert(table, payload);
        return {
          select: () => ({
            single: async () => {
              if (testState.holdInsert) {
                await new Promise<void>((resolve) => {
                  testState.releaseInsert = resolve;
                });
              }
              return testState.failSaves
                ? { data: null, error: { code: "P0001", message: "relation exploded" } }
                : {
                    data: {
                      id: payload.id,
                      name: payload.name,
                      user_id: payload.user_id,
                      grow_id: payload.grow_id,
                      tent_id: payload.tent_id,
                    },
                    error: null,
                  };
            },
          }),
        };
      },
    }),
  },
}));

import StartYourRoom from "@/pages/StartYourRoom";

function draftKey(userId: string) {
  return `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${userId}.${START_YOUR_ROOM_DRAFT_FORM_ID}`;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>,
  );
}

describe("Start your room owner changes", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.failSaves = false;
    testState.userId = "user-1";
    testState.holdInsert = false;
    testState.releaseInsert = null;
    vi.stubGlobal("crypto", { randomUUID: () => MINTED_ROW_ID });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps account B's stored draft when account A's save finishes after the switch", async () => {
    const user = userEvent.setup();
    writeBrowserSessionFormDraft("user-2", START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "grow",
      form: {
        growName: "B room",
        tentName: "",
        plantName: "",
        plantStage: "seedling",
      },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: STORED_ROW_ID, tent: null, plant: null },
      saveError: STORED_ERROR,
    });
    testState.holdInsert = true;
    const view = renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "A room");
    await user.type(screen.getByTestId("start-room-plant-name"), "A plant");
    fireEvent.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(testState.insert).toHaveBeenCalledTimes(1));

    testState.userId = "user-2";
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("start-room-grow-name")).toHaveValue("B room");
    expect(screen.getByTestId("start-your-room-error")).toHaveTextContent(STORED_ERROR);

    await act(async () => {
      testState.releaseInsert?.();
    });

    expect(screen.getByTestId("start-room-grow-name")).toHaveValue("B room");
    expect(screen.queryByTestId("start-room-bound-grow")).not.toBeInTheDocument();
    expect(testState.insert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("start-your-room-error")).toHaveTextContent(STORED_ERROR);
    const stored = window.sessionStorage.getItem(draftKey("user-2"));
    expect(stored).toContain("B room");
    expect(stored).toContain(STORED_ROW_ID);
    expect(stored).not.toContain("A room");
    expect(stored).not.toContain(MINTED_ROW_ID);
  });

  it("drops a tent save error when that grow is gone and the room falls back to creating a grow", async () => {
    writeBrowserSessionFormDraft("user-1", START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "tent",
      form: {
        growName: "",
        tentName: "Side tent",
        plantName: "",
        plantStage: "seedling",
      },
      ids: {
        growId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        tentId: null,
        plantId: null,
      },
      pendingRowIds: { grow: null, tent: STORED_ROW_ID, plant: null },
      saveError: TENT_ERROR,
    });
    renderPage();
    expect(await screen.findByTestId("start-room-grow-name")).toHaveValue("");
    expect(screen.queryByTestId("start-room-bound-grow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-your-room-error")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(draftKey("user-1"))).not.toContain(TENT_ERROR);
  });
});
