/**
 * #2171: a failed plant insert must stay visible and must not discard the
 * form. The error toast is outside the dialog; a pointer down on it was
 * closing the dialog and clearing what the grower had typed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE } from "@/lib/plantHealthRules";

const singleMock = vi.hoisted(() => vi.fn());
const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") return {};
      return {
        insert: () => ({
          select: () => ({ single: singleMock }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: maybeSingleMock }),
          }),
        }),
      };
    },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    loading: false,
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const PLANT_ID = "99999999-9999-4999-8999-999999999999";

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: GROW_ID, name: "Spring" }],
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
    data: [{ id: TENT_ID, name: "Tent A", grow_id: GROW_ID }],
    isLoading: false,
    isFetching: false,
    isError: false,
    isFetched: true,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));

import CreatePlantDialog from "@/components/CreatePlantDialog";

const elementPrototype = Element.prototype as Element & {
  setPointerCapture?: (pointerId: number) => void;
};
elementPrototype.setPointerCapture ??= () => {};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster />
        <CreatePlantDialog initiallyOpen defaultGrowId={GROW_ID} defaultTentId={TENT_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function typeNameAndSubmit(name: string) {
  renderDialog();
  await waitFor(() => expect(screen.getByTestId("create-plant-form")).toBeInTheDocument());
  fireEvent.change(screen.getByTestId("create-plant-name"), { target: { value: name } });
  fireEvent.click(screen.getByTestId("plant-create-submit"));
}

function dialog() {
  return screen.getByRole("dialog", { name: "New plant" });
}

describe("#2171 plant create insert failure", () => {
  beforeEach(() => {
    singleMock.mockReset();
    maybeSingleMock.mockReset();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(PLANT_ID);
  });

  it("shows the insert error in the open form and keeps the typed name", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invalid plant health: unknown" },
    });

    await typeNameAndSubmit("QA Test");

    const alert = await within(dialog()).findByRole("alert");
    expect(alert).toHaveTextContent(PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE);
    expect(screen.getByTestId("create-plant-name")).toHaveValue("QA Test");
    expect(screen.getByTestId("create-plant-health")).toHaveTextContent("Not assessed yet");
    expect(screen.getByTestId("plant-create-submit")).not.toBeDisabled();
    expect(screen.queryByText("Plant created")).not.toBeInTheDocument();
  });

  it("shows a fallback notice when the insert error has no message", async () => {
    singleMock.mockResolvedValue({ data: null, error: { code: "PGRST000" } });

    await typeNameAndSubmit("Nameless Error");

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Plant could not be created",
    );
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Nameless Error");
    expect(screen.getByTestId("plant-create-submit")).not.toBeDisabled();
  });

  it("keeps the form open when the error toast is pressed", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: 'new row violates check constraint "plants_stage_check"' },
    });

    await typeNameAndSubmit("Kept Plant");

    const region = await screen.findByRole("region", { name: /notifications/i });
    const toastText = await within(region).findByText(
      'new row violates check constraint "plants_stage_check"',
    );
    const toast = toastText.closest("[data-sonner-toast]");
    expect(toast).not.toBeNull();
    expect(dialog().contains(toast as HTMLElement)).toBe(false);
    fireEvent.pointerDown(toast as HTMLElement, { bubbles: true, button: 0, pointerId: 1 });

    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      'new row violates check constraint "plants_stage_check"',
    );
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Kept Plant");
  });

  it("still closes after a confirmed create", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: PLANT_ID,
        user_id: USER_ID,
        name: "Saved Plant",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        health: "unknown",
        stage: "seedling",
        strain: null,
        is_archived: false,
        plant_type: "unknown",
        started_at: null,
        photo_url: null,
        last_note: null,
        schema_version: 1,
        created_at: "2026-10-15T00:00:00.000Z",
        updated_at: "2026-10-15T00:00:00.000Z",
      },
      error: null,
    });

    await typeNameAndSubmit("Saved Plant");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Plant created")).toBeInTheDocument();
  });
});
