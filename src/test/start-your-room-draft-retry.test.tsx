import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const ATTEMPT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const testState = vi.hoisted(() => ({
  insert: vi.fn(),
  failSaves: true,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

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

function renderPage() {
  return render(
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>,
  );
}

async function typeGrow(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByTestId("start-room-grow-name"), name);
}

describe("Start your room keeps a failed save", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.insert.mockReset();
    testState.failSaves = true;
    vi.stubGlobal("crypto", { randomUUID: () => ATTEMPT_ID });
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  async function failThenRemount(width: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    const user = userEvent.setup();
    const view = renderPage();
    await typeGrow(user, "North tent run");
    await user.type(screen.getByTestId("start-room-plant-name"), "North plant");
    await user.click(screen.getByTestId("start-room-submit"));
    expect(await screen.findByTestId("start-your-room-error")).toHaveTextContent(
      "Verdant could not save this grow",
    );
    expect(screen.getByTestId("start-room-grow-name")).toHaveValue("North tent run");
    expect(screen.getByTestId("start-room-plant-name")).toHaveValue("North plant");
    expect(testState.insert).toHaveBeenCalledTimes(1);
    view.unmount();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    renderPage();
    expect(await screen.findByTestId("start-room-grow-name")).toHaveValue("North tent run");
    expect(screen.getByTestId("start-room-plant-name")).toHaveValue("North plant");
    expect(screen.queryByTestId("start-your-room-step-done")).not.toBeInTheDocument();
    return user;
  }

  it("keeps the room names on a phone-width remount and retries the same grow row once", async () => {
    await failThenRemount(390);
    testState.failSaves = false;
    const retry = screen.getByTestId("start-room-save-retry");
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(await screen.findByTestId("start-your-room-step-done")).toBeInTheDocument();
    const growIds = testState.insert.mock.calls
      .filter(([table]) => table === "grows")
      .map((call) => call[1].id);
    expect(growIds).toEqual([ATTEMPT_ID, ATTEMPT_ID]);
    expect(testState.insert.mock.calls.map(([table]) => table)).toEqual([
      "grows",
      "grows",
      "tents",
      "plants",
    ]);
    // The finished room clears its draft; nothing is left to resume.
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps the room names on a desktop-width remount", async () => {
    await failThenRemount(1280);
    expect(screen.getByTestId("start-your-room")).toBeInTheDocument();
  });
});
