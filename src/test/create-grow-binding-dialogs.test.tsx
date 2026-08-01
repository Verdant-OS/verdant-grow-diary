import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CreateTentDialog from "@/components/CreateTentDialog";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import { ONE_TENT_ACTIVATION_HREF } from "@/constants/growSetupMessages";

const GROW_A = "11111111-1111-1111-1111-111111111111";
const GROW_B = "22222222-2222-2222-2222-222222222222";
const TENT_A = "33333333-3333-3333-3333-333333333333";
const TENT_B = "44444444-4444-4444-4444-444444444444";
const TENT_UNLINKED = "55555555-5555-5555-5555-555555555555";
const USER = "66666666-6666-6666-6666-666666666666";

const insertMock = vi.hoisted(() => vi.fn());
const refreshGrows = vi.hoisted(() => vi.fn());
const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string | null }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
}));
const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        insertMock(table, payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: "new-row-id", name: "Created" },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: USER }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsState.grows,
    activeGrowId: growsState.activeGrowId,
    loading: growsState.loading,
    error: growsState.error,
    refresh: refreshGrows,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: tentsState.data }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderTent(props: Partial<React.ComponentProps<typeof CreateTentDialog>> = {}) {
  return render(
    <MemoryRouter>
      <CreateTentDialog initiallyOpen {...props} />
    </MemoryRouter>,
  );
}

function renderPlant(props: Partial<React.ComponentProps<typeof CreatePlantDialog>> = {}) {
  return render(
    <MemoryRouter>
      <CreatePlantDialog initiallyOpen {...props} />
    </MemoryRouter>,
  );
}

describe("create grow-binding dialogs", () => {
  beforeEach(() => {
    insertMock.mockClear();
    refreshGrows.mockClear();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    growsState.error = null;
    tentsState.data = [];
  });

  it("zero-grow Create Tent shows hard stop and no form submit", async () => {
    renderTent();
    expect(screen.getByTestId("create-tent-no-setup")).toBeTruthy();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "Start your room" }));
    expect(screen.getByRole("link", { name: "Start your room" }).getAttribute("href")).toBe(
      ONE_TENT_ACTIVATION_HREF,
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("zero-grow Create Plant shows hard stop and no form submit", () => {
    renderPlant();
    expect(screen.getByTestId("create-plant-no-setup")).toBeTruthy();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("read error shows retry, not no-setup copy", () => {
    growsState.error = "network";
    renderTent();
    expect(screen.getByTestId("create-tent-read-error")).toBeTruthy();
    expect(screen.queryByTestId("create-tent-no-setup")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("valid current setup displays its name", () => {
    growsState.grows = [{ id: GROW_A, name: "Blue Dream Room" }];
    growsState.activeGrowId = GROW_A;
    renderTent();
    expect(screen.getByTestId("create-tent-setup-context").textContent).toContain(
      "Adding to Blue Dream Room",
    );
  });

  it("tent insert payload contains exact resolved grow_id", async () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    renderTent();
    await userEvent.type(screen.getByPlaceholderText("Tent #1"), "My Tent");
    await userEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock.mock.calls[0]).toEqual([
      "tents",
      expect.objectContaining({ grow_id: GROW_A, name: "My Tent", user_id: USER }),
    ]);
  });

  it("plant insert payload contains exact resolved grow_id", async () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    renderPlant();
    await userEvent.type(screen.getByPlaceholderText("Plant A"), "Cherry");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock.mock.calls[0]).toEqual([
      "plants",
      expect.objectContaining({ grow_id: GROW_A, name: "Cherry", user_id: USER }),
    ]);
  });

  it("explicit invalid requested grow does not fall back to active grow", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    renderTent({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-tent-setup-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("create-tent-setup-context")).toBeNull();
  });

  it("default tent with null grow is cleared and blocked", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_UNLINKED, name: "Loose Tent", grow_id: null }];
    renderPlant({ defaultTentId: TENT_UNLINKED });
    expect(screen.getByTestId("create-plant-tent-conflict")).toBeTruthy();
    expect(screen.getByTestId("plant-create-submit")).toHaveProperty("disabled", true);
  });

  it("default tent in another grow is cleared and blocked", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_B, name: "Other Tent", grow_id: GROW_B }];
    renderPlant({ defaultTentId: TENT_B });
    expect(screen.getByTestId("create-plant-tent-conflict")).toBeTruthy();
    expect(screen.getByTestId("plant-create-submit")).toHaveProperty("disabled", true);
  });

  it("compatible default tent is retained", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_A, name: "Main Tent", grow_id: GROW_A }];
    renderPlant({ defaultTentId: TENT_A });
    expect(screen.queryByTestId("create-plant-tent-conflict")).toBeNull();
    expect(screen.getByTestId("plant-create-submit")).toHaveProperty("disabled", false);
  });

  it("manual tent options contain only the resolved setup tents", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [
      { id: TENT_A, name: "Main Tent", grow_id: GROW_A },
      { id: TENT_B, name: "Other Tent", grow_id: GROW_B },
    ];
    renderPlant();
    expect(screen.getByText("Main Tent")).toBeTruthy();
    expect(screen.queryByText("Other Tent")).toBeNull();
  });

  it("plant without tent is allowed only outside requireTent", async () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    renderPlant({ requireTent: false });
    await userEvent.type(screen.getByPlaceholderText("Plant A"), "Solo Plant");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(insertMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ grow_id: GROW_A, name: "Solo Plant" }),
    );
    expect(insertMock.mock.calls[0][1]).not.toHaveProperty("tent_id");
  });

  it("conflict path performs zero Supabase insert calls", async () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    tentsState.data = [{ id: TENT_B, name: "Other Tent", grow_id: GROW_B }];
    renderPlant({ defaultTentId: TENT_B });
    await userEvent.type(screen.getByPlaceholderText("Plant A"), "Blocked");
    await userEvent.click(screen.getByTestId("plant-create-submit"));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("loading path performs zero insert calls", () => {
    growsState.loading = true;
    renderTent();
    expect(screen.getByTestId("create-tent-loading")).toBeTruthy();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("nested Add new tent receives resolved grow id", () => {
    growsState.grows = [{ id: GROW_A, name: "Room A" }];
    growsState.activeGrowId = GROW_A;
    renderPlant({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-plant-setup-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("create-plant-add-tent")).toBeNull();
    renderPlant();
    expect(screen.getByTestId("create-plant-add-tent")).toBeTruthy();
  });

  it("internal ids never render as setup names", () => {
    growsState.grows = [{ id: GROW_A, name: "   " }];
    growsState.activeGrowId = GROW_A;
    renderPlant();
    const context = screen.getByTestId("create-plant-setup-context").textContent ?? "";
    expect(context).not.toContain(GROW_A);
    expect(context).toContain("your current setup");
  });
});
