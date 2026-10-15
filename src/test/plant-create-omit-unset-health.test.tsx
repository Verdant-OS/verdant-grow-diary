/**
 * On 20260516204601, omitting health stores the column default 'healthy'.
 * An unassessed create must send an explicit value the trigger rejects, so
 * nothing is stored as healthy, and that rejection opens the health select.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  buildPlantHealthCreateInsert,
  plantHealthFromSelectValue,
  PLANT_HEALTH_NOT_ASSESSED_OPTION,
  storedHealthUnderLegacyPlantTrigger,
} from "@/lib/plantHealthRules";

const insertMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (...args: unknown[]) => {
        insertMock(...args);
        return {
          select: () => ({
            single: singleMock,
          }),
        };
      },
    }),
  },
}));

const ids = vi.hoisted(() => ({
  USER_ID: "11111111-1111-4111-8111-111111111111",
  GROW_ACTIVE: "22222222-2222-4222-8222-222222222222",
  TENT_OK: "44444444-4444-4444-8444-444444444444",
}));

const { USER_ID, GROW_ACTIVE, TENT_OK } = ids;

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: USER_ID } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  isLoading: false,
  isFetching: false,
  isError: false,
  isFetched: true,
  refetch: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => tentsState,
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

vi.mock("@/components/CreateTentDialog", () => ({
  default: () => null,
}));

import CreatePlantDialog from "@/components/CreatePlantDialog";

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen defaultTentId={TENT_OK} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function optionalDetails(): HTMLDetailsElement {
  const details = screen.getByText("Optional details (enrich later)").closest("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("optional details element missing");
  }
  return details;
}

function storedFromInsert(payload: { readonly health?: unknown }) {
  return storedHealthUnderLegacyPlantTrigger(payload);
}

describe("legacy plant-health store", () => {
  it("stores healthy only when the column is omitted", () => {
    expect(storedFromInsert({})).toEqual({ status: "stored", health: "healthy" });
    expect(storedFromInsert(buildPlantHealthCreateInsert(""))).toEqual({ status: "rejected" });
    expect(storedFromInsert(buildPlantHealthCreateInsert(undefined))).toEqual({
      status: "rejected",
    });
    expect(
      storedFromInsert(
        buildPlantHealthCreateInsert(plantHealthFromSelectValue(PLANT_HEALTH_NOT_ASSESSED_OPTION)),
      ),
    ).toEqual({ status: "rejected" });
    expect(storedFromInsert(buildPlantHealthCreateInsert("watch"))).toEqual({
      status: "stored",
      health: "watch",
    });
    expect(storedFromInsert(buildPlantHealthCreateInsert("healthy"))).toEqual({
      status: "stored",
      health: "healthy",
    });
    expect(storedFromInsert(buildPlantHealthCreateInsert("issue"))).toEqual({
      status: "stored",
      health: "issue",
    });
    expect(storedFromInsert({ health: "great" })).toEqual({ status: "rejected" });
    expect(storedFromInsert({ health: null })).toEqual({ status: "rejected" });
  });
});

describe("CreatePlantDialog unassessed health on the legacy schema", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    growsState.loading = false;
    growsState.error = null;
    growsState.refresh = vi.fn();
    tentsState.data = [{ id: TENT_OK, name: "Tent A", grow_id: GROW_ACTIVE }];
    tentsState.isLoading = false;
    tentsState.isFetching = false;
    tentsState.isError = false;
    tentsState.isFetched = true;
    tentsState.refetch = vi.fn();
  });

  it("does not store the legacy healthy default when health is left untouched", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "invalid plant health: unknown" },
    });

    renderDialog();
    expect(optionalDetails().open).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.name).toBe("Plant A");
    expect(payload.grow_id).toBe(GROW_ACTIVE);
    expect(storedFromInsert(payload)).toEqual({ status: "rejected" });
    await waitFor(() => {
      expect(optionalDetails().open).toBe(true);
    });
    expect(screen.getByTestId("create-plant-health")).toBeVisible();
  });

  it("does not store the legacy healthy default when the grower selects Not assessed yet", async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "invalid plant health: unknown" },
    });

    try {
      renderDialog();
      fireEvent.change(screen.getByPlaceholderText("Plant A"), {
        target: { value: "Plant A" },
      });
      fireEvent.keyDown(screen.getByTestId("create-plant-health"), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: "Watch" }));
      await waitFor(() =>
        expect(screen.getByTestId("create-plant-health")).toHaveTextContent("Watch"),
      );
      fireEvent.keyDown(screen.getByTestId("create-plant-health"), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: "Not assessed yet" }));
      await waitFor(() =>
        expect(screen.getByTestId("create-plant-health")).toHaveTextContent("Not assessed yet"),
      );
      fireEvent.click(screen.getByTestId("plant-create-submit"));

      await waitFor(() => {
        expect(insertMock).toHaveBeenCalled();
      });
      const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(storedFromInsert(payload)).toEqual({ status: "rejected" });
      await waitFor(() => {
        expect(optionalDetails().open).toBe(true);
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("opens optional details when the database rejects plant health", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "invalid plant health: unknown" },
    });

    renderDialog();
    expect(optionalDetails().open).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Plant A"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(optionalDetails().open).toBe(true);
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(storedFromInsert(payload)).toEqual({ status: "rejected" });
    expect(screen.getByTestId("create-plant-health")).toBeVisible();
  });

  it("stores the health the grower explicitly picks", async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    singleMock.mockResolvedValue({
      data: {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Plant A",
        user_id: USER_ID,
        grow_id: GROW_ACTIVE,
        tent_id: TENT_OK,
        health: "watch",
      },
      error: null,
    });
    try {
      renderDialog();
      fireEvent.change(screen.getByPlaceholderText("Plant A"), {
        target: { value: "Plant A" },
      });
      fireEvent.keyDown(screen.getByTestId("create-plant-health"), { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name: "Watch" }));
      await waitFor(() =>
        expect(screen.getByTestId("create-plant-health")).toHaveTextContent("Watch"),
      );
      fireEvent.click(screen.getByTestId("plant-create-submit"));
      await waitFor(() => {
        expect(insertMock).toHaveBeenCalled();
      });
      const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(storedFromInsert(payload)).toEqual({ status: "stored", health: "watch" });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
