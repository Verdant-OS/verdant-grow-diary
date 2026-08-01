import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";
import CreateTentDialog from "@/components/CreateTentDialog";

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

const GROW_ACTIVE = "22222222-2222-4222-8222-222222222222";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false }),
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

function renderDialog(initiallyOpen = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateTentDialog initiallyOpen={initiallyOpen} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreateTentDialog fail-closed binding (RTL)", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
  });

  it("zero grows → blockSubmit, CTA uses one_tent_activation intent", () => {
    renderDialog();

    expect(screen.getByTestId("create-tent-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-hard-stop-title")).toHaveTextContent(
      /Start your room first/i,
    );
    expect(screen.getByTestId("create-tent-start-room-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_START_ROOM_HREF,
    );
    expect(screen.getByTestId("tent-create-submit")).toBeDisabled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("target grow present → tent insert payload includes grow_id", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;
    singleMock.mockResolvedValue({ data: { id: "tent-1", name: "Tent #1" }, error: null });

    renderDialog();

    expect(screen.queryByTestId("create-tent-hard-stop")).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Tent #1" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(GROW_ACTIVE);
    expect(payload.name).toBe("Tent #1");
  });

  it("cancel resets form when dialog reopens", async () => {
    growsState.grows = [{ id: GROW_ACTIVE, name: "Spring Veg" }];
    growsState.activeGrowId = GROW_ACTIVE;

    renderDialog();

    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Stale name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /New tent/i }));

    await waitFor(() => {
      expect((screen.getByPlaceholderText("Tent #1") as HTMLInputElement).value).toBe("");
    });
  });
});
