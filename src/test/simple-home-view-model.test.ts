/**
 * Simple home — pure view model.
 *
 * Loading is loading, a failed read is an error, "nothing yet" needs a
 * successful empty read, several grows with no selection is a choice (never an
 * arbitrary pick), rows sort deterministically, and recent entries link to
 * their own Timeline anchor.
 */
import { describe, expect, it } from "vitest";
import type { Plant, Tent } from "@/mock";
import type { RecentItem } from "@/lib/growStatus";
import {
  buildSimpleHomePlantRows,
  buildSimpleHomeRecentEntryHref,
  buildSimpleHomeState,
  resolveSimpleHomeGrowId,
  selectSimpleHomeRecentEntries,
  SIMPLE_HOME_RECENT_LIMIT,
  type SimpleHomeInput,
} from "@/lib/simpleHomeViewModel";

const GROW = "11111111-1111-4111-8111-111111111111";
const GROW_2 = "22222222-2222-4222-8222-222222222222";
const TENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const tent: Tent = {
  id: TENT,
  name: "Veg tent",
  brand: "",
  size: "",
  stage: "veg",
  light: { on: true, schedule: "", wattage: 0 },
  alertCount: 0,
  growId: GROW,
};

function plant(overrides: Partial<Plant> & { id: string; name: string }): Plant {
  return {
    strain: "Blue Dream",
    tentId: TENT,
    stage: "veg",
    startedAt: "2026-10-01",
    health: "unknown" as Plant["health"],
    photo: "",
    lastNote: "",
    growId: GROW,
    ...overrides,
  };
}

function input(overrides: Partial<SimpleHomeInput> = {}): SimpleHomeInput {
  return {
    grows: [{ id: GROW, name: "Grow one" }],
    growsLoading: false,
    growsError: null,
    scopedGrowId: null,
    activeGrowId: null,
    tents: { status: "success", rows: [tent] },
    plants: { status: "success", rows: [plant({ id: "p1", name: "Bertha" })] },
    ...overrides,
  };
}

describe("resolveSimpleHomeGrowId", () => {
  const grows = [{ id: GROW }, { id: GROW_2 }];
  it("prefers a valid URL scope, then the stored active grow", () => {
    expect(resolveSimpleHomeGrowId({ grows, scopedGrowId: GROW_2, activeGrowId: GROW })).toBe(
      GROW_2,
    );
    expect(resolveSimpleHomeGrowId({ grows, scopedGrowId: null, activeGrowId: GROW_2 })).toBe(
      GROW_2,
    );
  });
  it("ignores ids the grower does not own", () => {
    expect(
      resolveSimpleHomeGrowId({ grows, scopedGrowId: "nope", activeGrowId: "stale" }),
    ).toBeNull();
  });
  it("uses a lone grow, and asks when there are several with no selection", () => {
    expect(
      resolveSimpleHomeGrowId({ grows: [{ id: GROW }], scopedGrowId: null, activeGrowId: null }),
    ).toBe(GROW);
    expect(resolveSimpleHomeGrowId({ grows, scopedGrowId: null, activeGrowId: null })).toBeNull();
  });
});

describe("buildSimpleHomeState — honest states", () => {
  it("loading grows is loading, not empty", () => {
    expect(buildSimpleHomeState(input({ growsLoading: true, grows: [] }))).toEqual({
      kind: "loading",
      resource: "grows",
    });
  });
  it("a grows read error is an error, not a setup prompt", () => {
    expect(buildSimpleHomeState(input({ growsError: "grows-read-failed", grows: [] })).kind).toBe(
      "grows-error",
    );
    expect(buildSimpleHomeState(input({ grows: null as never })).kind).toBe("grows-error");
  });
  it("no grows after a successful read leads to setup", () => {
    expect(buildSimpleHomeState(input({ grows: [] }))).toEqual({ kind: "no-grow" });
  });
  it("several grows with no selection is a choice with safe hrefs", () => {
    const state = buildSimpleHomeState(
      input({
        grows: [
          { id: GROW, name: " Grow one " },
          { id: GROW_2, name: "" },
        ],
      }),
    );
    expect(state).toEqual({
      kind: "choose-grow",
      grows: [
        { id: GROW, name: "Grow one", href: `/?growId=${GROW}` },
        { id: GROW_2, name: "Untitled grow", href: `/?growId=${GROW_2}` },
      ],
    });
  });
  it("tents pending → loading tents; tents error → error; no tents → add a tent", () => {
    expect(buildSimpleHomeState(input({ tents: { status: "pending", rows: undefined } }))).toEqual({
      kind: "loading",
      resource: "tents",
    });
    expect(buildSimpleHomeState(input({ tents: { status: "error", rows: undefined } }))).toEqual({
      kind: "tents-error",
      growId: GROW,
    });
    expect(buildSimpleHomeState(input({ tents: { status: "success", rows: [] } }))).toEqual({
      kind: "no-tent",
      growId: GROW,
      href: `/tents?growId=${GROW}`,
    });
  });
  it("plants pending → loading plants; plants error → error; none active → add a plant", () => {
    expect(buildSimpleHomeState(input({ plants: { status: "pending", rows: undefined } }))).toEqual(
      {
        kind: "loading",
        resource: "plants",
      },
    );
    expect(buildSimpleHomeState(input({ plants: { status: "error", rows: undefined } }))).toEqual({
      kind: "plants-error",
      growId: GROW,
    });
    expect(
      buildSimpleHomeState(
        input({
          plants: {
            status: "success",
            rows: [plant({ id: "archived", name: "Old", isArchived: true })],
          },
        }),
      ),
    ).toEqual({ kind: "no-plant", growId: GROW, href: `/plants?growId=${GROW}` });
  });
  it("ready carries the grow name, tent count and plant rows", () => {
    const state = buildSimpleHomeState(input());
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.growId).toBe(GROW);
    expect(state.growName).toBe("Grow one");
    expect(state.tentCount).toBe(1);
    expect(state.plants).toHaveLength(1);
  });
});

