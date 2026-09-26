/**
 * Codex review on #1683 (BUG-006 follow-up): the Alerts page picked a grow's
 * plants by `plants.grow_id` alone. A legacy plant with `grow_id = null` whose
 * tent belongs to the grow was left out, although growAttributionRules rolls
 * such plants up through their tent. A Flower plant in a Veg grow/tent was
 * then judged by Veg targets, which could suppress a Flower RH breach.
 *
 * These render the real Alerts page and the real alert components; only the
 * data hooks are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Alerts from "@/pages/Alerts";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import {
  isCurrentReadForAlertWrite,
  plantsForAlertPersistence,
  resolveGrowPlantStages,
  resolveSelectedTentPlantStages,
} from "@/lib/alertPlantStageScopeRules";

type PlantRow = { id: string; grow_id: string | null; tent_id: string | null; stage: string };

const plantsState = vi.hoisted(() => ({
  value: { data: [] as PlantRow[] | undefined, isError: false } as {
    data: PlantRow[] | undefined;
    isError: boolean;
    isFetching?: boolean;
  },
}));
const persistMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-plants", () => ({ usePlants: () => plantsState.value }));
vi.mock("@/hooks/useGrowData", () => ({
  // g1 owns one tent, still at the "seedling" creation default.
  useGrowTents: (growId?: string) => ({
    data: growId === "g1" ? [{ id: "tent-g1", name: "Tent", stage: "seedling" }] : [],
    isFetched: true,
  }),
}));
vi.mock("@/lib/alerts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
  return { ...actual, listAlerts: vi.fn().mockResolvedValue([]) };
});
vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => {
      const c: Record<string, unknown> = {
        abortSignal: () => c,
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(r, j),
      };
      return c;
    },
    then: (r: (v: { data: unknown; error: null }) => unknown) => r({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock("@/hooks/useAlertEvents", () => ({
  useAlertEvents: () => ({ status: "ok", events: [] }),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => ({ get: () => undefined }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({ status: "loading" }),
}));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "loading" }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: (input: unknown) => {
    persistMock(input);
    return { status: "skipped", persistedCount: 0, lastError: null };
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "u@example.com" } }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "g1", name: "G1", stage: "veg" }],
    activeGrowId: "g1",
    activeGrow: { id: "g1", name: "G1", stage: "veg" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const TENT_ROLLED_UP_FLOWER: PlantRow = {
  id: "p-legacy",
  grow_id: null,
  tent_id: "tent-g1",
  stage: "flower",
};

beforeEach(() => {
  persistMock.mockReset();
  plantsState.value = { data: [], isError: false };
});

function lastPersistFor(growId: string) {
  const calls = persistMock.mock.calls
    .map((c) => c[0] as { growId: string | null; stage: string | null; enabled: boolean })
    .filter((c) => c.growId === growId);
  return calls.at(-1);
}

describe("resolveGrowPlantStages (growAttributionRules order)", () => {
  const tents = [{ id: "tent-g1" }];

  it("counts a plant with no grow_id through its tent in this grow", () => {
    expect(resolveGrowPlantStages([TENT_ROLLED_UP_FLOWER], "g1", tents)).toEqual(["flower"]);
  });

  it("the plant's own grow_id wins over its tent's grow", () => {
    expect(
      resolveGrowPlantStages(
        [
          { grow_id: "g2", tent_id: "tent-g1", stage: "flower" },
          { grow_id: "g1", tent_id: null, stage: "veg" },
        ],
        "g1",
        tents,
      ),
    ).toEqual(["veg"]);
  });

  it("leaves out a grow-less plant in another grow's tent, or in no tent", () => {
    expect(
      resolveGrowPlantStages(
        [
          { grow_id: null, tent_id: "tent-other", stage: "flower" },
          { grow_id: null, tent_id: null, stage: "flower" },
        ],
        "g1",
        tents,
      ),
    ).toEqual([]);
  });

  it("keeps the pending signal: no plant data yet is null, not an empty list", () => {
    expect(resolveGrowPlantStages(null, "g1", tents)).toBeNull();
    expect(resolveGrowPlantStages(undefined, "g1", tents)).toBeUndefined();
  });

  it("missing stages stay null and are never invented", () => {
    expect(
      resolveGrowPlantStages([{ grow_id: "g1", tent_id: null, stage: null }], "g1", tents),
    ).toEqual([null]);
  });
});

describe("resolveSelectedTentPlantStages (Dashboard selection scope)", () => {
  const tents = [{ id: "tent-g1" }, { id: "tent-g1b" }];

  it("a plant naming another grow never counts, even in a selected tent of this grow", () => {
    // Codex review on #1683: the grow-scoped plant read also returns plants by
    // tent, so tent membership alone would let grow B's plant move grow A.
    expect(
      resolveSelectedTentPlantStages(
        [
          { growId: "g2", tentId: "tent-g1", stage: "flower" },
          { growId: "g1", tentId: "tent-g1", stage: "veg" },
        ],
        "g1",
        tents,
        ["tent-g1"],
      ),
    ).toEqual(["veg"]);
  });

  it("a grow-less plant in a selected tent of this grow counts through the tent", () => {
    expect(
      resolveSelectedTentPlantStages(
        [{ growId: null, tentId: "tent-g1", stage: "flower" }],
        "g1",
        tents,
        ["tent-g1"],
      ),
    ).toEqual(["flower"]);
  });

  it("only the selected tents count, and archived plants never do", () => {
    expect(
      resolveSelectedTentPlantStages(
        [
          { growId: "g1", tentId: "tent-g1b", stage: "flower" },
          { growId: "g1", tentId: "tent-g1", stage: "flower", isArchived: true },
          { growId: "g1", tentId: "tent-g1", stage: "veg", isArchived: false },
        ],
        "g1",
        tents,
        ["tent-g1"],
      ),
    ).toEqual(["veg"]);
  });
});

describe("plantsForAlertPersistence", () => {
  const rows = [TENT_ROLLED_UP_FLOWER];

  it("returns the rows of a current, successful read", () => {
    expect(plantsForAlertPersistence({ data: rows, isError: false })).toBe(rows);
    expect(plantsForAlertPersistence({ data: [], isError: false })).toEqual([]);
  });

  it("holds (null) while pending, on placeholder data, and on any failed read", () => {
    expect(plantsForAlertPersistence({ data: undefined, isError: false })).toBeNull();
    expect(plantsForAlertPersistence({ data: rows, isPlaceholderData: true })).toBeNull();
    expect(plantsForAlertPersistence({ data: undefined, isError: true })).toBeNull();
    // A failed refresh keeps cached rows for display; they never decide a write.
    expect(plantsForAlertPersistence({ data: rows, isError: true })).toBeNull();
    // A refetch in flight may be replacing stale rows (Codex review on #1683).
    expect(plantsForAlertPersistence({ data: rows, isFetching: true })).toBeNull();
  });

  it("isCurrentReadForAlertWrite accepts only a settled, successful, current read", () => {
    expect(isCurrentReadForAlertWrite({ data: [], isError: false, isFetching: false })).toBe(true);
    expect(isCurrentReadForAlertWrite({ data: [] })).toBe(true);
    expect(isCurrentReadForAlertWrite({ data: undefined })).toBe(false);
    expect(isCurrentReadForAlertWrite({ data: [], isError: true })).toBe(false);
    expect(isCurrentReadForAlertWrite({ data: [], isFetching: true })).toBe(false);
    expect(isCurrentReadForAlertWrite({ data: [], isPlaceholderData: true })).toBe(false);
  });
});

describe("Alerts judges a grow by its tent-attributed plants", () => {
  it("persists against Flower for a grow-less Flower plant in the grow's Veg tent", async () => {
    plantsState.value = { data: [TENT_ROLLED_UP_FLOWER], isError: false };
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")?.enabled).toBe(true));
    expect(lastPersistFor("g1")?.stage).toBe("flower");
  });

  it("holds persistence while the plant read is pending", async () => {
    plantsState.value = { data: undefined, isError: false };
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")).toBeDefined());
    expect(lastPersistFor("g1")?.enabled).toBe(false);
  });

  it("a failed plant refresh holds persistence; the header keeps the cached stages", async () => {
    // Codex review on #1683: a write needs a current, successful plant read.
    // The cached rows still describe the grow for display.
    plantsState.value = { data: [TENT_ROLLED_UP_FLOWER], isError: true };
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")).toBeDefined());
    expect(lastPersistFor("g1")?.enabled).toBe(false);
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toMatch(/Flower/);
  });

  it.each([
    ["pending", { data: undefined, isError: false }],
    ["failed with no data", { data: undefined, isError: true }],
  ])("the header withholds the stage while the plant read is %s", async (_s, state) => {
    // Codex review on #1683: without the plants the grow's Veg tent alone
    // would claim "Using Veg targets." for a grow whose plant is in Flower.
    plantsState.value = state;
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")).toBeDefined());
    expect(screen.getByTestId("alerts-context-header-stage-pending")).toBeTruthy();
    expect(screen.queryByTestId("alerts-context-header-stage")).toBeNull();
  });

  it("a plant refetch in flight holds persistence (Codex review on #1683)", async () => {
    plantsState.value = { data: [TENT_ROLLED_UP_FLOWER], isError: false, isFetching: true };
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")).toBeDefined());
    expect(lastPersistFor("g1")?.enabled).toBe(false);
  });

  it("a failed plant read holds persistence instead of judging without plants", async () => {
    plantsState.value = { data: undefined, isError: true };
    render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Alerts />
      </MemoryRouter>,
    );
    await waitFor(() => expect(lastPersistFor("g1")).toBeDefined());
    expect(lastPersistFor("g1")?.enabled).toBe(false);
  });

  it("the components roll up tent-attributed plants themselves", () => {
    render(<AlertsAutoPersistForGrow growId="g1" stage="veg" plants={[TENT_ROLLED_UP_FLOWER]} />);
    expect(lastPersistFor("g1")?.stage).toBe("flower");
    render(
      <AlertsContextHeaderForGrow
        growId="g1"
        growName="G1"
        stage="veg"
        plants={[TENT_ROLLED_UP_FLOWER]}
      />,
    );
    expect(screen.getByTestId("alerts-context-header-stage").textContent).toMatch(/Flower/);
  });
});
