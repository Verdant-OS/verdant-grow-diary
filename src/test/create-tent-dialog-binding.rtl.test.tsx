/**
 * Behavioral RTL: CreateTentDialog fail-closed grow binding.
 * Zero Supabase inserts when blocked; correct grow_id when allowed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GROW_SETUP_MESSAGES, GROW_SETUP_START_ROOM_HREF } from "@/constants/growSetupMessages";

const insertMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: (payload: unknown) => {
        insertMock(payload);
        return { select: () => ({ single: singleMock }) };
      },
    })),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));

const growsState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  activeGrowId: null as string | null,
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsState.grows,
    activeGrowId: growsState.activeGrowId,
    loading: growsState.loading,
    error: growsState.error,
    refresh: growsState.refresh,
  }),
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

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CreateTentDialog from "@/components/CreateTentDialog";

const G1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function renderDialog(props: { defaultGrowId?: string; initiallyOpen?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreateTentDialog initiallyOpen {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  insertMock.mockReset();
  singleMock.mockReset();
  singleMock.mockResolvedValue({ data: { id: "tent-1", name: "Tent #1" }, error: null });
  growsState.grows = [];
  growsState.activeGrowId = null;
  growsState.loading = false;
  growsState.error = null;
  growsState.refresh = vi.fn();
});

describe("CreateTentDialog RTL binding", () => {
  it("withholds form on zero-grow hard-stop (Start your room)", () => {
    renderDialog();
    expect(screen.getByTestId("create-tent-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-hard-stop-title")).toHaveTextContent(
      GROW_SETUP_MESSAGES.hardStopTitle,
    );
    expect(screen.getByTestId("create-tent-start-room-cta")).toHaveAttribute(
      "href",
      GROW_SETUP_START_ROOM_HREF,
    );
    expect(screen.queryByTestId("create-tent-form")).toBeNull();
    expect(screen.queryByTestId("tent-create-submit")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("shows Retry on grow read error — not Start your room", () => {
    growsState.error = "rls failed";
    renderDialog();
    expect(screen.getByTestId("create-tent-read-error")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-hard-stop")).toBeNull();
    expect(screen.queryByTestId("create-tent-form")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("blocks invalid explicit setup without falling back to active", () => {
    growsState.grows = [{ id: G1, name: "Spring" }];
    growsState.activeGrowId = G1;
    renderDialog({ defaultGrowId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(screen.getByTestId("create-tent-requested-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("create-tent-form")).toBeNull();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("happy path writes grow_id from binding view", async () => {
    growsState.grows = [{ id: G1, name: "Spring" }];
    growsState.activeGrowId = G1;
    renderDialog({ defaultGrowId: G1 });
    await waitFor(() => {
      expect(screen.getByTestId("create-tent-form")).toBeInTheDocument();
    });
    await userEvent.type(screen.getByPlaceholderText("Tent #1"), "Tent A");
    await userEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe(G1);
    expect(payload.name).toBe("Tent A");
  });

  it("resets form when closed and reopened", async () => {
    growsState.grows = [{ id: G1, name: "Spring" }];
    growsState.activeGrowId = G1;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CreateTentDialog />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /New tent/i }));
    const nameInput = screen.getByPlaceholderText("Tent #1");
    await userEvent.type(nameInput, "Stale name");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    await userEvent.click(screen.getByRole("button", { name: /New tent/i }));
    expect(screen.getByPlaceholderText("Tent #1")).toHaveValue("");
  });
});
