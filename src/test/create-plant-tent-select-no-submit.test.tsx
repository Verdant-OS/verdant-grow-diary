import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

const insertMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") return {};
      return {
        insert: (payload: unknown) => {
          insertMock(payload);
          return {
            select: () => ({ single: singleMock }),
          };
        },
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: maybeSingleMock }),
          }),
        }),
      };
    },
  },
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_A_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT_B_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLANT_ID = "99999999-9999-4999-8999-999999999999";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: USER_ID },
    loading: false,
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: GROW_ID, name: "Main Grow" }],
    activeGrowId: GROW_ID,
    loading: false,
    error: null,
    refresh: vi.fn(),
    setActiveGrowId: vi.fn(),
    activeGrow: null,
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: TENT_A_ID, name: "Tent A", grow_id: GROW_ID },
      { id: TENT_B_ID, name: "Tent B", grow_id: GROW_ID },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    isFetched: true,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/entitlements/freeTierGates", () => ({
  evaluateTentCreationGate: () => ({ allowed: true, blockedCopy: "" }),
  FREE_TIER_UPGRADE_PATH: "/pricing",
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function buildCreatedPlantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PLANT_ID,
    user_id: USER_ID,
    name: "Blue Dream",
    grow_id: GROW_ID,
    tent_id: TENT_A_ID,
    health: "unknown",
    stage: "seedling",
    strain: null,
    is_archived: false,
    plant_type: "unknown",
    started_at: "2026-10-16T00:00:00.000Z",
    photo_url: null,
    last_note: null,
    medium: null,
    pot_size: null,
    pheno_hunt_id: null,
    candidate_label: null,
    candidate_number: null,
    schema_version: 1,
    created_at: "2026-10-16T00:00:00.000Z",
    updated_at: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

