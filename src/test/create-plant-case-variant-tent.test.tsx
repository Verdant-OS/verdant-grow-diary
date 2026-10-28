import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  GROW_ACTIVE: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  TENT_CASE: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
}));

const { USER_ID, GROW_ACTIVE, TENT_CASE } = ids;

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

describe("CreatePlantDialog case-variant tent grow id", () => {
  beforeEach(() => {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    insertMock.mockReset();
    singleMock.mockReset();
    singleMock.mockResolvedValue({
      data: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Case Plant" },
      error: null,
    });
    growsState.grows = [{ id: GROW_ACTIVE, name: "QA Grow" }];
    growsState.activeGrowId = GROW_ACTIVE;
    growsState.loading = false;
    growsState.error = null;
    growsState.refresh = vi.fn();
    tentsState.data = [
      { id: TENT_CASE, name: "QA Test Alpha", grow_id: GROW_ACTIVE.toUpperCase() },
    ];
    tentsState.isLoading = false;
    tentsState.isFetching = false;
    tentsState.isError = false;
    tentsState.isFetched = true;
    tentsState.refetch = vi.fn();
  });

  it("selects and saves a tent whose grow id differs only by letter case", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog initiallyOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByTestId("create-plant-tent-select"));
    await user.click(await screen.findByRole("option", { name: "QA Test Alpha" }));

    expect(screen.getByTestId("create-plant-tent-select")).toHaveTextContent("QA Test Alpha");

    await user.type(screen.getByTestId("create-plant-name"), "Case Plant");
    await user.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ACTIVE);
    expect(payload.tent_id).toBe(TENT_CASE);
    expect(payload.name).toBe("Case Plant");
  });
});
