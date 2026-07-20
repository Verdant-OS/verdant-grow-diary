import { describe, expect, it } from "vitest";
import {
  buildConnectedActivationRoutes,
  isOneTentActivationIntent,
  ONE_TENT_ACTIVATION_INTENT,
  selectConnectedOneTentGraph,
  summarizeConnectedActivationEvidence,
  type ConnectedActivationDiaryEntryRow,
  type ConnectedActivationGrowEventRow,
} from "@/lib/connectedOneTentActivationRules";

const grows = [{ id: "grow-b" }, { id: "grow-a" }];
const tents = [
  { id: "tent-b", growId: "grow-b" },
  { id: "tent-a2", growId: "grow-a" },
  { id: "tent-a1", growId: "grow-a" },
];
const plants = [
  { id: "plant-b", growId: "grow-b", tentId: "tent-b" },
  { id: "plant-a2", growId: "grow-a", tentId: "tent-a2" },
  { id: "plant-a1", growId: "grow-a", tentId: "tent-a2" },
];

describe("selectConnectedOneTentGraph", () => {
  it("selects the deepest graph with lexical tie-breakers", () => {
    expect(selectConnectedOneTentGraph({ grows, tents, plants })).toEqual({
      growId: "grow-a",
      tentId: "tent-a2",
      plantId: "plant-a1",
      hasGrow: true,
      hasTent: true,
      hasPlant: true,
    });
  });

  it("honors an existing preferred grow", () => {
    expect(
      selectConnectedOneTentGraph({
        grows,
        tents,
        plants,
        preferredGrowId: "grow-b",
      }),
    ).toMatchObject({ growId: "grow-b", tentId: "tent-b", plantId: "plant-b" });
  });

  it("does not combine unrelated grow, tent, and plant rows", () => {
    expect(
      selectConnectedOneTentGraph({
        grows: [{ id: "grow-a" }],
        tents: [{ id: "tent-x", growId: "grow-x" }],
        plants: [{ id: "plant-x", growId: "grow-a", tentId: "tent-x" }],
      }),
    ).toEqual({
      growId: "grow-a",
      tentId: null,
      plantId: null,
      hasGrow: true,
      hasTent: false,
      hasPlant: false,
    });
  });

  it("does not infer legacy null or mismatched plant relationships", () => {
    expect(
      selectConnectedOneTentGraph({
        grows: [{ id: "grow-a" }],
        tents: [{ id: "tent-a", growId: "grow-a" }],
        plants: [
          { id: "null-grow", growId: null, tentId: "tent-a" },
          { id: "null-tent", growId: "grow-a", tentId: null },
          { id: "wrong-grow", growId: "grow-b", tentId: "tent-a" },
        ],
      }),
    ).toMatchObject({
      growId: "grow-a",
      tentId: "tent-a",
      plantId: null,
      hasPlant: false,
    });
  });

  it("is deterministic when input order changes", () => {
    const forward = selectConnectedOneTentGraph({ grows, tents, plants });
    const reversed = selectConnectedOneTentGraph({
      grows: [...grows].reverse(),
      tents: [...tents].reverse(),
      plants: [...plants].reverse(),
    });
    expect(reversed).toEqual(forward);
  });

  it("ignores missing and blank IDs without throwing", () => {
    expect(
      selectConnectedOneTentGraph({
        grows: [null, {}, { id: "  " }],
        tents: [undefined, { id: "tent", growId: null }],
        plants: [{ id: "plant", growId: "grow", tentId: "" }],
        preferredGrowId: " ",
      }),
    ).toEqual({
      growId: null,
      tentId: null,
      plantId: null,
      hasGrow: false,
      hasTent: false,
      hasPlant: false,
    });
  });
});

describe("buildConnectedActivationRoutes", () => {
  it("recognizes only the exact stable activation intent", () => {
    expect(ONE_TENT_ACTIVATION_INTENT).toBe("one_tent_activation");
    expect(isOneTentActivationIntent("one_tent_activation")).toBe(true);
    expect(isOneTentActivationIntent("ONE_TENT_ACTIVATION")).toBe(false);
    expect(isOneTentActivationIntent(null)).toBe(false);
  });

  it("builds scoped, encoded activation routes", () => {
    expect(buildConnectedActivationRoutes({ growId: "grow one", tentId: "tent&one" })).toEqual({
      createGrow: "/grows?intent=one_tent_activation",
      addTent: "/tents?growId=grow%20one&intent=one_tent_activation",
      addPlant: "/plants?growId=grow%20one&tentId=tent%26one&intent=one_tent_activation",
      quickLog: "/dashboard?growId=grow%20one&open=quick-log",
      sensors: "/sensors?growId=grow%20one",
    });
  });

  it("falls back to the preceding safe route when scope is missing", () => {
    expect(buildConnectedActivationRoutes({ growId: null, tentId: "tent" })).toEqual({
      createGrow: "/grows?intent=one_tent_activation",
      addTent: "/grows?intent=one_tent_activation",
      addPlant: "/grows?intent=one_tent_activation",
      quickLog: "/grows?intent=one_tent_activation",
      sensors: "/sensors",
    });
  });
});

const scope = { growId: "grow-a", tentId: "tent-a", plantId: "plant-a" };