function renderDialog(props: { initiallyOpen?: boolean } = { initiallyOpen: true }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster />
        <CreatePlantDialog defaultGrowId={GROW_ID} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreatePlantDialog tent selection and submit safety", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
    singleMock.mockResolvedValue({ data: buildCreatedPlantRow(), error: null });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(PLANT_ID);
  });

  it("marks every non-submit button and trigger inside the form as type=button and Create plant as type=submit", async () => {
    renderDialog({ initiallyOpen: true });
    const form = await screen.findByTestId("create-plant-form");
    const submitButton = screen.getByTestId("plant-create-submit");

    expect(submitButton).toHaveAttribute("type", "submit");

    const buttonsInForm = Array.from(form.querySelectorAll("button"));
    const nonSubmitButtons = buttonsInForm.filter((btn) => btn !== submitButton);
    expect(nonSubmitButtons.length).toBeGreaterThanOrEqual(4);
    for (const btn of nonSubmitButtons) {
      expect(btn).toHaveAttribute("type", "button");
    }
  });

  it("choosing a tent with keyboard Enter does not bubble an un-prevented Enter to the form or submit", async () => {
    renderDialog({ initiallyOpen: true });
    const form = await screen.findByTestId<HTMLFormElement>("create-plant-form");
    fireEvent.change(screen.getByTestId("create-plant-name"), {
      target: { value: "Blue Dream" },
    });

    let formReceivedUnpreventedEnter = false;
    form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.defaultPrevented) {
        formReceivedUnpreventedEnter = true;
        form.requestSubmit();
      }
    });

    const tentTrigger = screen.getByTestId("create-plant-tent-select");
    fireEvent.keyDown(tentTrigger, { key: "ArrowDown", code: "ArrowDown" });
    const tentOption = await screen.findByRole("option", { name: "Tent A" });
    const enterAllowed = fireEvent.keyDown(tentOption, {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
    });

    expect(enterAllowed).toBe(false);
    expect(formReceivedUnpreventedEnter).toBe(false);
    expect(tentTrigger).toHaveTextContent("Tent A");
    expect(insertMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New plant" })).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Blue Dream");
  });

  it("choosing a tent by pointer selection never submits the form even if a stray submit fires in the same turn", async () => {
    renderDialog({ initiallyOpen: true });
    const form = await screen.findByTestId<HTMLFormElement>("create-plant-form");
    fireEvent.change(screen.getByTestId("create-plant-name"), {
      target: { value: "Blue Dream" },
    });

    const tentTrigger = screen.getByTestId("create-plant-tent-select");
    fireEvent.pointerDown(tentTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(tentTrigger);

    const tentOption = await screen.findByRole("option", { name: "Tent A" });
    fireEvent.pointerDown(tentOption, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(tentOption, { button: 0, pointerType: "mouse" });
    fireEvent.click(tentOption);
    // Simulate a stray form submit / click landing in the same turn as picking the tent.
    fireEvent.submit(form);

    await waitFor(() => {
      expect(tentTrigger).toHaveTextContent("Tent A");
    });
    expect(insertMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New plant" })).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Blue Dream");
  });

  it("closes the dialog cleanly after a real submit, keeps the Plant created toast visible, and does not reopen empty", async () => {
    const user = userEvent.setup();
    renderDialog({ initiallyOpen: false });

    const newPlantTrigger = screen.getByRole("button", { name: /New plant/i });
    await user.click(newPlantTrigger);

    await screen.findByTestId("create-plant-form");
    await user.type(screen.getByTestId("create-plant-name"), "Blue Dream");

    const tentTrigger = screen.getByTestId("create-plant-tent-select");
    await user.click(tentTrigger);
    await user.click(await screen.findByRole("option", { name: "Tent A" }));
    expect(tentTrigger).toHaveTextContent("Tent A");
    expect(insertMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
      name: "Blue Dream",
      grow_id: GROW_ID,
      tent_id: TENT_A_ID,
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Plant created")).toBeVisible();
    // Focus returns to the New plant trigger after a successful create (Matthew approved
    // 2026-10-19; Codex P2 on e992f91d0). The held-key guard keeps a trailing key from
    // reopening the dialog empty.
    expect(newPlantTrigger).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
  });

  it("keeps the reopen guard while the submitting Enter is still held after the dialog closes", async () => {
    const user = userEvent.setup();
    renderDialog({ initiallyOpen: false });

    const newPlantTrigger = screen.getByRole("button", { name: /New plant/i });
    await user.click(newPlantTrigger);

    await screen.findByTestId("create-plant-form");
    await user.type(screen.getByTestId("create-plant-name"), "Blue Dream");

    const tentTrigger = screen.getByTestId("create-plant-tent-select");
    await user.click(tentTrigger);
    await user.click(await screen.findByRole("option", { name: "Tent A" }));

    // Submit by keyboard and keep Enter held until after the dialog closes.
    screen.getByTestId("plant-create-submit").focus();
    await user.keyboard("{Enter>}");

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    // Codex P2 at 84e6874b: keyboard users get focus back on the New plant trigger,
    // and a trailing key from the submitting gesture (held Enter before keyup) must
    // not reopen the dialog empty.
    expect(newPlantTrigger).toHaveFocus();
    fireEvent.keyDown(newPlantTrigger, { key: "Enter" });
    fireEvent.click(newPlantTrigger);
    expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    await user.keyboard("{/Enter}");

    await user.click(newPlantTrigger);
    await screen.findByTestId("create-plant-form");
    expect(screen.getByTestId("create-plant-name")).toHaveValue("");
  });

  it("reopens on the first Enter when a keyboard save resolves after the submitting keyup", async () => {
    // Codex P2 at 885e48b8: a network-backed save usually finishes after the
    // original Enter keyup, so the reopen guard must not stay armed waiting for it.
    let resolveInsert: (value: unknown) => void = () => {};
    singleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInsert = resolve;
      }),
    );
    const user = userEvent.setup();
    renderDialog({ initiallyOpen: false });

    const newPlantTrigger = screen.getByRole("button", { name: /New plant/i });
    await user.click(newPlantTrigger);
    await screen.findByTestId("create-plant-form");
    await user.type(screen.getByTestId("create-plant-name"), "Blue Dream");
    await user.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Tent A" }));

    screen.getByTestId("plant-create-submit").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    resolveInsert({ data: buildCreatedPlantRow(), error: null });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    expect(newPlantTrigger).toHaveFocus();

    await user.keyboard("{Enter}");
    await screen.findByTestId("create-plant-form");
    expect(screen.getByTestId("create-plant-name")).toHaveValue("");
  });

  async function createWithKeysHeld(user: ReturnType<typeof userEvent.setup>, press: string) {
    renderDialog({ initiallyOpen: false });
    const newPlantTrigger = screen.getByRole("button", { name: /New plant/i });
    await user.click(newPlantTrigger);
    await screen.findByTestId("create-plant-form");
    await user.type(screen.getByTestId("create-plant-name"), "Blue Dream");
    await user.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Tent A" }));
    screen.getByTestId("plant-create-submit").focus();
    await user.keyboard(press);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(newPlantTrigger).toHaveFocus();
    return newPlantTrigger;
  }

  function expectRepeatedEnterBlocked(trigger: HTMLElement) {
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
  }

  // Codex P2 at 30efbb8e: with Shift+Enter held across the close, the first
  // keyup must not release the guard while another submitting key is still down.
  it("keeps the reopen guard until both Shift and Enter are up when Shift is released first", async () => {
    const user = userEvent.setup();
    const trigger = await createWithKeysHeld(user, "{Shift>}{Enter>}");
    await user.keyboard("{/Shift}");
    expectRepeatedEnterBlocked(trigger);
    await user.keyboard("{/Enter}");
    await user.click(trigger);
    await screen.findByTestId("create-plant-form");
    expect(screen.getByTestId("create-plant-name")).toHaveValue("");
  });

  it("keeps the reopen guard until both Shift and Enter are up when Enter is released first", async () => {
    const user = userEvent.setup();
    const trigger = await createWithKeysHeld(user, "{Shift>}{Enter>}");
    await user.keyboard("{/Enter}");
    expectRepeatedEnterBlocked(trigger);
    await user.keyboard("{/Shift}");
    await user.click(trigger);
    await screen.findByTestId("create-plant-form");
  });

  it("releases the reopen guard on window blur because keyups elsewhere are lost", async () => {
    // Copilot at 30efbb8e: Enter released in another window must not leave the guard armed.
    const user = userEvent.setup();
    const trigger = await createWithKeysHeld(user, "{Enter>}");
    fireEvent.blur(window);
    fireEvent.click(trigger);
    await screen.findByTestId("create-plant-form");
  });

  it("tracks physical keys so a Shift-changed key value leaves no phantom held key", async () => {
    // Cursor/Copilot at 30efbb8e: keydown "Q" then keyup "q" (Shift released
    // first) is one physical key; a phantom entry would arm the guard after a
    // save that resolves once every key is up.
    let resolveInsert: (value: unknown) => void = () => {};
    singleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInsert = resolve;
      }),
    );
    const user = userEvent.setup();
    renderDialog({ initiallyOpen: false });
    fireEvent.keyDown(window, { key: "Shift", code: "ShiftLeft" });
    fireEvent.keyDown(window, { key: "Q", code: "KeyQ" });
    fireEvent.keyUp(window, { key: "Shift", code: "ShiftLeft" });
    fireEvent.keyUp(window, { key: "q", code: "KeyQ" });
    const trigger = screen.getByRole("button", { name: /New plant/i });
    await user.click(trigger);
    await screen.findByTestId("create-plant-form");
    await user.type(screen.getByTestId("create-plant-name"), "Blue Dream");
    await user.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "Tent A" }));
    screen.getByTestId("plant-create-submit").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
    resolveInsert({ data: buildCreatedPlantRow(), error: null });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    fireEvent.click(trigger);
    await screen.findByTestId("create-plant-form");
  });

  it("reselecting the already-selected tent by pointer never submits even if a stray submit fires in the same turn", async () => {
    // Copilot at 30efbb8e: Radix does not fire onValueChange for the current value.
    renderDialog({ initiallyOpen: true });
    const form = await screen.findByTestId<HTMLFormElement>("create-plant-form");
    fireEvent.change(screen.getByTestId("create-plant-name"), {
      target: { value: "Blue Dream" },
    });
    const tentTrigger = screen.getByTestId("create-plant-tent-select");
    const openTentA = async () => {
      fireEvent.pointerDown(tentTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(tentTrigger);
      return screen.findByRole("option", { name: "Tent A" });
    };
    const choose = (option: HTMLElement) => {
      fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
      fireEvent.pointerUp(option, { button: 0, pointerType: "mouse" });
      fireEvent.click(option);
    };
    choose(await openTentA());
    await waitFor(() => {
      expect(tentTrigger).toHaveTextContent("Tent A");
    });
    const again = await openTentA();
    // Same turn: reselect the current tent, then a stray submit lands.
    choose(again);
    fireEvent.submit(form);
    expect(insertMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New plant" })).toBeInTheDocument();
  });
});
