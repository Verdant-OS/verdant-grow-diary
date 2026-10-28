import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const ATTEMPT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: true,
  grows: [] as Array<{ id: string; name: string }>,
  capabilities: null as unknown,
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
    entitlement: { capabilities: testState.capabilities ?? FREE_CAPABILITIES },
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
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";

const PENDING_GROW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function renderPage() {
  return render(
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>,
  );
}

describe("Start your room save reason and pending-grow adoption (#2541 P2s)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.failSaves = true;
    testState.grows = [];
    testState.capabilities = null;
    vi.stubGlobal("crypto", { randomUUID: () => ATTEMPT_ID });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps the server reason when a save is definitively rejected", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByTestId("start-room-grow-name"), "North tent run");
    await user.type(screen.getByTestId("start-room-plant-name"), "North plant");
    await user.click(screen.getByTestId("start-room-submit"));
    const error = await screen.findByTestId("start-your-room-error");
    expect(error).toHaveTextContent("Verdant could not save this grow");
    expect(error).toHaveTextContent("Reason: relation exploded");
    expect(screen.getByTestId("start-room-save-retry")).toBeInTheDocument();
  });

  it("offers no Retry for an error that never attempted a save", async () => {
    // Every error is persisted to the draft, so a validation message can come back.
    writeBrowserSessionFormDraft("user-1", START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "grow",
      form: { growName: "", tentName: "", plantName: "", plantStage: "" },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: null, tent: null, plant: null },
      saveError: "Enter a grow name to continue.",
    });
    renderPage();
    expect(await screen.findByTestId("start-your-room-error")).toHaveTextContent(
      "Enter a grow name to continue.",
    );
    expect(screen.queryByTestId("start-room-save-retry")).toBeNull();
    expect(screen.getByTestId("start-your-room-error-block")).not.toHaveTextContent(
      "Retry saves this same step once",
    );
  });

  it("adopts an already-saved pending grow after a reload instead of retrying it", async () => {
    // Paid plan, so the Free single-grow resume path does not apply.
    testState.capabilities = { ...FREE_CAPABILITIES, maxActiveGrows: 5, multiTent: true };
    testState.grows = [{ id: PENDING_GROW_ID, name: "North tent run" }];
    writeBrowserSessionFormDraft("user-1", START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "grow",
      form: { growName: "North tent run", tentName: "", plantName: "", plantStage: "" },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: PENDING_GROW_ID, tent: null, plant: null },
      saveError: null,
    });
    renderPage();
    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent("North tent run");
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    expect(testState.insert).not.toHaveBeenCalled();
  });
});