function growEvent(
  overrides: Partial<ConnectedActivationGrowEventRow> = {},
): ConnectedActivationGrowEventRow {
  return {
    id: "event-1",
    grow_id: "grow-a",
    tent_id: "tent-a",
    plant_id: "plant-a",
    event_type: "observation",
    occurred_at: "2026-07-19T12:00:00Z",
    source: "manual",
    is_deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

function diaryEntry(
  overrides: Partial<ConnectedActivationDiaryEntryRow> = {},
): ConnectedActivationDiaryEntryRow {
  return {
    id: "diary-1",
    grow_id: "grow-a",
    tent_id: "tent-a",
    plant_id: "plant-a",
    entry_at: "2026-07-19T11:00:00Z",
    details: {},
    ...overrides,
  };
}

describe("summarizeConnectedActivationEvidence", () => {
  it("counts canonical watering and feeding events and returns stable latest evidence", () => {
    expect(
      summarizeConnectedActivationEvidence({
        ...scope,
        growEvents: [
          growEvent({ id: "water", event_type: "watering" }),
          growEvent({
            id: "feed",
            event_type: "feeding",
            occurred_at: "2026-07-19T13:00:00Z",
          }),
        ],
        diaryEntries: [diaryEntry()],
      }),
    ).toEqual({
      count: 3,
      hasEvidence: true,
      latestAt: "2026-07-19T13:00:00Z",
      latestSource: "grow_events",
    });
  });

  it("accepts grow-level and tent-level rows but rejects explicit other scope", () => {
    const result = summarizeConnectedActivationEvidence({
      ...scope,
      growEvents: [
        growEvent({ id: "grow-level", tent_id: null, plant_id: null }),
        growEvent({ id: "tent-level", plant_id: null }),
        growEvent({ id: "other-grow", grow_id: "grow-b" }),
        growEvent({ id: "other-tent", tent_id: "tent-b" }),
        growEvent({ id: "other-plant", plant_id: "plant-b" }),
      ],
      diaryEntries: [
        diaryEntry({ id: "diary-grow", tent_id: null, plant_id: null }),
        diaryEntry({ id: "diary-other", plant_id: "plant-b" }),
      ],
    });
    expect(result.count).toBe(3);
  });

  it("ignores deleted, non-manual, noncanonical, invalid, and unscoped events", () => {
    expect(
      summarizeConnectedActivationEvidence({
        ...scope,
        growEvents: [
          growEvent({ id: "deleted", is_deleted: true }),
          growEvent({ id: "soft-deleted", deleted_at: "2026-07-19T12:01:00Z" }),
          growEvent({ id: "live", source: "live" }),
          growEvent({ id: "unknown", event_type: "miracle_fix" }),
          growEvent({ id: "bad-time", occurred_at: "not-a-date" }),
          growEvent({ id: "", occurred_at: "2026-07-19T14:00:00Z" }),
        ],
        diaryEntries: [
          diaryEntry({ id: "bad-diary", entry_at: "not-a-date" }),
          diaryEntry({ id: "", entry_at: "2026-07-19T14:00:00Z" }),
        ],
      }),
    ).toEqual({ count: 0, hasEvidence: false, latestAt: null, latestSource: null });
  });

  it("deduplicates companion diary rows from top-level and details links", () => {
    const event = growEvent({ id: "parent" });
    const result = summarizeConnectedActivationEvidence({
      ...scope,
      growEvents: [event],
      diaryEntries: [
        diaryEntry({ id: "top-linked", linked_grow_event_id: "parent" }),
        diaryEntry({ id: "alias-linked", grow_event_id: "parent" }),
        diaryEntry({ id: "details-linked", details: { linked_grow_event_id: "parent" } }),
        diaryEntry({ id: "details-alias", details: { grow_event_id: "parent" } }),
        diaryEntry({ id: "independent" }),
      ],
    });
    expect(result.count).toBe(2);
  });

  it("does not let a broad diary companion linked to another plant count", () => {
    const result = summarizeConnectedActivationEvidence({
      ...scope,
      growEvents: [growEvent({ id: "other-parent", plant_id: "plant-b" })],
      diaryEntries: [
        diaryEntry({
          id: "broad-companion",
          plant_id: null,
          details: { linked_grow_event_id: "other-parent" },
        }),
      ],
    });
    expect(result).toEqual({
      count: 0,
      hasEvidence: false,
      latestAt: null,
      latestSource: null,
    });
  });

  it("uses grow_events on exact timestamp ties and is reorder deterministic", () => {
    const input = {
      ...scope,
      growEvents: [growEvent({ id: "event-z" })],
      diaryEntries: [diaryEntry({ id: "diary-a", entry_at: "2026-07-19T12:00:00Z" })],
    };
    const forward = summarizeConnectedActivationEvidence(input);
    const reversed = summarizeConnectedActivationEvidence({
      ...scope,
      growEvents: [...input.growEvents].reverse(),
      diaryEntries: [...input.diaryEntries].reverse(),
    });
    expect(forward.latestSource).toBe("grow_events");
    expect(reversed).toEqual(forward);
  });

  it("handles duplicate event IDs deterministically under reordering", () => {
    const rows = [
      growEvent({ id: "duplicate", occurred_at: "2026-07-19T10:00:00Z" }),
      growEvent({ id: "duplicate", occurred_at: "2026-07-19T12:00:00Z" }),
    ];
    const forward = summarizeConnectedActivationEvidence({ ...scope, growEvents: rows });
    const reversed = summarizeConnectedActivationEvidence({
      ...scope,
      growEvents: [...rows].reverse(),
    });
    expect(forward).toEqual({
      count: 1,
      hasEvidence: true,
      latestAt: "2026-07-19T12:00:00Z",
      latestSource: "grow_events",
    });
    expect(reversed).toEqual(forward);
  });

  it("requires a complete connected scope before evidence can activate", () => {
    expect(
      summarizeConnectedActivationEvidence({
        growId: "grow-a",
        tentId: "tent-a",
        plantId: null,
        growEvents: [growEvent()],
      }),
    ).toEqual({ count: 0, hasEvidence: false, latestAt: null, latestSource: null });
  });
});