describe("buildSimpleHomePlantRows", () => {
  it("sorts by name then id, maps tent names, builds hrefs and an explicit plant target", () => {
    const rows = buildSimpleHomePlantRows(
      [
        plant({ id: "p2", name: "zeta" }),
        plant({ id: "p1", name: "Alpha", tentId: "missing-tent" }),
        plant({ id: "p3", name: "alpha", strain: "  " }),
      ],
      [tent],
      GROW,
    );
    expect(rows.map((r) => r.id)).toEqual(["p1", "p3", "p2"]);
    expect(rows[0]).toMatchObject({
      name: "Alpha",
      tentId: "missing-tent",
      tentName: null,
      href: "/plants/p1?tentId=missing-tent",
      tentHref: "/tents/missing-tent",
      quickLogTargetKey: "plant:p1",
    });
    expect(rows[1].strain).toBeNull();
    expect(rows[2]).toMatchObject({ tentName: "Veg tent", href: `/plants/p2?tentId=${TENT}` });
  });
  it("drops archived plants and plants attributed to another grow; tolerates missing fields", () => {
    const rows = buildSimpleHomePlantRows(
      [
        plant({ id: "a", name: "A", isArchived: true }),
        plant({ id: "b", name: "B", growId: GROW_2 }),
        plant({ id: "c", name: "", growId: null, tentId: "" }),
        { id: "", name: "ghost" } as Plant,
      ],
      [tent],
      GROW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "c", name: "Unnamed plant", tentId: null, tentHref: null });
  });
  it("is deterministic", () => {
    const plants = [plant({ id: "p2", name: "B" }), plant({ id: "p1", name: "A" })];
    expect(buildSimpleHomePlantRows(plants, [tent], GROW)).toEqual(
      buildSimpleHomePlantRows([...plants].reverse(), [tent], GROW),
    );
  });
});

describe("recent entries", () => {
  const items: RecentItem[] = [
    {
      id: "grow-event-ge1",
      kind: "diary",
      ts: "2026-10-29T10:00:00Z",
      title: "Quick log (Note)",
      detail: "Leaves perky",
    },
    {
      id: "event-x",
      kind: "action_event",
      ts: "2026-10-29T09:00:00Z",
      title: "approved",
      href: "/actions/x",
    },
    {
      id: "diary-d1",
      kind: "diary",
      ts: "2026-10-28T10:00:00Z",
      title: "Diary entry (veg)",
      detail: null,
    },
  ];
  it("keeps diary rows only and links each to its Timeline anchor", () => {
    const entries = selectSimpleHomeRecentEntries(items, GROW);
    expect(entries.map((e) => e.id)).toEqual(["grow-event-ge1", "diary-d1"]);
    expect(entries[0].href).toBe(`/timeline?growId=${GROW}#timeline-entry-ge1`);
    expect(entries[1].href).toBe(`/timeline?growId=${GROW}#timeline-entry-d1`);
    expect(entries[1].detail).toBeNull();
  });
  it("caps the list", () => {
    const many: RecentItem[] = Array.from({ length: 9 }, (_, i) => ({
      id: `diary-${i}`,
      kind: "diary",
      ts: "2026-10-29T10:00:00Z",
      title: `d${i}`,
    }));
    expect(selectSimpleHomeRecentEntries(many, GROW)).toHaveLength(SIMPLE_HOME_RECENT_LIMIT);
  });
  it("falls back to the grow timeline for unsafe or unknown ids", () => {
    expect(
      buildSimpleHomeRecentEntryHref(
        { id: "diary-bad id", kind: "diary", ts: "", title: "" },
        GROW,
      ),
    ).toBe(`/timeline?growId=${GROW}`);
    expect(
      buildSimpleHomeRecentEntryHref({ id: "other-1", kind: "diary", ts: "", title: "" }, GROW),
    ).toBe(`/timeline?growId=${GROW}`);
    expect(
      buildSimpleHomeRecentEntryHref(
        { id: "other-1", kind: "diary", ts: "", title: "", href: "/actions/1" },
        GROW,
      ),
    ).toBe("/actions/1");
  });
});
