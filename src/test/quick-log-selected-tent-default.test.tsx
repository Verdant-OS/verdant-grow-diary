/**
 * Selected-tent Quick Log default.
 *
 * A selectable tent becomes the target when nothing else is chosen. No tent,
 * an archived tent, or an invalid tent leaves the open unscoped.
 * Auth, storage, and network are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import { publishTentQuickLogTargetEvidence } from "@/context/TentQuickLogTargetContext";
import { resolveQuickLogWriteTarget } from "@/lib/quickLogTargetIntegrityRules";
import {
  QUICK_LOG_V2_EMPTY_CONTENT_HELPER,
  buildQuickLogV2TargetOptions,
  resolveTentScopedQuickLogPlantSelection,
  type QuickLogV2TargetOption,
} from "@/lib/quickLogV2Rules";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

const rpcMock = vi.fn();

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-selected-tent" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const plantsState: { data: unknown[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
const tentsState: { data: unknown[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => plantsState }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => tentsState }));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow 1" }],
    archivedGrows: [],
  }),
}));

const activeTent = { id: "tent-1", name: "Tent 1", grow_id: "grow-1" };
const archivedTent = {
  id: "tent-archived",
  name: "Old tent",
  grow_id: "grow-1",
  is_archived: true,
};
const twoPlants = [
  { id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" },
  { id: "plant-2", name: "Plant 2", tent_id: "tent-1", grow_id: "grow-1" },
];

function optionsFor(
  tents: { id: string; name: string; grow_id: string; is_archived?: boolean }[],
  plants: { id: string; name: string; tent_id: string | null; grow_id: string }[],
): QuickLogV2TargetOption[] {
  return buildQuickLogV2TargetOptions(tents, plants, ["grow-1"]);
}

function renderSheet() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

function publishTent(tentId: string | null) {
  act(() => {
    publishTentQuickLogTargetEvidence(tentId ? { tentId, soleActivePlantId: null } : null);
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  clearLocalStorageForTest();
  publishTent(null);
  plantsState.data = twoPlants;
  plantsState.isLoading = false;
  plantsState.isError = false;
  tentsState.data = [activeTent, archivedTent];
  tentsState.isLoading = false;
  tentsState.isError = false;
});

afterEach(() => {
  cleanup();
  publishTent(null);
});

describe("resolveTentScopedQuickLogPlantSelection — selected tent default", () => {
  const options = optionsFor([activeTent, archivedTent], twoPlants);

  it("leaves the target empty when no tent is selected", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: null,
        options,
        selectedKey: null,
        recentPlantId: null,
      }),
    ).toBeNull();
  });

  it("leaves the target empty for an archived tent", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "tent-archived",
        options,
        selectedKey: null,
        recentPlantId: null,
      }),
    ).toBeNull();
  });

  it("leaves the target empty for an invalid tent", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "not-a-tent",
        options,
        selectedKey: null,
        recentPlantId: null,
      }),
    ).toBeNull();
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "   ",
        options,
        selectedKey: null,
        recentPlantId: null,
      }),
    ).toBeNull();
  });

  it("defaults an empty selection to the selected tent", () => {
    expect(
      resolveTentScopedQuickLogPlantSelection({
        tentId: "tent-1",
        options,
        selectedKey: null,
        recentPlantId: "outside-plant",
      }),
    ).toBe("tent:tent-1");
  });
});

describe("resolveQuickLogWriteTarget — selected tent default", () => {
  it("stays blocked when no tent is selected", () => {
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "grow-1",
        selectedPlant: null,
        selectedTent: null,
      }),
    ).toEqual({ status: "blocked", reason: "missing_plant" });
  });

  it("stays blocked for an archived tent", () => {
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "grow-1",
        selectedPlant: null,
        selectedTent: archivedTent,
      }),
    ).toEqual({ status: "blocked", reason: "missing_plant" });
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "grow-1",
        selectedPlant: null,
        selectedTent: { id: "tent-1", grow_id: "grow-1", archived_at: "2026-10-01" },
      }),
    ).toEqual({ status: "blocked", reason: "missing_plant" });
  });

  it("stays blocked for an invalid tent", () => {
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "grow-1",
        selectedPlant: null,
        selectedTent: { id: "  ", grow_id: "grow-1" },
      }),
    ).toEqual({ status: "blocked", reason: "missing_plant" });
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "grow-1",
        selectedPlant: null,
        selectedTent: { id: "tent-1", grow_id: "other-grow" },
      }),
    ).toEqual({ status: "blocked", reason: "missing_plant" });
  });

  it('still blocks a missing plant for an active selected tent (never plantId "")', () => {
    const result = resolveQuickLogWriteTarget({
      activeGrowId: "grow-1",
      selectedPlant: null,
      selectedTent: activeTent,
    });
    expect(result).toEqual({ status: "blocked", reason: "missing_plant" });
  });
});

describe("QuickLogV2Sheet — selected tent default", () => {
  function expectUnscoped() {
    expect(screen.queryByTestId("qlv2-target-panel")).toBeNull();
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Choose a plant or tent before saving.",
    );
    const save = screen.getByTestId("qlv2-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
  }

  it("does not pick a tent when none is selected", () => {
    renderSheet();
    expectUnscoped();
  });

  it("does not pick an archived tent", () => {
    publishTent("tent-archived");
    renderSheet();
    expectUnscoped();
  });

  it("does not pick an invalid tent", () => {
    publishTent("not-a-tent");
    renderSheet();
    expectUnscoped();
  });

  it("defaults Save's target to the selected tent", () => {
    publishTent("tent-1");
    renderSheet();
    expect(screen.getByTestId("qlv2-target-panel")).toHaveAttribute("data-scope", "tent");
    expect(screen.getByTestId("qlv2-target-panel-tent-value")).toHaveTextContent("Tent 1");
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      QUICK_LOG_V2_EMPTY_CONTENT_HELPER,
    );
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Lights on" },
    });
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
  });
});
