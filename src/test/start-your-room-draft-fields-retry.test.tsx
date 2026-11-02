import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";

const FAILED_ROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MINTED_AFTER_RELOAD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: true,
  userId: "user-1",
  nextRowId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

function fillEveryField() {
  fireEvent.change(screen.getByTestId("start-room-plant-name"), {
    target: { value: "North plant" },
  });
  fireEvent.change(screen.getByTestId("start-room-plant-stage"), {
    target: { value: "flower" },
  });
  fireEvent.change(screen.getByTestId("start-room-grow-name"), {
    target: { value: "North tent run" },
  });
  fireEvent.change(screen.getByTestId("start-room-tent-name"), {
    target: { value: "North tent" },
  });
}

function expectEveryField() {
  expect(screen.getByTestId("start-room-plant-name")).toHaveValue("North plant");
  expect(screen.getByTestId("start-room-plant-stage")).toHaveValue("flower");
  expect(screen.getByTestId("start-room-grow-name")).toHaveValue("North tent run");
  expect(screen.getByTestId("start-room-tent-name")).toHaveValue("North tent");
}

describe("Start your room keeps every typed field", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.failSaves = true;
    testState.userId = "user-1";
    testState.nextRowId = FAILED_ROW_ID;
    vi.stubGlobal("crypto", { randomUUID: () => testState.nextRowId });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("stores every field under the same-user session key and retries that grow row", async () => {
    renderPage();
    fillEveryField();
    fireEvent.click(screen.getByTestId("start-room-submit"));

    expect(await screen.findByTestId("start-your-room-error")).toHaveTextContent(
      "Verdant could not save this grow. Your typing is still here. Retry saves this same grow once.",
    );
    expectEveryField();
    expect(screen.queryByTestId("start-your-room-step-done")).not.toBeInTheDocument();

    const stored = window.sessionStorage.getItem(draftKey("user-1"));
    expect(stored).toContain("North plant");
    expect(stored).toContain("flower");
    expect(stored).toContain("North tent run");
    expect(stored).toContain("North tent");
    expect(stored).toContain(FAILED_ROW_ID);
    expect(window.sessionStorage.getItem(draftKey("user-2"))).toBeNull();

    cleanup();
    testState.nextRowId = MINTED_AFTER_RELOAD_ID;
    renderPage();
    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("North plant");
    expectEveryField();
    expect(screen.queryByTestId("start-your-room-step-done")).not.toBeInTheDocument();
    expect(screen.getByTestId("start-your-room-error")).toHaveTextContent(
      "Your typing is still here",
    );

    testState.failSaves = false;
    fireEvent.click(screen.getByTestId("start-room-save-retry"));
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    const growIds = testState.insert.mock.calls
      .filter(([table]) => table === "grows")
      .map((call) => call[1].id);
    expect(growIds).toEqual([FAILED_ROW_ID, FAILED_ROW_ID]);
    expect(growIds).not.toContain(MINTED_AFTER_RELOAD_ID);
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toBeNull();
  });

  it("clears the visible room when the owner changes and leaves the other account's draft", async () => {
    const view = renderPage();
    fillEveryField();
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain("North tent");
    expect(window.sessionStorage.getItem(draftKey("user-1"))).toContain("flower");

    testState.userId = "user-2";
    view.rerender(
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("start-room-plant-name")).toHaveValue("");
    expect(screen.getByTestId("start-room-plant-stage")).toHaveValue("seedling");
    expect(screen.getByTestId("start-room-grow-name")).toHaveValue("");
    expect(screen.getByTestId("start-room-tent-name")).toHaveValue("");
    expect(screen.queryByTestId("start-your-room-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("start-your-room-step-done")).not.toBeInTheDocument();

    const previous = window.sessionStorage.getItem(draftKey("user-1")) ?? "";
    const next = window.sessionStorage.getItem(draftKey("user-2")) ?? "";
    expect(previous).toContain("North plant");
    expect(previous).toContain("North tent");
    expect(next).not.toContain("North plant");
    expect(next).not.toContain("North tent");
    expect(next).not.toContain("North tent run");
  });
});
