import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";
import {
  clearHierarchyCreateOutcomeRecoveryAttempt,
  getHierarchyCreateOutcomeRecoveryAttempts,
} from "@/lib/hierarchyCreateOutcomeRecovery";

const OWNER_A = "44444444-4444-4444-8444-444444444444";
const OWNER_B = "99999999-9999-4999-8999-999999999999";
const IDS = {
  grow: "11111111-1111-4111-8111-111111111111",
  tent: "22222222-2222-4222-8222-222222222222",
  plant: "33333333-3333-4333-8333-333333333333",
};

const state = vi.hoisted(() => ({
  ownerId: "44444444-4444-4444-8444-444444444444",
  grows: [] as Array<{ id: string; name: string }>,
  tents: [] as Array<{ id: string; name: string; grow_id: string }>,
  failTent: false,
  plantResponseGate: null as Promise<void> | null,
  growResponseGate: null as Promise<void> | null,
  loseGrowResponse: false,
  insert: vi.fn(),
  refresh: vi.fn<() => Promise<void>>(),
  invalidate: vi.fn<(filters: { queryKey: string[] }) => Promise<void>>(),
  nav: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => state.nav };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: state.ownerId }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: state.grows,
    loading: false,
    error: null,
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
    refresh: state.refresh,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: state.tents, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: {
      capabilities: { ...FREE_CAPABILITIES, maxActiveGrows: 5, multiTent: true },
    },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        state.insert(table, payload);
        return {
          select: () => ({
            single: async () => {
              if (table === "plants") await state.plantResponseGate;
              if (table === "grows") {
                await state.growResponseGate;
                if (state.loseGrowResponse) throw new TypeError("Failed to fetch after commit");
              }
              return table === "tents" && state.failTent
                ? { data: null, error: { code: "P0001", message: "A tent rejected" } }
                : { data: { ...payload }, error: null };
            },
          }),
        };
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: state.toastError },
}));

import StartYourRoom from "@/pages/StartYourRoom";

function draftKey(ownerId: string) {
  return `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${ownerId}.${START_YOUR_ROOM_DRAFT_FORM_ID}`;
}

function page() {
  return (
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  state.ownerId = OWNER_A;
  state.grows = [];
  state.tents = [];
  state.failTent = false;
  state.plantResponseGate = null;
  state.growResponseGate = null;
  state.loseGrowResponse = false;
  for (const owner of [OWNER_A, OWNER_B]) {
    for (const record of getHierarchyCreateOutcomeRecoveryAttempts(owner)) {
      clearHierarchyCreateOutcomeRecoveryAttempt(record.attempt);
    }
  }
  state.insert.mockReset();
  state.refresh.mockReset().mockResolvedValue(undefined);
  state.invalidate.mockReset().mockResolvedValue(undefined);
  state.nav.mockReset();
  state.toastError.mockReset();
  state.toastSuccess.mockReset();
  let nextId = 0;
  const order = [IDS.grow, IDS.tent, IDS.plant];
  vi.stubGlobal("crypto", { randomUUID: () => order[nextId++] ?? IDS.plant });
});

