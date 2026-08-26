/**
 * timelineEvidenceFilterRules — pure helper tests.
 *
 * Covers: keyword search (case-insensitive, trimmed), plant/tent/log-type
 * filters, combined narrowing, clear restores all, original ordering,
 * results count, derived options, and safety scope of search fields.
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelineNameLookup,
  buildTimelinePlantTentLookup,
  deriveTimelineEventTypeOptions,
  deriveTimelinePlantOptions,
  deriveTimelineTentOptions,
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
  timelineEvidenceRowMatches,
  TIMELINE_EVIDENCE_EMPTY_DESC,
  TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER,
} from "@/lib/timelineEvidenceFilterRules";

const ROWS = [
  {
    id: "r1",
    note: "Watered with 500ml",
    stage: "veg",
    plant_id: "p1",
    tent_id: "t1",
    details: { event_type: "watering", plant_name: "Blue Dream" },
  },
  {
    id: "r2",
    note: "Fed nutrients today",
    stage: "veg",
    plant_id: "p2",
    tent_id: "t1",
    details: { event_type: "feeding", plant_name: "Northern Lights" },
  },
  {
    id: "r3",
    note: "Took a photo of leaf yellowing",
    stage: "flower",
    plant_id: "p1",
    tent_id: "t2",
    details: { event_type: "note", plant_name: "Blue Dream" },
  },
  {
    id: "r4",
    note: null,
    stage: null,
    plant_id: null,
    tent_id: null,
    details: null,
  },
];

describe("filterTimelineEvidenceRows — empty input", () => {
  it("returns all rows when no filters are active", () => {
    const out = filterTimelineEvidenceRows(ROWS, {});
    expect(out.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4"]);
  });
  it("returns [] for empty input array", () => {
    expect(filterTimelineEvidenceRows([], { query: "x" })).toEqual([]);
  });
});

describe("keyword search", () => {
  it("matches case-insensitively against note text", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "WATERED" });
    expect(out.map((r) => r.id)).toEqual(["r1"]);
  });
  it("trims whitespace from query", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "   nutrients   " });
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
  it("matches plant name from details", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "blue dream" });
    expect(out.map((r) => r.id)).toEqual(["r1", "r3"]);
  });
  it("matches event_type token", () => {
    const out = filterTimelineEvidenceRows(ROWS, { query: "feeding" });
    expect(out.map((r) => r.id)).toEqual(["r2"]);
  });
  it("empty/whitespace query is a no-op", () => {
    expect(filterTimelineEvidenceRows(ROWS, { query: "   " })).toHaveLength(4);
  });
});

describe("dimension filters", () => {
  it("plant filter narrows to that plant id", () => {
    expect(filterTimelineEvidenceRows(ROWS, { plantId: "p1" }).map((r) => r.id)).toEqual([
      "r1",
      "r3",
    ]);
  });
  it("tent filter narrows to that tent id", () => {
    expect(filterTimelineEvidenceRows(ROWS, { tentId: "t1" }).map((r) => r.id)).toEqual([
      "r1",
      "r2",
    ]);
  });
  it("log type filter narrows to that event_type", () => {
    expect(filterTimelineEvidenceRows(ROWS, { eventType: "note" }).map((r) => r.id)).toEqual([
      "r3",
    ]);
  });
  it("combined filters AND-narrow results", () => {
    expect(
      filterTimelineEvidenceRows(ROWS, {
        plantId: "p1",
        tentId: "t1",
        eventType: "watering",
        query: "500",
      }).map((r) => r.id),
    ).toEqual(["r1"]);
  });
  it("preserves original row ordering", () => {
    const reordered = [ROWS[2], ROWS[0], ROWS[1], ROWS[3]];
    const out = filterTimelineEvidenceRows(reordered, { plantId: "p1" });
    expect(out.map((r) => r.id)).toEqual(["r3", "r1"]);
  });

  it("keeps only the requested plant when two plants share one sensor source", () => {
    const sameSourceRows = [
      {
        ...ROWS[0],
        id: "plant-a-csv",
        plant_id: "plant-a",
        details: {
          event_type: "sensor_snapshot",
          sensor_snapshot: { source: "csv" },
        },
      },
      {
        ...ROWS[1],
        id: "plant-b-csv",
        plant_id: "plant-b",
        details: {
          event_type: "sensor_snapshot",
          sensor_snapshot: { source: "csv" },
        },
      },
    ];

    expect(
      filterTimelineEvidenceRows(sameSourceRows, {
        plantId: "plant-a",
        sensorSources: ["csv"],
      }).map((row) => row.id),
    ).toEqual(["plant-a-csv"]);
    expect(
      filterTimelineEvidenceRows(sameSourceRows, {
        plantId: "unknown-plant",
        sensorSources: ["csv"],
      }),
    ).toEqual([]);
    expect(
      filterTimelineEvidenceRows(sameSourceRows, {
        plantId: null,
        sensorSources: ["csv"],
      }).map((row) => row.id),
    ).toEqual(["plant-a-csv", "plant-b-csv"]);
  });
});

describe("safe search scope", () => {
  it("does NOT search raw_payload or secret-like detail blobs", () => {
    const rows = [
      {
        id: "x",
        note: "safe note",
        stage: null,
        plant_id: null,
        tent_id: null,
        details: {
          event_type: "note",
          raw_payload: { PASSKEY: "vbt_supersecret", Authorization: "Bearer abc" },
          ingest_url: "https://bridge.example.com/?PASSKEY=vbt_xyz",
        },
      },
    ];
    expect(filterTimelineEvidenceRows(rows, { query: "PASSKEY" })).toHaveLength(0);
    expect(filterTimelineEvidenceRows(rows, { query: "vbt_" })).toHaveLength(0);
    expect(filterTimelineEvidenceRows(rows, { query: "Bearer" })).toHaveLength(0);
    expect(filterTimelineEvidenceRows(rows, { query: "bridge.example.com" })).toHaveLength(0);
    // The safe field still matches.
    expect(filterTimelineEvidenceRows(rows, { query: "safe note" })).toHaveLength(1);
  });
});

describe("isTimelineEvidenceFilterActive", () => {
  it("false for empty input", () => {
    expect(isTimelineEvidenceFilterActive({})).toBe(false);
    expect(isTimelineEvidenceFilterActive({ query: "  " })).toBe(false);
  });
  it("true when any dimension is set", () => {
    expect(isTimelineEvidenceFilterActive({ query: "x" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ plantId: "p" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ tentId: "t" })).toBe(true);
    expect(isTimelineEvidenceFilterActive({ eventType: "n" })).toBe(true);
  });
});

describe("derived option lists", () => {
  it("deriveTimelinePlantOptions groups + sorts by label", () => {
    const opts = deriveTimelinePlantOptions(ROWS);
    expect(opts.map((o) => o.id)).toEqual(["p1", "p2"]);
    expect(opts[0]).toMatchObject({ label: "Blue Dream", count: 2 });
    expect(opts[1]).toMatchObject({ label: "Northern Lights", count: 1 });
  });
  it("deriveTimelineTentOptions falls back to id slice when no name map", () => {
    const opts = deriveTimelineTentOptions(ROWS);
    expect(opts.map((o) => o.id).sort()).toEqual(["t1", "t2"]);
    expect(opts.find((o) => o.id === "t1")?.label).toMatch(/^Tent /);
  });
  it("deriveTimelineTentOptions uses provided name map", () => {
    const names = new Map<string, string>([
      ["t1", "Veg Tent"],
      ["t2", "Flower Tent"],
    ]);
    const opts = deriveTimelineTentOptions(ROWS, names);
    expect(opts).toEqual([
      { id: "t2", label: "Flower Tent", count: 1 },
      { id: "t1", label: "Veg Tent", count: 2 },
    ]);
  });
  it("deriveTimelineEventTypeOptions enumerates distinct event types", () => {
    const opts = deriveTimelineEventTypeOptions(ROWS);
    expect(opts.map((o) => o.id)).toEqual(["feeding", "note", "watering"]);
  });
});

describe("archived/merged name resolution (presenter)", () => {
  // Diary rows referencing an archived plant/tent: no snapshot name in
  // details, entity absent from the active-entity queries. The directory
  // lookup (loaded without the is_archived filter) must still label them.
  const ARCHIVED_ROWS = [
    {
      id: "a1",
      note: "Watered before archive",
      stage: "veg",
      plant_id: "5d7206aa-0000-4000-8000-000000000001",
      tent_id: "6b1faabb-0000-4000-8000-000000000002",
      details: { event_type: "watering" },
    },
    {
      id: "a2",
      note: "Second log",
      stage: "veg",
      plant_id: "5d7206aa-0000-4000-8000-000000000001",
      tent_id: "6b1faabb-0000-4000-8000-000000000002",
      details: { event_type: "note" },
    },
  ];

  it("plant label resolves from the directory when the plant is archived/merged", () => {
    const directory = new Map([["5d7206aa-0000-4000-8000-000000000001", "Project McDonald #3"]]);
    const opts = deriveTimelinePlantOptions(ARCHIVED_ROWS, directory);
    expect(opts).toEqual([
      { id: "5d7206aa-0000-4000-8000-000000000001", label: "Project McDonald #3", count: 2 },
    ]);
  });

  it("tent label resolves from the directory when the tent is archived", () => {
    const directory = new Map([["6b1faabb-0000-4000-8000-000000000002", "Retired 4x4"]]);
    const opts = deriveTimelineTentOptions(ARCHIVED_ROWS, directory);
    expect(opts).toEqual([
      { id: "6b1faabb-0000-4000-8000-000000000002", label: "Retired 4x4", count: 2 },
    ]);
  });

  it("directory name wins over the row's snapshot plant_name (rename-aware)", () => {
    const directory = new Map([["p1", "Blue Dream (renamed)"]]);
    const opts = deriveTimelinePlantOptions(ROWS, directory);
    expect(opts.find((o) => o.id === "p1")?.label).toBe("Blue Dream (renamed)");
    // p2 is absent from the directory but keeps its snapshot name.
    expect(opts.find((o) => o.id === "p2")?.label).toBe("Northern Lights");
  });

  it("keeps a neutral fragment fallback for unresolvable ids — never asserts an archival state", () => {
    // A loaded-but-unresolving directory covers hard-deleted tents
    // (deleteTent preserves logs) and entities created after the
    // directory snapshot; archived rows resolve normally, so claiming
    // "Archived …" here would be wrong.
    const emptyDirectory = new Map<string, string>();
    expect(deriveTimelinePlantOptions(ARCHIVED_ROWS, emptyDirectory)[0]?.label).toBe(
      "Plant 5d7206",
    );
    expect(deriveTimelineTentOptions(ARCHIVED_ROWS, emptyDirectory)[0]?.label).toBe("Tent 6b1faa");
  });

  it("keeps the same neutral fragment label while the directory is unavailable (null/undefined)", () => {
    expect(deriveTimelinePlantOptions(ARCHIVED_ROWS)[0]?.label).toBe("Plant 5d7206");
    expect(deriveTimelinePlantOptions(ARCHIVED_ROWS, null)[0]?.label).toBe("Plant 5d7206");
    expect(deriveTimelineTentOptions(ARCHIVED_ROWS, null)[0]?.label).toBe("Tent 6b1faa");
  });
});

describe("buildTimelineNameLookup", () => {
  it("returns null (lookup unavailable) for non-array input", () => {
    expect(buildTimelineNameLookup(null)).toBeNull();
    expect(buildTimelineNameLookup(undefined)).toBeNull();
    expect(buildTimelineNameLookup({})).toBeNull();
    expect(buildTimelineNameLookup("rows")).toBeNull();
  });

  it("builds a trimmed id → name map and skips malformed rows", () => {
    const lookup = buildTimelineNameLookup([
      { id: " p1 ", name: "  Blue Dream  " },
      { id: "p2", name: "" },
      { id: "", name: "No id" },
      { id: "p3" },
      { id: "p4", name: 42 },
      null,
      "junk",
      { id: "p5", name: "Kept" },
    ]);
    expect(lookup).not.toBeNull();
    expect(lookup?.size).toBe(2);
    expect(lookup?.get("p1")).toBe("Blue Dream");
    expect(lookup?.get("p5")).toBe("Kept");
  });

  it("is deterministic: first name wins on duplicate ids, empty array → empty map", () => {
    const lookup = buildTimelineNameLookup([
      { id: "p1", name: "First" },
      { id: "p1", name: "Second" },
    ]);
    expect(lookup?.get("p1")).toBe("First");
    expect(buildTimelineNameLookup([])?.size).toBe(0);
  });
});

describe("buildTimelinePlantTentLookup", () => {
  const PLANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const PLANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const PLANT_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const TENT_A = "11111111-1111-4111-8111-111111111111";
  const TENT_B = "22222222-2222-4222-8222-222222222222";
  const TENT_C = "55555555-5555-4555-8555-555555555555";
  const GROW_A = "33333333-3333-4333-8333-333333333333";
  const GROW_B = "44444444-4444-4444-8444-444444444444";

  it("returns null for an unavailable source and an empty map for an empty read", () => {
    expect(buildTimelinePlantTentLookup(null, [], GROW_A)).toBeNull();
    expect(buildTimelinePlantTentLookup([], undefined, GROW_A)).toBeNull();
    expect(buildTimelinePlantTentLookup({}, [], GROW_A)).toBeNull();
    expect(buildTimelinePlantTentLookup([], [], "grow-placeholder")).toBeNull();
    expect(buildTimelinePlantTentLookup([], [], GROW_A)?.size).toBe(0);
  });

  it("keeps only normalized relationships in the active grow", () => {
    const lookup = buildTimelinePlantTentLookup(
      [
        {
          id: ` ${PLANT_A.toUpperCase()} `,
          tent_id: ` ${TENT_A.toUpperCase()} `,
          grow_id: ` ${GROW_A.toUpperCase()} `,
        },
        { id: PLANT_B, tent_id: TENT_B, grow_id: null },
        { id: "plant-placeholder", tent_id: TENT_A, grow_id: GROW_A },
        { id: PLANT_A, tent_id: null, grow_id: GROW_A },
        { id: PLANT_B, tent_id: "tent-placeholder", grow_id: GROW_A },
        null,
        "junk",
      ],
      [
        { id: TENT_A, grow_id: GROW_A },
        { id: TENT_B, grow_id: GROW_A },
      ],
      GROW_A,
    );

    expect(lookup).not.toBeNull();
    expect([...(lookup?.entries() ?? [])]).toEqual([
      [PLANT_A, TENT_A],
      [PLANT_B, TENT_B],
    ]);
  });

  it("is deterministic: the first valid relationship wins", () => {
    const lookup = buildTimelinePlantTentLookup(
      [
        { id: PLANT_A, tent_id: null },
        { id: PLANT_A, tent_id: TENT_A, grow_id: GROW_A },
        { id: PLANT_A, tent_id: TENT_B, grow_id: GROW_A },
      ],
      [
        { id: TENT_A, grow_id: GROW_A },
        { id: TENT_B, grow_id: GROW_A },
      ],
      GROW_A,
    );

    expect(lookup?.get(PLANT_A)).toBe(TENT_A);
  });

  it("omits a syntactically valid plant tent that is absent from the owner's tent rows", () => {
    const lookup = buildTimelinePlantTentLookup(
      [{ id: PLANT_A, tent_id: TENT_B, grow_id: GROW_A }],
      [{ id: TENT_A, grow_id: GROW_A }],
      GROW_A,
    );

    expect(lookup?.has(PLANT_A)).toBe(false);
  });

  it("fails closed for a direct plant grow conflict or a tent in another grow", () => {
    const lookup = buildTimelinePlantTentLookup(
      [
        { id: PLANT_A, tent_id: TENT_A, grow_id: GROW_B },
        { id: PLANT_B, tent_id: TENT_B, grow_id: null },
        { id: PLANT_C, tent_id: TENT_B, grow_id: GROW_A },
      ],
      [
        { id: TENT_A, grow_id: GROW_A },
        { id: TENT_B, grow_id: GROW_B },
      ],
      GROW_A,
    );

    expect(lookup?.has(PLANT_A)).toBe(false);
    expect(lookup?.has(PLANT_B)).toBe(false);
    expect(lookup?.has(PLANT_C)).toBe(false);
  });

  it("does not roll malformed direct grow attribution through an otherwise matching tent", () => {
    const lookup = buildTimelinePlantTentLookup(
      [{ id: PLANT_A, tent_id: TENT_A, grow_id: "grow-placeholder" }],
      [{ id: TENT_A, grow_id: GROW_A }],
      GROW_A,
    );

    expect(lookup?.has(PLANT_A)).toBe(false);
  });

  it("omits relationships when tent grow lineage is null or malformed", () => {
    for (const tentGrowId of [null, "grow-placeholder"]) {
      const lookup = buildTimelinePlantTentLookup(
        [{ id: PLANT_A, tent_id: TENT_C, grow_id: GROW_A }],
        [{ id: TENT_C, grow_id: tentGrowId }],
        GROW_A,
      );

      expect(lookup?.has(PLANT_A)).toBe(false);
    }
  });
});

describe("timelineEvidenceRowMatches — direct predicate", () => {
  it("returns false for null/undefined row", () => {
    expect(
      timelineEvidenceRowMatches(
        null as unknown as Parameters<typeof timelineEvidenceRowMatches>[0],
        { query: "x" },
      ),
    ).toBe(false);
  });
});

describe("exported copy", () => {
  it("placeholder and empty copy are stable", () => {
    expect(TIMELINE_EVIDENCE_SEARCH_PLACEHOLDER).toBe("Search timeline");
    expect(TIMELINE_EVIDENCE_EMPTY_DESC).toBe("No timeline entries match these filters.");
  });
});
