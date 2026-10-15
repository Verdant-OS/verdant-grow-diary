/**
 * Production create returns 400 when the dialog sends health "unknown".
 * The live trigger only allows healthy, watch, and issue. An unset health
 * must be left out of the insert so the column default applies, and a health
 * rejection must open the collapsed Optional details section that holds the
 * health select.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

describe("CreatePlantDialog omits unset health", () => {
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

  it("leaves health out of the insert when the grower has not chosen one", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Plant A",
        user_id: USER_ID,
        grow_id: GROW_ACTIVE,
        tent_id: TENT_OK,
      },
      error: null,
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
    expect(payload).not.toHaveProperty("health");
    expect(payload.name).toBe("Plant A");
    expect(payload.grow_id).toBe(GROW_ACTIVE);
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
    expect(screen.getByTestId("create-plant-health")).toBeVisible();
  });
});
