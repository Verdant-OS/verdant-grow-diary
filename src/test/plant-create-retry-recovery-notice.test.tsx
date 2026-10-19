/**
 * #2192 review repairs: a retry must drop the previous insert failure, and
 * an unconfirmed create must keep its recovery notice on screen.
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

const SAVED_ROW = {
  id: PLANT_ID,
  user_id: USER_ID,
  name: "QA Test",
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
};

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

describe("#2192 plant create retry and recovery", () => {
  beforeEach(() => {
    singleMock.mockReset();
    maybeSingleMock.mockReset();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(PLANT_ID);
  });

  it("clears the previous failure notice when a retry starts", async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    singleMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: "P0001", message: "invalid plant health: unknown" },
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
      );

    await typeNameAndSubmit("QA Test");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE,
    );

    fireEvent.click(screen.getByTestId("plant-create-submit"));
    await waitFor(() => expect(screen.getByTestId("plant-create-submit")).toBeDisabled());
    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("create-plant-name")).toHaveValue("QA Test");

    resolveRetry({ data: SAVED_ROW, error: null });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New plant" })).not.toBeInTheDocument();
    });
  });

  it("clears the previous failure when a retry is stopped before any write", async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "invalid plant health: unknown" },
    });

    await typeNameAndSubmit("QA Test");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE,
    );

    // The retry is refused before any insert because no safe save id can be
    // made. The old rejection no longer describes this attempt.
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValueOnce(
      "not-a-uuid" as ReturnType<typeof crypto.randomUUID>,
    );
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    const toaster = await screen.findByRole("region", { name: /notifications/i });
    expect(
      await within(toaster).findByText(
        "Verdant could not start a safe plant save. Refresh and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-save-error")).not.toBeInTheDocument();
    expect(singleMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("create-plant-name")).toHaveValue("QA Test");
  });

  it("keeps the unconfirmed-create notice visible when close is requested", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: "", message: "TypeError: Failed to fetch" },
    });
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { code: "", message: "TypeError: Failed to fetch" },
    });

    await typeNameAndSubmit("Blocked Plant");
    expect(await screen.findByTestId("plant-create-outcome-unknown")).toHaveTextContent(
      "Refresh this page before creating another plant",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("dialog", { name: "New plant" })).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Blocked Plant");
    expect(screen.getByTestId("plant-create-outcome-unknown")).toBeInTheDocument();
  });

  it("presses the sonner toast rather than the inline error", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: 'new row violates check constraint "plants_stage_check"' },
    });

    await typeNameAndSubmit("Kept Plant");
    const toaster = await screen.findByRole("region", { name: /notifications/i });
    const toast = await within(toaster).findByText(
      'new row violates check constraint "plants_stage_check"',
    );
    fireEvent.pointerDown(toast, { bubbles: true, button: 0, pointerId: 1 });

    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      'new row violates check constraint "plants_stage_check"',
    );
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Kept Plant");
  });
});