afterEach(() => {
  cleanup();
  for (const owner of [OWNER_A, OWNER_B]) {
    for (const record of getHierarchyCreateOutcomeRecoveryAttempts(owner)) {
      clearHierarchyCreateOutcomeRecoveryAttempt(record.attempt);
    }
  }
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Start Your Room refresh continuations", () => {
  it("starts no old-owner tent after a refresh rejects following an account switch", async () => {
    let rejectRefresh: (error: Error) => void = () => undefined;
    state.refresh.mockImplementationOnce(
      () => new Promise<void>((_, reject) => (rejectRefresh = reject)),
    );
    state.failTent = true;
    writeBrowserSessionFormDraft(OWNER_B, START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "grow",
      form: {
        growName: "B room",
        tentName: "B tent",
        plantName: "B unsaved plant",
        plantStage: "veg",
      },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: {
        grow: "55555555-5555-4555-8555-555555555555",
        tent: null,
        plant: null,
      },
      saveError: null,
    });
    const user = userEvent.setup();
    const view = render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1));

    state.ownerId = OWNER_B;
    view.rerender(page());
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("B unsaved plant");
    const bDraft = window.sessionStorage.getItem(draftKey(OWNER_B));
    await act(async () => rejectRefresh(new Error("A refresh failed")));

    expect(state.insert.mock.calls.map(([table]) => table)).toEqual(["grows"]);
    expect(window.sessionStorage.getItem(draftKey(OWNER_B))).toBe(bDraft);
    expect(screen.queryByTestId("start-your-room-error")).not.toBeInTheDocument();
    expect(state.toastError).not.toHaveBeenCalled();
    expect(state.nav).not.toHaveBeenCalled();
  });

  it("continues the same owner's confirmed grow after a rejected refresh", async () => {
    state.refresh.mockRejectedValueOnce(new Error("Roster unavailable"));
    const user = userEvent.setup();
    render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.nav).toHaveBeenCalledTimes(1));
    expect(state.insert.mock.calls.map(([table]) => table)).toEqual(["grows", "tents", "plants"]);
    expect(state.nav).toHaveBeenCalledWith(`/plants/${IDS.plant}?open=quick-log`, {
      replace: true,
    });
  });

  it("retains the owner's unknown-outcome fence after a newer instance takes over", async () => {
    let finishGrow: () => void = () => undefined;
    state.growResponseGate = new Promise<void>((resolve) => (finishGrow = resolve));
    state.loseGrowResponse = true;
    const user = userEvent.setup();
    const oldPage = render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "Old plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
    oldPage.unmount();
    render(page());
    const input = await screen.findByTestId("start-room-plant-name");
    await user.clear(input);
    await user.type(input, "New typing");
    const newerDraft = window.sessionStorage.getItem(draftKey(OWNER_A));
    await act(async () => finishGrow());
    expect(
      getHierarchyCreateOutcomeRecoveryAttempts(OWNER_A).map((record) => record.attempt),
    ).toContainEqual({
      entity: "grow",
      rowId: IDS.grow,
      ownerId: OWNER_A,
    });
    expect(window.sessionStorage.getItem(draftKey(OWNER_A))).toBe(newerDraft);
    expect(screen.queryByTestId("start-your-room-error")).not.toBeInTheDocument();
    expect(state.nav).not.toHaveBeenCalled();
  });

  it("ignores an old submission after the same mounted page switches away and back", async () => {
    let finishRefresh: () => void = () => undefined;
    const refresh = new Promise<void>((resolve) => (finishRefresh = resolve));
    state.invalidate.mockImplementation(({ queryKey }) =>
      queryKey[0] === "plants" ? refresh : Promise.resolve(),
    );
    const user = userEvent.setup();
    const view = render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "Old A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["plants"] }));
    state.ownerId = OWNER_B;
    view.rerender(page());
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("");

    state.ownerId = OWNER_A;
    state.grows = [
      { id: IDS.grow, name: "My grow" },
      { id: "66666666-6666-4666-8666-666666666666", name: "Other grow" },
    ];
    state.tents = [{ id: IDS.tent, grow_id: IDS.grow, name: "Tent 1" }];
    view.rerender(page());
    const input = await screen.findByTestId("start-room-plant-name");
    await user.clear(input);
    await user.type(input, "New A typing");
    const newerDraft = window.sessionStorage.getItem(draftKey(OWNER_A));
    expect(newerDraft).toContain("New A typing");
    await act(async () => finishRefresh());
    expect(window.sessionStorage.getItem(draftKey(OWNER_A))).toBe(newerDraft);
    expect(state.nav).not.toHaveBeenCalled();
  });

  it("keeps the reopened writer's same-content retry fence when the old instance finishes", async () => {
    let finishRefresh: () => void = () => undefined;
    const refresh = new Promise<void>((resolve) => (finishRefresh = resolve));
    state.invalidate.mockImplementation(({ queryKey }) =>
      queryKey[0] === "plants" ? refresh : Promise.resolve(),
    );
    const user = userEvent.setup();
    const oldPage = render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["plants"] }));
    const oldDraft = window.sessionStorage.getItem(draftKey(OWNER_A));
    oldPage.unmount();

    state.grows = [
      { id: IDS.grow, name: "My grow" },
      { id: "66666666-6666-4666-8666-666666666666", name: "Other grow" },
    ];
    state.tents = [{ id: IDS.tent, grow_id: IDS.grow, name: "Tent 1" }];
    let finishRetry: () => void = () => undefined;
    state.plantResponseGate = new Promise<void>((resolve) => (finishRetry = resolve));
    render(page());
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() =>
      expect(state.insert.mock.calls.filter(([table]) => table === "plants")).toHaveLength(2),
    );
    const reopenedDraft = window.sessionStorage.getItem(draftKey(OWNER_A));
    expect(reopenedDraft).toBe(oldDraft);
    try {
      await act(async () => finishRefresh());
      expect(window.sessionStorage.getItem(draftKey(OWNER_A))).toBe(reopenedDraft);
      expect(JSON.parse(reopenedDraft!).pendingRowIds.plant).toBe(IDS.plant);
    } finally {
      await act(async () => finishRetry());
    }
  });

  it("keeps a newer reopened draft when an unmounted submission finishes refreshing", async () => {
    let finishRefresh: () => void = () => undefined;
    const refresh = new Promise<void>((resolve) => (finishRefresh = resolve));
    state.invalidate.mockImplementation(({ queryKey }) =>
      queryKey[0] === "plants" ? refresh : Promise.resolve(),
    );
    const user = userEvent.setup();
    const oldPage = render(page());
    await user.type(await screen.findByTestId("start-room-plant-name"), "A plant");
    await user.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["plants"] }));
    oldPage.unmount();

    state.grows = [
      { id: IDS.grow, name: "My grow" },
      { id: "66666666-6666-4666-8666-666666666666", name: "Other grow" },
    ];
    state.tents = [{ id: IDS.tent, grow_id: IDS.grow, name: "Tent 1" }];
    const reopened = render(page());
    const input = await screen.findByTestId("start-room-plant-name");
    await user.clear(input);
    await user.type(input, "Newer typed plant");
    const newerDraft = window.sessionStorage.getItem(draftKey(OWNER_A));
    expect(newerDraft).toContain("Newer typed plant");

    await act(async () => finishRefresh());
    expect(window.sessionStorage.getItem(draftKey(OWNER_A))).toBe(newerDraft);
    expect(state.nav).not.toHaveBeenCalled();
    reopened.unmount();
    render(page());
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("Newer typed plant");
  });
});
