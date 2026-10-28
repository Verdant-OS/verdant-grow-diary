/**
 * VER-300 — alert targets on archived, removed and inaccessible tents/plants.
 *
 * Pins:
 *   - The name lookup reads archived rows, so an alert on an archived tent or
 *     plant keeps its real name ("Archived tent: <name>") and is flagged historical.
 *   - An id the completed owner-scoped read did not return (deleted after the
 *     alert, or not this account's) reads "Tent removed" — no
 *     invented name, no UUID, and no link to a page that will not load.
 *   - A failed, still-loading or server-capped read never claims "removed".
 *   - A tent deleted outright leaves alerts.tent_id NULL (ON DELETE SET NULL),
 *     so the existing unavailable copy and sole-active-tent fallback apply.
 *   - The sole-tent fallback still counts non-archived tents only.
 *   - "Why this alert?" names a missing target *range*, not a missing tent.
 *
 * Asserts resolved hook state and rendered output, not source text.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import { useAlertTargetNames } from "@/hooks/useAlertTargetNames";
import {
  ALERT_TARGET_HISTORICAL_NOTE,
  ALERT_TARGET_NAME_UNAVAILABLE_LABEL,
  ALERT_TARGET_REMOVED_LABEL,
  partitionAlertsByTargetHistory,
  ALERT_TARGET_UNAVAILABLE_TEXT,
  buildAlertTargetPresenterInput,
  deriveAlertTargetContext,
  type AlertTargetRecordState,
} from "@/lib/alertTargetContextRules";
import { AlertTargetContext } from "@/components/AlertTargetContext";
import { deriveAlertWhyContext } from "@/lib/alertWhyContext";

type TablePayload = { data: unknown; error: unknown; count?: number | null };

// snip:safe — the mock honours .eq() so a server-side archive filter is visible to the test.
const supabaseState = vi.hoisted(() => ({
  tables: {} as Record<string, TablePayload>,
  selects: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: (columns: string) => {
          supabaseState.selects.push({ table, columns });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        then: (resolve: (value: TablePayload) => unknown) => {
          const payload = supabaseState.tables[table] ?? { data: [], error: null };
          const data = Array.isArray(payload.data)
            ? (payload.data as Array<Record<string, unknown>>).filter((row) =>
                filters.every(([column, value]) => row[column] === value),
              )
            : payload.data;
          const count =
            payload.count !== undefined ? payload.count : Array.isArray(data) ? data.length : null;
          return Promise.resolve({ data, error: payload.error, count }).then(resolve);
        },
      };
      return builder;
    },
  },
}));

const GROW = "44444444-4444-4444-8444-444444444444";
const GROW_ARCHIVED_ONLY = "55555555-5555-4555-8555-555555555555";
const TENT_ACTIVE = "11111111-1111-4111-8111-111111111111";
const TENT_ARCHIVED = "22222222-2222-4222-8222-222222222222";
const TENT_ARCHIVED_SOLO = "99999999-9999-4999-8999-999999999999";
const TENT_GONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLANT_ACTIVE = "33333333-3333-4333-8333-333333333333";
const PLANT_ARCHIVED = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  supabaseState.tables = {};
  supabaseState.selects = [];
});

function seedOwnerRows() {
  supabaseState.tables.tents = {
    data: [
      { id: TENT_ACTIVE, name: "Veg Tent", grow_id: GROW, is_archived: false },
      { id: TENT_ARCHIVED, name: "Old Flower Tent", grow_id: GROW, is_archived: true },
      { id: TENT_ARCHIVED_SOLO, name: "Retired", grow_id: GROW_ARCHIVED_ONLY, is_archived: true },
    ],
    error: null,
  };
  supabaseState.tables.plants = {
    data: [
      { id: PLANT_ACTIVE, name: "Keeper A", is_archived: false },
      { id: PLANT_ARCHIVED, name: "Culled Pheno #3", is_archived: true },
    ],
    error: null,
  };
}

describe("useAlertTargetNames — archived rows stay readable", () => {
  it("keeps archived tent and plant names and reports their state", async () => {
    seedOwnerRows();
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));

    expect(result.current.tentNameById.get(TENT_ARCHIVED)).toBe("Old Flower Tent");
    expect(result.current.plantNameById.get(PLANT_ARCHIVED)).toBe("Culled Pheno #3");
    expect(result.current.tentStateById.get(TENT_ARCHIVED)).toBe("archived");
    expect(result.current.tentStateById.get(TENT_ACTIVE)).toBe("active");
    expect(result.current.plantStateById.get(PLANT_ARCHIVED)).toBe("archived");
    expect(result.current.plantStateById.get(PLANT_ACTIVE)).toBe("active");
    expect(result.current.tentStateById.has(TENT_GONE)).toBe(false);
  });

  it("reads only id, name, grow_id and is_archived — never other columns", async () => {
    seedOwnerRows();
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(supabaseState.selects).toEqual([
      { table: "tents", columns: "id,name,grow_id,is_archived" },
      { table: "plants", columns: "id,name,is_archived" },
    ]);
  });

  it("sole-tent fallback still counts non-archived tents only", async () => {
    seedOwnerRows();
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    // GROW has one active + one archived tent → the active one is the sole tent.
    expect(result.current.singleTentIdByGrowId.get(GROW)).toBe(TENT_ACTIVE);
    // A grow whose only tent is archived gets no fallback.
    expect(result.current.singleTentIdByGrowId.has(GROW_ARCHIVED_ONLY)).toBe(false);
  });

  it("a complete counted read is marked complete", async () => {
    seedOwnerRows();
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.readComplete).toBe(true);
  });

  it("a capped read (fewer rows than the count) never lets an absent id read as removed", async () => {
    seedOwnerRows();
    // The server returned 3 tents but reports 1,200: later rows were cut off.
    supabaseState.tables.tents = { ...supabaseState.tables.tents, count: 1200 };
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.readComplete).toBe(false);

    const ctx = deriveAlertTargetContext(
      buildAlertTargetPresenterInput({
        tentId: TENT_GONE,
        growId: GROW,
        tentNameById: result.current.tentNameById,
        plantNameById: result.current.plantNameById,
        tentStateById: result.current.tentStateById,
        plantStateById: result.current.plantStateById,
        singleTentIdByGrowId: result.current.singleTentIdByGrowId,
        namesReady: result.current.status === "ok" && result.current.readComplete,
      }),
    );
    expect(ctx.text).toBe(`Tent: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`);
    expect(ctx.tentState).toBeNull();
    expect(ctx.historical).toBe(false);
    // Archived rows that were returned still keep their names.
    expect(result.current.tentStateById.get(TENT_ARCHIVED)).toBe("archived");
  });

  it("a read with no count is treated as incomplete", async () => {
    seedOwnerRows();
    supabaseState.tables.plants = { ...supabaseState.tables.plants, count: null };
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.readComplete).toBe(false);
  });

  it("a read error clears state maps as well as names", async () => {
    supabaseState.tables.tents = { data: null, error: { message: "denied" } };
    const { result } = renderHook(() => useAlertTargetNames());
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.tentStateById.size).toBe(0);
    expect(result.current.plantStateById.size).toBe(0);
    expect(result.current.readComplete).toBe(false);
  });
});

const NAMES = {
  tentNameById: new Map([
    [TENT_ACTIVE, "Veg Tent"],
    [TENT_ARCHIVED, "Old Flower Tent"],
  ]),
  plantNameById: new Map([
    [PLANT_ACTIVE, "Keeper A"],
    [PLANT_ARCHIVED, "Culled Pheno #3"],
  ]),
  tentStateById: new Map<string, AlertTargetRecordState>([
    [TENT_ACTIVE, "active"],
    [TENT_ARCHIVED, "archived"],
  ]),
  plantStateById: new Map<string, AlertTargetRecordState>([
    [PLANT_ACTIVE, "active"],
    [PLANT_ARCHIVED, "archived"],
  ]),
  singleTentIdByGrowId: new Map([[GROW, TENT_ACTIVE]]),
};

function targetFor(
  ids: { tentId?: string | null; plantId?: string | null; growId?: string | null },
  overrides: Partial<Parameters<typeof buildAlertTargetPresenterInput>[0]> = {},
) {
  const input = buildAlertTargetPresenterInput({
    ...NAMES,
    namesReady: true,
    namesLoading: false,
    ...ids,
    ...overrides,
  });
  return { input, ctx: deriveAlertTargetContext(input) };
}

describe("alert target labels by record state", () => {
  it("active tent + plant → names, not historical", () => {
    const { ctx } = targetFor({ tentId: TENT_ACTIVE, plantId: PLANT_ACTIVE, growId: GROW });
    expect(ctx.text).toBe("Tent: Veg Tent · Plant: Keeper A");
    expect(ctx.kind).toBe("located");
    expect(ctx.historical).toBe(false);
  });

  it("archived tent → real name marked archived, historical", () => {
    const { ctx } = targetFor({ tentId: TENT_ARCHIVED, growId: GROW });
    expect(ctx.text).toBe("Archived tent: Old Flower Tent");
    expect(ctx.text).not.toContain(ALERT_TARGET_NAME_UNAVAILABLE_LABEL);
    expect(ctx.kind).toBe("located");
    expect(ctx.tentState).toBe("archived");
    expect(ctx.historical).toBe(true);
  });

  it("archived plant in an active tent → both named, historical", () => {
    const { ctx } = targetFor({ tentId: TENT_ACTIVE, plantId: PLANT_ARCHIVED, growId: GROW });
    expect(ctx.text).toBe("Tent: Veg Tent · Archived plant: Culled Pheno #3");
    expect(ctx.historical).toBe(true);
  });

  it("id the completed read did not return → Tent removed, never a UUID", () => {
    const { ctx } = targetFor({ tentId: TENT_GONE, growId: GROW });
    expect(ctx.text).toBe(ALERT_TARGET_REMOVED_LABEL.Tent);
    expect(ctx.text).not.toContain(TENT_GONE);
    expect(ctx.kind).toBe("names_unavailable");
    expect(ctx.tentState).toBe("missing");
    expect(ctx.historical).toBe(true);
  });

  it("another account's plant id (RLS returns no row) reads the same as removed", () => {
    const foreignPlant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { ctx } = targetFor({ tentId: TENT_ACTIVE, plantId: foreignPlant, growId: GROW });
    expect(ctx.text).toBe(`Tent: Veg Tent · ${ALERT_TARGET_REMOVED_LABEL.Plant}`);
    expect(ctx.plantLabel).toBeNull();
    expect(ctx.historical).toBe(true);
  });

  it("deleted tent (FK set alert tent_id NULL) with no other tent → unavailable copy", () => {
    const { ctx } = targetFor({ tentId: null, plantId: null, growId: GROW_ARCHIVED_ONLY });
    expect(ctx.kind).toBe("unavailable");
    expect(ctx.text).toBe(ALERT_TARGET_UNAVAILABLE_TEXT);
    expect(ctx.historical).toBe(false);
  });

  it("missing tent_id keeps the existing single-active-tent fallback", () => {
    const { ctx } = targetFor({ tentId: null, plantId: null, growId: GROW });
    expect(ctx.tentId).toBe(TENT_ACTIVE);
    expect(ctx.text).toBe("Tent: Veg Tent");
    expect(ctx.historical).toBe(false);
  });

  it("a failed read never claims removed", () => {
    const { ctx } = targetFor(
      { tentId: TENT_GONE, growId: GROW },
      {
        tentNameById: new Map(),
        tentStateById: new Map(),
        namesReady: false,
      },
    );
    expect(ctx.text).toBe(`Tent: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`);
    expect(ctx.tentState).toBeNull();
    expect(ctx.historical).toBe(false);
  });

  it("a still-loading read shows loading, not removed", () => {
    const { ctx } = targetFor(
      { tentId: TENT_GONE, growId: GROW },
      { namesReady: false, namesLoading: true },
    );
    expect(ctx.kind).toBe("loading");
    expect(ctx.historical).toBe(false);
  });

  it("callers without state maps keep the previous Name unavailable copy", () => {
    const { ctx } = targetFor(
      { tentId: TENT_GONE, growId: GROW },
      { tentStateById: undefined, plantStateById: undefined },
    );
    expect(ctx.text).toBe(`Tent: ${ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`);
    expect(ctx.historical).toBe(false);
  });

  it("is deterministic for the same input", () => {
    const a = targetFor({ tentId: TENT_ARCHIVED, plantId: PLANT_ACTIVE, growId: GROW }).ctx;
    const b = targetFor({ tentId: TENT_ARCHIVED, plantId: PLANT_ACTIVE, growId: GROW }).ctx;
    expect(a).toEqual(b);
  });
});

describe("AlertTargetContext — historical targets are set apart", () => {
  it("compact: archived target shows the historical note", () => {
    const { input } = targetFor({ tentId: TENT_ARCHIVED, growId: GROW });
    render(<AlertTargetContext {...input} variant="compact" />);
    expect(screen.getByTestId("alert-target-compact").dataset.historical).toBe("true");
    expect(screen.getByTestId("alert-target-historical-note").textContent).toContain(
      ALERT_TARGET_HISTORICAL_NOTE,
    );
  });

  it("compact: active target has no historical note", () => {
    const { input } = targetFor({ tentId: TENT_ACTIVE, growId: GROW });
    render(<AlertTargetContext {...input} variant="compact" />);
    expect(screen.getByTestId("alert-target-compact").dataset.historical).toBe("false");
    expect(screen.queryByTestId("alert-target-historical-note")).toBeNull();
  });

  it("detailed: archived tent keeps its link; removed plant is plain text", () => {
    const missingPlant = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { input } = targetFor({ tentId: TENT_ARCHIVED, plantId: missingPlant, growId: GROW });
    render(
      <MemoryRouter>
        <dl>
          <AlertTargetContext
            {...input}
            variant="detailed"
            tentHref={`/tents/${TENT_ARCHIVED}`}
            plantHref={`/plants/${missingPlant}`}
          />
        </dl>
      </MemoryRouter>,
    );
    const tent = screen.getByTestId("alert-detail-tent-label");
    expect(tent.textContent).toBe("Archived tent: Old Flower Tent");
    expect(tent.tagName).toBe("A");
    const plant = screen.getByTestId("alert-detail-plant-label");
    expect(plant.textContent).toBe(ALERT_TARGET_REMOVED_LABEL.Plant);
    expect(plant.tagName).toBe("SPAN");
    expect(screen.getByTestId("alert-target-historical-note")).toBeTruthy();
  });
});

describe("Why this alert? — missing range is not a missing tent", () => {
  it("unavailable copy names the target range", () => {
    const why = deriveAlertWhyContext(
      { title: "Humidity high", metric: "rh", reason: "" },
      "celsius",
    );
    expect(why.kind).toBe("unavailable");
    expect(why.text).toBe("Target range not recorded for this alert.");
    expect(why.text).not.toMatch(/tent|plant/i);
  });
});

describe("partitionAlertsByTargetHistory", () => {
  it("splits current from historical, keeping order, without changing alerts", () => {
    const alerts = [
      { id: "a", historical: false },
      { id: "b", historical: true },
      { id: "c", historical: false },
      { id: "d", historical: true },
    ];
    const snapshot = JSON.stringify(alerts);
    const { current, historical } = partitionAlertsByTargetHistory(alerts, (a) => a.historical);
    expect(current.map((a) => a.id)).toEqual(["a", "c"]);
    expect(historical.map((a) => a.id)).toEqual(["b", "d"]);
    expect(JSON.stringify(alerts)).toBe(snapshot);
  });

  it("handles an empty list", () => {
    expect(partitionAlertsByTargetHistory([], () => true)).toEqual({ current: [], historical: [] });
  });
});
