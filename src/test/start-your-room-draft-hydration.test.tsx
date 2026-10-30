import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const STORED_GROW_NAME = "North tent run";
const STORED_ERROR = plainStartRoomSaveError("grow");

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: true,
  userId: "user-1",
  growsLoading: false,
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
    loading: testState.growsLoading,
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
            single: async () =>
              testState.failSaves
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

describe("Start your room draft hydration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.failSaves = true;
    testState.userId = "user-1";
    testState.growsLoading = false;
    vi.stubGlobal("crypto", { randomUUID: () => MINTED_ROW_ID });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps the stored draft, error, and row id when grows are still loading on reload", async () => {
    writeBrowserSessionFormDraft("user-1", START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "grow",
      form: {
        growName: STORED_GROW_NAME,
        tentName: "",
        plantName: "Stored plant",
        plantStage: "seedling",
      },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: STORED_ROW_ID, tent: null, plant: null },
      saveError: STORED_ERROR,
    });
    testState.growsLoading = true;
    const view = renderPage();

    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    const whileLoading = window.sessionStorage.getItem(draftKey("user-1"));
    expect(whileLoading).toContain(STORED_GROW_NAME);
    expect(whileLoading).toContain(STORED_ROW_ID);
    expect(whileLoading).toContain(STORED_ERROR);

    testState.growsLoading = false;
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("start-room-grow-name")).toHaveValue(STORED_GROW_NAME);
    expect(screen.getByTestId("start-room-plant-name")).toHaveValue("Stored plant");
    expect(screen.getByTestId("start-your-room-error")).toHaveTextContent(STORED_ERROR);
    const afterResolve = window.sessionStorage.getItem(draftKey("user-1"));
    expect(afterResolve).toContain(STORED_GROW_NAME);
    expect(afterResolve).toContain(STORED_ROW_ID);
    expect(afterResolve).not.toContain(MINTED_ROW_ID);

    testState.failSaves = false;
    fireEvent.click(screen.getByTestId("start-room-save-retry"));
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    expect(testState.insert.mock.calls.map(([table]) => table)).toEqual([
      "grows",
      "tents",
      "plants",
    ]);
    expect(testState.insert.mock.calls[0]?.[1].id).toBe(STORED_ROW_ID);
  });

  it("clears the previous account's form when the next account has no draft", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "Secret room");
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain("Secret room");

    testState.userId = "user-2";
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("start-room-grow-name")).toHaveValue("");
    expect(screen.queryByTestId("start-your-room-error")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain("Secret room");
    expect(window.sessionStorage.getItem(draftKey("user-2")) ?? "").not.toContain("Secret room");
  });
});
