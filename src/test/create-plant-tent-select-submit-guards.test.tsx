import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

const insertMock = vi.hoisted(() => vi.fn());
const singleMock = vi.hoisted(() => vi.fn());
const maybeSingleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "plants") return {};
      return {
        insert: (payload: unknown) => {
          insertMock(payload);
          return {
            select: () => ({ single: singleMock }),
          };
        },
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: maybeSingleMock }),
          }),
        }),
      };
    },
  },
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_A_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENT_B_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLANT_ID = "99999999-9999-4999-8999-999999999999";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: USER_ID },
    loading: false,
  }),
}));

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: GROW_ID, name: "Main Grow" }],
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
    data: [
      { id: TENT_A_ID, name: "Tent A", grow_id: GROW_ID },
      { id: TENT_B_ID, name: "Tent B", grow_id: GROW_ID },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
    isFetched: true,
    refetch: vi.fn(),
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

import CreatePlantDialog from "@/components/CreatePlantDialog";

const elementPrototype = Element.prototype as Element & {
  hasPointerCapture?: () => boolean;
  setPointerCapture?: () => void;
  releasePointerCapture?: () => void;
  scrollIntoView?: () => void;
};
elementPrototype.hasPointerCapture ??= () => false;
elementPrototype.setPointerCapture ??= () => {};
elementPrototype.releasePointerCapture ??= () => {};
elementPrototype.scrollIntoView ??= () => {};

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Toaster />
        <CreatePlantDialog defaultGrowId={GROW_ID} initiallyOpen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CreatePlantDialog tentSelectOpen submit guard (#2218)", () => {
  beforeEach(() => {
    insertMock.mockReset();
    singleMock.mockReset();
    maybeSingleMock.mockReset();
    singleMock.mockResolvedValue({
      data: {
        id: PLANT_ID,
        user_id: USER_ID,
        name: "Blue Dream",
        grow_id: GROW_ID,
        tent_id: TENT_A_ID,
      },
      error: null,
    });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(PLANT_ID);
  });

  it("does not insert while the tent listbox is still open even when the form receives submit", async () => {
    renderDialog();
    fireEvent.change(screen.getByTestId("create-plant-name"), {
      target: { value: "Blue Dream" },
    });

    fireEvent.click(screen.getByTestId("create-plant-tent-select"));
    await screen.findByRole("option", { name: "Tent A" });

    fireEvent.submit(screen.getByTestId("create-plant-form"));

    expect(insertMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("create-plant-form")).toBeInTheDocument();
    expect(screen.getByTestId("create-plant-name")).toHaveValue("Blue Dream");
  });
});
