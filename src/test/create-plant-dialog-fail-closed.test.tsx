import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { growSetup } from "@/constants/growSetupMessages";

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
  GROW_OTHER: "33333333-3333-4333-8333-333333333333",
  TENT_OK: "44444444-4444-4444-8444-444444444444",
  TENT_ORPHAN: "55555555-5555-4555-8555-555555555555",
  TENT_OTHER: "66666666-6666-4666-8666-666666666666",
}));

const { USER_ID, GROW_ACTIVE, GROW_OTHER, TENT_OK, TENT_ORPHAN, TENT_OTHER } = ids;

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: ids.USER_ID } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
}));

const tentsState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  isLoading: false,
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

function renderDialog(
  props: {
    defaultTentId?: string;
    defaultGrowId?: string;
    initiallyOpen?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreatePlantDialog initiallyOpen {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreatePlantDialog fail-closed binding", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    tentsState.data = [];
    tentsState.isLoading = false;
  });

  it("renders the zero-grow hard stop and blocks submit", () => {
    renderDialog();

    const banner = screen.getByTestId("plant-create-setup-hard-stop");
    expect(banner).toHaveAttribute("aria-label", growSetup.noSetup.bannerAriaLabel);
    expect(banner).toHaveTextContent(growSetup.noSetup.title);
    expect(screen.getByTestId("plant-create-start-room")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
    expect(screen.queryByTestId("plant-create-submit")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("includes grow_id when an active setup is available", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_OK, name: "Tent A", grow_id: GROW_ACTIVE }];
    singleMock.mockResolvedValue({
      data: { id: "77777777-7777-4777-8777-777777777777", name: "Plant A" },
      error: null,
    });

    renderDialog();

    fireEvent.change(screen.getByTestId("plant-create-name"), {
      target: { value: "Plant A" },
    });
    fireEvent.click(screen.getByTestId("plant-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ACTIVE);
    expect(payload.name).toBe("Plant A");
  });

  it("blocks orphan/mismatched tent defaults and shows Finish setup", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_ORPHAN, name: "Orphan Tent", grow_id: null }];

    renderDialog({ defaultTentId: TENT_ORPHAN });

    await waitFor(() => {
      expect(screen.getByTestId("plant-create-setup-mismatch")).toBeInTheDocument();
    });
    expect(screen.getByTestId("plant-create-setup-mismatch")).toHaveTextContent(
      growSetup.mismatch.title,
    );
    const finish = screen.getByTestId("plant-create-finish-setup");
    expect(finish).toHaveAttribute("href", "/grow-lineage");
    expect(finish).toHaveTextContent(growSetup.mismatch.ctaFinish);
    expect(screen.queryByTestId("plant-create-submit")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("blocks a tent bound to a different setup", async () => {
    growsState.grows = [
      { id: GROW_ACTIVE, name: "Spring Veg" },
      { id: GROW_OTHER, name: "Other" },
    ];
    growsState.activeGrowId = GROW_ACTIVE;
    tentsState.data = [{ id: TENT_OTHER, name: "Other Tent", grow_id: GROW_OTHER }];

    renderDialog({ defaultTentId: TENT_OTHER });

    await waitFor(() => {
      expect(screen.getByTestId("plant-create-setup-mismatch")).toBeInTheDocument();
    });
    expect(screen.getByTestId("plant-create-finish-setup")).toHaveAttribute(
      "href",
      growSetup.mismatch.finishHref,
    );
  });

  it("starts clean when reopened after close", () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog key="open-1" initiallyOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByTestId("plant-create-name"), {
      target: { value: "Stale plant" },
    });

    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog key="open-2" initiallyOpen />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((screen.getByTestId("plant-create-name") as HTMLInputElement).value).toBe("");
  });
});
