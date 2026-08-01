/**
 * Dialog integration tests for grow-bound tent/plant creation.
 *
 * Renders the real CreateTentDialog / CreatePlantDialog with mocked
 * RLS-loaded grow/tent state and a mocked Supabase client. Proves the
 * fail-closed grower outcomes without writing to a real database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps, ReactElement } from "react";
import { growSetupMessages } from "@/constants/growSetupMessages";
import { START_YOUR_ROOM_HREF } from "@/lib/createGrowBindingRules";

const mocks = vi.hoisted(() => {
  const GROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const GROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const TENT_A = "11111111-1111-4111-8111-111111111111";
  const TENT_B = "22222222-2222-4222-8222-222222222222";
  const TENT_UNLINKED = "33333333-3333-4333-8333-333333333333";
  const USER_ID = "99999999-9999-4999-8999-999999999999";
  const insert = vi.fn();
  const select = vi.fn();
  const single = vi.fn();
  const from = vi.fn();
  return {
    GROW_A,
    GROW_B,
    TENT_A,
    TENT_B,
    TENT_UNLINKED,
    USER_ID,
    insert,
    select,
    single,
    from,
    auth: { user: { id: USER_ID } as { id: string } | null },
    grows: {
      grows: [{ id: GROW_A, name: "Room Alpha" }] as Array<{
        id: string;
        name: string | null;
      }>,
      activeGrowId: GROW_A as string | null,
      loading: false,
      error: null as string | null,
      refresh: vi.fn().mockResolvedValue(undefined),
      setActiveGrowId: vi.fn(),
      activeGrow: { id: GROW_A, name: "Room Alpha" } as {
        id: string;
        name: string | null;
      } | null,
    },
    tents: [
      { id: TENT_A, name: "Tent Alpha", grow_id: GROW_A },
      { id: TENT_B, name: "Tent Beta", grow_id: GROW_B },
      { id: TENT_UNLINKED, name: "Unlinked Tent", grow_id: null },
    ] as Array<{ id: string; name: string; grow_id: string | null }>,
  };
});

const { GROW_A, GROW_B, TENT_A, TENT_B, TENT_UNLINKED, USER_ID } = mocks;

vi.mock("@/store/auth", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => mocks.grows,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mocks.tents, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import CreateTentDialog from "@/components/CreateTentDialog";
import CreatePlantDialog from "@/components/CreatePlantDialog";

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function openTentDialog(props: ComponentProps<typeof CreateTentDialog> = {}) {
  wrap(<CreateTentDialog initiallyOpen {...props} />);
}

function openPlantDialog(props: ComponentProps<typeof CreatePlantDialog> = {}) {
  wrap(<CreatePlantDialog initiallyOpen {...props} />);
}

beforeEach(() => {
  mocks.auth.user = { id: USER_ID };
  mocks.grows.grows = [{ id: GROW_A, name: "Room Alpha" }];
  mocks.grows.activeGrowId = GROW_A;
  mocks.grows.loading = false;
  mocks.grows.error = null;
  mocks.grows.activeGrow = { id: GROW_A, name: "Room Alpha" };
  mocks.grows.refresh = vi.fn().mockResolvedValue(undefined);
  mocks.tents = [
    { id: TENT_A, name: "Tent Alpha", grow_id: GROW_A },
    { id: TENT_B, name: "Tent Beta", grow_id: GROW_B },
    { id: TENT_UNLINKED, name: "Unlinked Tent", grow_id: null },
  ];
  mocks.insert.mockReset();
  mocks.select.mockReset();
  mocks.single.mockReset();
  mocks.from.mockReset();
  mocks.single.mockResolvedValue({
    data: { id: TENT_A, name: "Tent Alpha" },
    error: null,
  });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.from.mockReturnValue({ insert: mocks.insert });
});

describe("CreateTentDialog grow binding", () => {
  it("shows the hard stop and no form when the grower has zero setups", () => {
    mocks.grows.grows = [];
    mocks.grows.activeGrowId = null;
    openTentDialog();
    expect(screen.getByTestId("create-binding-no-setup")).toBeTruthy();
    expect(screen.getByText(growSetupMessages.noSetup.title)).toBeTruthy();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
    expect(screen.queryByPlaceholderText("Tent #1")).toBeNull();
  });

  it("points Start your room at the existing guided activation route", () => {
    mocks.grows.grows = [];
    mocks.grows.activeGrowId = null;
    openTentDialog();
    const link = screen.getByTestId("create-binding-start-room");
    expect(link.getAttribute("href")).toBe(START_YOUR_ROOM_HREF);
    expect(link.getAttribute("href")).toBe("/grows?intent=one_tent_activation");
  });

  it("shows retry (not no-setup copy) on a grow-list read error", () => {
    mocks.grows.error = "permission denied";
    mocks.grows.grows = [];
    openTentDialog();
    expect(screen.getByTestId("create-binding-read-error")).toBeTruthy();
    expect(screen.getByText(growSetupMessages.readError.title)).toBeTruthy();
    expect(screen.queryByText(growSetupMessages.noSetup.title)).toBeNull();
    expect(screen.getByTestId("create-binding-retry")).toBeTruthy();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
  });

  it("displays the verified setup name in the create context line", () => {
    openTentDialog();
    const context = screen.getByTestId("create-binding-context");
    expect(context.textContent).toContain(growSetupMessages.create.addingTo("Room Alpha"));
    expect(context.textContent).toContain(growSetupMessages.create.addingToHint);
    expect(context.textContent).not.toContain(GROW_A);
  });

  it("includes the exact resolved grow_id on a tent insert payload", async () => {
    openTentDialog();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "New Tent" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.from).toHaveBeenCalledWith("tents");
    const payload = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_A);
    expect(payload.name).toBe("New Tent");
    expect(payload.user_id).toBe(USER_ID);
  });

  it("does not fall back to the active grow when the requested grow is invalid", () => {
    openTentDialog({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-binding-choose-setup")).toBeTruthy();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
    expect(screen.queryByTestId("create-binding-context")).toBeNull();
  });

  it("performs zero inserts while loading or unresolved", () => {
    mocks.grows.loading = true;
    openTentDialog();
    expect(screen.getByTestId("create-binding-loading")).toBeTruthy();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("never renders an internal grow id as the setup name", () => {
    mocks.grows.grows = [{ id: GROW_A, name: null }];
    openTentDialog();
    const context = screen.getByTestId("create-binding-context");
    expect(context.textContent).toContain("your current setup");
    expect(context.textContent).not.toContain(GROW_A);
  });
});

describe("CreatePlantDialog grow binding", () => {
  it("shows the hard stop and no form when the grower has zero setups", () => {
    mocks.grows.grows = [];
    mocks.grows.activeGrowId = null;
    openPlantDialog();
    expect(screen.getByTestId("create-binding-no-setup")).toBeTruthy();
    expect(screen.getByText(growSetupMessages.noSetup.title)).toBeTruthy();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
    expect(screen.queryByPlaceholderText("Plant A")).toBeNull();
  });

  it("points Start your room at the existing guided activation route", () => {
    mocks.grows.grows = [];
    mocks.grows.activeGrowId = null;
    openPlantDialog();
    expect(screen.getByTestId("create-binding-start-room").getAttribute("href")).toBe(
      "/grows?intent=one_tent_activation",
    );
  });

  it("shows retry (not no-setup copy) on a grow-list read error", () => {
    mocks.grows.error = "timeout";
    openPlantDialog();
    expect(screen.getByTestId("create-binding-read-error")).toBeTruthy();
    expect(screen.queryByText(growSetupMessages.noSetup.title)).toBeNull();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
  });

  it("displays the verified setup name in the create context line", () => {
    openPlantDialog();
    expect(screen.getByTestId("create-binding-context").textContent).toContain(
      growSetupMessages.create.addingTo("Room Alpha"),
    );
  });

  it("includes the exact resolved grow_id on a plant insert payload", async () => {
    mocks.single.mockResolvedValue({
      data: { id: "plant-new", name: "Plant A" },
      error: null,
    });
    openPlantDialog();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    expect(mocks.from).toHaveBeenCalledWith("plants");
    const payload = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_A);
    expect(payload.tent_id).toBeUndefined();
  });

  it("does not fall back to the active grow when the requested grow is invalid", () => {
    openPlantDialog({ defaultGrowId: GROW_B });
    expect(screen.getByTestId("create-binding-choose-setup")).toBeTruthy();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
  });

  it("clears and blocks a default tent with a null grow", () => {
    openPlantDialog({ defaultTentId: TENT_UNLINKED });
    expect(screen.getByTestId("create-binding-tent-conflict")).toBeTruthy();
    expect(screen.getByText(growSetupMessages.mismatch.unlinkedTentTitle)).toBeTruthy();
    // The select must not retain the unsafe id as a hidden value.
    expect(screen.getByTestId("create-plant-tent-select").textContent).not.toContain(
      "Unlinked Tent",
    );
  });

  it("clears and blocks a default tent that belongs to another setup", () => {
    openPlantDialog({ defaultTentId: TENT_B });
    expect(screen.getByTestId("create-binding-tent-conflict")).toBeTruthy();
    expect(screen.getByText(growSetupMessages.mismatch.tentTitle)).toBeTruthy();
  });

  it("retains a compatible default tent", () => {
    openPlantDialog({ defaultTentId: TENT_A });
    expect(screen.queryByTestId("create-binding-tent-conflict")).toBeNull();
    expect(screen.getByTestId("create-plant-tent-select").textContent).toContain("Tent Alpha");
  });

  it("lists only tents that belong to the resolved setup", () => {
    openPlantDialog();
    // Open the select so options are rendered.
    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(options.some((t) => t.includes("Tent Alpha"))).toBe(true);
    expect(options.some((t) => t.includes("Tent Beta"))).toBe(false);
    expect(options.some((t) => t.includes("Unlinked Tent"))).toBe(false);
  });

  it("allows a plant without a tent only when requireTent is false", async () => {
    mocks.single.mockResolvedValue({
      data: { id: "plant-new", name: "Solo" },
      error: null,
    });
    openPlantDialog({ requireTent: false });
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Solo" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1));
    const payload = mocks.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_A);
    expect(payload.tent_id).toBeUndefined();
  });

  it("blocks submit when requireTent is true and no tent is selected", () => {
    openPlantDialog({ requireTent: true });
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
  });

  it("performs zero Supabase inserts on a tent conflict path", async () => {
    openPlantDialog({ defaultTentId: TENT_UNLINKED });
    // Submit is disabled while the conflict is active.
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("performs zero inserts while loading", () => {
    mocks.grows.loading = true;
    openPlantDialog();
    expect(screen.getByTestId("create-binding-loading")).toBeTruthy();
    expect(screen.queryByTestId("plant-create-submit")).toBeNull();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("clears stale tent/setup state on cancel/close/reopen", () => {
    const { unmount } = wrap(
      <CreatePlantDialog initiallyOpen defaultTentId={TENT_A} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Stale name" },
    });
    expect((screen.getByPlaceholderText("Plant A") as HTMLInputElement).value).toBe(
      "Stale name",
    );
    unmount();
    // Reopen with a conflicting default: form must start from a fresh safe
    // state (no retained name, unsafe tent cleared).
    openPlantDialog({ defaultTentId: TENT_UNLINKED });
    expect((screen.getByPlaceholderText("Plant A") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("create-binding-tent-conflict")).toBeTruthy();
    expect(screen.getByTestId("create-plant-tent-select").textContent).not.toContain(
      "Unlinked Tent",
    );
  });

  it("passes the resolved grow id into the nested Add new tent dialog", () => {
    openPlantDialog({ defaultGrowId: GROW_A });
    // Nested CreateTentDialog renders its own trigger; opening it should
    // surface the same resolved grow context (Room Alpha), not a raw prop
    // that failed verification.
    const addTent = screen.getByText("Add new tent");
    fireEvent.click(addTent);
    // Nested dialog opens; its context line uses the resolved grow.
    const contexts = screen.getAllByTestId("create-binding-context");
    expect(contexts.length).toBeGreaterThanOrEqual(1);
    expect(contexts.some((el) => el.textContent?.includes("Room Alpha"))).toBe(true);
  });

  it("preserves plant form fields after a nested tent is created", async () => {
    const newTentId = "44444444-4444-4444-8444-444444444444";
    mocks.single.mockResolvedValue({
      data: { id: newTentId, name: "Fresh Tent" },
      error: null,
    });
    openPlantDialog();
    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Keep Me" },
    });
    // Strain lives inside the enrich-later disclosure.
    fireEvent.click(screen.getByText(/Optional details \(enrich later\)/));
    fireEvent.change(screen.getByPlaceholderText("Blue Dream"), {
      target: { value: "OG Kush" },
    });
    fireEvent.click(screen.getByText("Add new tent"));
    const tentNameInputs = screen.getAllByPlaceholderText("Tent #1");
    const tentNameInput = tentNameInputs[tentNameInputs.length - 1];
    fireEvent.change(tentNameInput, { target: { value: "Fresh Tent" } });
    const tentForm = tentNameInput.closest("form");
    expect(tentForm).toBeTruthy();
    fireEvent.submit(tentForm!);
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    // Only the tents table should have been written by the nested creator.
    expect(mocks.from.mock.calls.map((c) => c[0])).toEqual(["tents"]);
    // Plant dialog must still be open with preserved fields.
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Plant A")).toBeTruthy();
    });
    expect((screen.getByPlaceholderText("Plant A") as HTMLInputElement).value).toBe("Keep Me");
    expect((screen.getByPlaceholderText("Blue Dream") as HTMLInputElement).value).toBe("OG Kush");
  });

  it("never renders an internal grow id as the setup name", () => {
    mocks.grows.grows = [{ id: GROW_A, name: "   " }];
    openPlantDialog();
    const context = screen.getByTestId("create-binding-context");
    expect(context.textContent).toContain("your current setup");
    expect(context.textContent).not.toContain(GROW_A);
  });
});

describe("create-dialog static safety", () => {
  it("catalog copy never contains schema or repair vocabulary", () => {
    const blob = JSON.stringify(growSetupMessages).toLowerCase();
    for (const term of [
      "grow_id",
      "orphan",
      "unbound",
      "lineage",
      "backfill",
      "migration",
      "constraint",
      "foreign key",
    ]) {
      expect(blob).not.toContain(term);
    }
  });

  it("Start your room href is exactly the existing activation route", () => {
    expect(START_YOUR_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
  });
});
