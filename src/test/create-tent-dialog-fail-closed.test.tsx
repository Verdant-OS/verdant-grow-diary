import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  growsState: {
    grows: [] as Array<{ id: string; name: string }>,
    activeGrowId: null as string | null,
    loading: false,
  },
  tents: [] as Array<{ id: string; name: string; grow_id: string | null }>,
  entitlement: {
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => mocks.growsState,
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: mocks.tents }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => mocks.entitlement,
}));

vi.mock("@/lib/funnelAnalytics", () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (payload: unknown) => {
        mocks.insert(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: "tent-new", name: "Tent A" },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

import CreateTentDialog from "@/components/CreateTentDialog";

function renderDialog(props: { defaultGrowId?: string; initiallyOpen?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreateTentDialog initiallyOpen={props.initiallyOpen ?? true} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.insert.mockClear();
  mocks.growsState.grows = [];
  mocks.growsState.activeGrowId = null;
  mocks.growsState.loading = false;
  mocks.tents = [];
});

describe("CreateTentDialog fail-closed", () => {
  it("zero-grow renders hard stop and blocks submit", async () => {
    renderDialog();
    expect(screen.getByTestId("create-tent-hard-stop")).toBeInTheDocument();
    expect(screen.getByTestId("create-tent-start-room-cta")).toHaveAttribute(
      "href",
      "/grows?intent=one_tent_activation",
    );
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "My Tent" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => {
      expect(mocks.insert).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId("tent-create-submit")).toBeDisabled();
  });

  it("with an active grow, submit includes grow_id", async () => {
    mocks.growsState.grows = [{ id: "aaaaaaaa-bbbb-cccc-dddd-111111111111", name: "Room A" }];
    mocks.growsState.activeGrowId = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "My Tent" },
    });
    fireEvent.click(screen.getByTestId("tent-create-submit"));
    await waitFor(() => {
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          grow_id: "aaaaaaaa-bbbb-cccc-dddd-111111111111",
          name: "My Tent",
        }),
      );
    });
  });

  it("cancel then reopen starts clean", async () => {
    mocks.growsState.grows = [{ id: "aaaaaaaa-bbbb-cccc-dddd-111111111111", name: "Room A" }];
    mocks.growsState.activeGrowId = "aaaaaaaa-bbbb-cccc-dddd-111111111111";
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText("Tent #1"), {
      target: { value: "Stale name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /New tent/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Tent #1")).toHaveValue("");
    });
  });
});
