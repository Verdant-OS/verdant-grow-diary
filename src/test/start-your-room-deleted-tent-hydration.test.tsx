import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const STORED_GROW_NAME = "North tent run";
const STORED_ERROR = plainStartRoomSaveError("plant");

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: true,
  userId: "user-1",
  growsLoading: false,
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; grow_id: string; name: string }>,
  tentsLoading: false,
  tentsFetching: false,
  tentsError: false,
  refetchTents: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: testState.userId }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
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
    data: testState.tents,
    isLoading: testState.tentsLoading,
    isFetching: testState.tentsFetching,
    isError: testState.tentsError,
    refetch: testState.refetchTents,
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { ...FREE_CAPABILITIES, maxActiveGrows: 5, multiTent: true } },
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

function storePlantDraft() {
  writeBrowserSessionFormDraft("user-1", START_YOUR_ROOM_DRAFT_FORM_ID, {
    step: "plant",
    form: { growName: "", tentName: "", plantName: "Kept plant", plantStage: "veg" },
    ids: {
      growId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      tentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      plantId: null,
    },
    pendingRowIds: { grow: null, tent: null, plant: STORED_ROW_ID },
    saveError: STORED_ERROR,
  });
}

function storedDraft() {
  return JSON.parse(window.sessionStorage.getItem(draftKey("user-1"))!);
}

describe("Start your room validates the restored tent", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.grows = [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: STORED_GROW_NAME }];
    testState.tents = [];
    testState.tentsFetching = false;
    testState.tentsLoading = false;
    testState.tentsError = false;
    testState.refetchTents.mockReset();
    storePlantDraft();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it.each([
    ["deleted", []],
    [
      "in a different grow",
      [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          grow_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          name: "Other tent",
        },
      ],
    ],
  ])("returns to tent creation when the stored tent is %s", async (_, tents) => {
    testState.tents = tents;
    renderPage();
    expect(await screen.findByTestId("start-room-tent-name")).toBeInTheDocument();
    expect(storedDraft()).toMatchObject({
      step: "tent",
      form: { plantName: "Kept plant", plantStage: "veg" },
      ids: { growId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tentId: null, plantId: null },
      pendingRowIds: { plant: null },
      saveError: null,
    });
    expect(testState.insert).not.toHaveBeenCalled();
  });

  it("keeps the plant step and retry id for an existing tent in the saved grow", async () => {
    testState.tents = [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        grow_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "Saved tent",
      },
    ];
    renderPage();
    expect(await screen.findByTestId("start-room-plant-name")).toBeInTheDocument();
    expect(storedDraft()).toMatchObject({
      step: "plant",
      ids: {
        growId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        tentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        plantId: null,
      },
      pendingRowIds: { plant: STORED_ROW_ID },
      saveError: STORED_ERROR,
    });
  });

  it.each(["loading", "failed", "refreshing cached data"])(
    "preserves the stored draft while the tent read is %s",
    async (state) => {
      testState.tentsLoading = state === "loading";
      testState.tentsError = state === "failed";
      testState.tentsFetching = state === "refreshing cached data";
      if (testState.tentsFetching) {
        // Paid account with multiple grows: the cached roster predates the
        // saved tent, and the single-grow resume resolver cannot rescue it.
        testState.grows.push({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Other grow" });
      }
      const original = window.sessionStorage.getItem(draftKey("user-1"));
      const view = renderPage();
      expect(screen.queryByTestId("start-room-plant-name")).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(draftKey("user-1"))).toBe(original);
      if (testState.tentsFetching) {
        expect(screen.getByRole("status")).toHaveTextContent(
          "Checking your plan and active room limits",
        );
      }
      const completeRead = () => {
        testState.tentsLoading = false;
        testState.tentsFetching = false;
        testState.tentsError = false;
        testState.tents = [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            grow_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Saved tent",
          },
        ];
      };
      if (state === "failed") {
        testState.refetchTents.mockImplementation(async () => completeRead());
        fireEvent.click(screen.getByTestId("start-room-creation-retry"));
      } else {
        completeRead();
        view.rerender(
          <MemoryRouter>
            <StartYourRoom />
          </MemoryRouter>,
        );
      }
      expect(await screen.findByTestId("start-room-plant-name")).toBeInTheDocument();
      expect(storedDraft().pendingRowIds.plant).toBe(STORED_ROW_ID);
    },
  );
});
