import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GROW_SETUP_MESSAGES, GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";

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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
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

import CreateTentDialog from "@/components/CreateTentDialog";

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

describe("CreateTentDialog fail-closed binding", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    growsState.grows = [];
    growsState.activeGrowId = null;
    growsState.loading = false;
    growsState.error = null;
    growsState.refresh = vi.fn();
  });

  it("zero grows blocks submit and routes to one-tent activation", () => {
    renderDialog();

    expect(screen.getByTestId("create-tent-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-hard-stop-title")).toHaveTextContent(
      GROW_SETUP_MESSAGES.hardStopTitle,
    );
    expect(screen.getByTestId("create-tent-start-room-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_START_ROOM_HREF,
    );
    expect(GROW_SETUP_START_ROOM_HREF).toContain("one_tent_activation");
    expect(screen.queryByTestId("tent-create-submit")).not.toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("writes grow_id when target setup is resolvable", async () => {
    growsState.grows = [{ id: "grow-active", name: "Spring Veg" }];
    growsState.activeGrowId = "grow-active";
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
    expect(payload.grow_id).toBe("grow-active");
    expect(payload.name).toBe("Tent #1");
  });

  it("resets form when closed and reopened", () => {
    growsState.grows = [{ id: "grow-active", name: "Spring Veg" }];
    growsState.activeGrowId = "grow-active";

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreateTentDialog />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /New tent/i }));
    const nameInput = screen.getByPlaceholderText("Tent #1") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Stale name" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /New tent/i }));
    expect((screen.getByPlaceholderText("Tent #1") as HTMLInputElement).value).toBe("");
  });
});
