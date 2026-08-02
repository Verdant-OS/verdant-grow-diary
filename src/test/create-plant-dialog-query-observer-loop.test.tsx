import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherGrowId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  incompatibleTentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  compatibleTentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  tentReads: vi.fn(),
  inserts: vi.fn(),
  firstTentRead: null as Promise<{
    data: Array<{ id: string; name: string; grow_id: string }>;
    error: null;
  }> | null,
  resolveFirstTentRead: null as
    | ((result: {
        data: Array<{ id: string; name: string; grow_id: string }>;
        error: null;
      }) => void)
    | null,
  secondTentRead: null as Promise<{
    data: Array<{ id: string; name: string; grow_id: string }>;
    error: null;
  }> | null,
  resolveSecondTentRead: null as
    | ((result: {
        data: Array<{ id: string; name: string; grow_id: string }>;
        error: null;
      }) => void)
    | null,
  neverSettlingTentRead: new Promise<never>(() => {}),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "tents") {
        return {
          select: () => ({
            eq: () => ({
              order: () => {
                mocks.tentReads();
                if (mocks.tentReads.mock.calls.length === 1) return mocks.firstTentRead!;
                if (mocks.tentReads.mock.calls.length === 2) return mocks.secondTentRead!;
                return mocks.neverSettlingTentRead;
              },
            }),
          }),
          insert: (...args: unknown[]) => {
            mocks.inserts(...args);
            throw new Error("Nested tent insert must not run during observer-loop proof");
          },
        };
      }

      return {
        insert: (...args: unknown[]) => {
          mocks.inserts(...args);
          throw new Error("Plant insert must not run during observer-loop proof");
        },
      };
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: mocks.growId, name: "Browser Proof Setup" }],
    activeGrowId: mocks.growId,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: { multiTent: true } },
  }),
}));

vi.mock("@/lib/entitlements/freeTierGates", () => ({
  evaluateTentCreationGate: () => ({ allowed: true, blockedCopy: "" }),
  FREE_TIER_UPGRADE_PATH: "/pricing",
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CreatePlantDialog from "@/components/CreatePlantDialog";

describe("CreatePlantDialog tent-query observer lifecycle", () => {
  beforeEach(() => {
    mocks.tentReads.mockReset();
    mocks.inserts.mockReset();
    mocks.firstTentRead = new Promise((resolve) => {
      mocks.resolveFirstTentRead = resolve;
    });
    mocks.secondTentRead = new Promise((resolve) => {
      mocks.resolveSecondTentRead = resolve;
    });
  });

  it("settles a supplied-tent mismatch without an observer refetch loop", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CreatePlantDialog
            initiallyOpen
            defaultGrowId={mocks.growId}
            defaultTentId={mocks.incompatibleTentId}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("create-plant-tent-pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(mocks.tentReads).toHaveBeenCalledTimes(1);
    expect(mocks.inserts).not.toHaveBeenCalled();

    const settledRows = [
      {
        id: mocks.incompatibleTentId,
        name: "Other Setup Tent",
        grow_id: mocks.otherGrowId,
      },
      {
        id: mocks.compatibleTentId,
        name: "Compatible Tent",
        grow_id: mocks.growId,
      },
    ];

    await act(async () => {
      mocks.resolveFirstTentRead?.({ data: settledRows, error: null });
    });

    await waitFor(() => expect(mocks.tentReads).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("create-plant-tent-pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add new tent" })).not.toBeInTheDocument();

    await act(async () => {
      mocks.resolveSecondTentRead?.({ data: settledRows, error: null });
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(mocks.tentReads).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("create-plant-tent-mismatch")).toBeInTheDocument();
    expect(screen.queryByTestId("create-plant-tent-pending")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add new tent" })).toBeInTheDocument();
    expect(screen.getByTestId("plant-create-submit")).toBeDisabled();
    expect(mocks.inserts).not.toHaveBeenCalled();
  });
});
