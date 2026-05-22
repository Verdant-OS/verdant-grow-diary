/**
 * Pure aggregation tests for src/lib/growRoomModeRules.ts.
 *
 * Deterministic, no I/O. Verifies:
 *  - per-tent aggregation of snapshots + alerts + actions
 *  - stale / missing / demo classification
 *  - severity-first deterministic ordering
 *  - counts only OPEN alerts / PENDING actions
 *  - never claims missing/unknown is healthy
 *  - never returns executable device command surface
 */
import { describe, it, expect } from "vitest";
import {
  buildGrowRoomTentCards,
  DATA_HEALTH_LABEL,
  RECOMMENDATION_LABEL,
  SNAPSHOT_STATE_LABEL,
  type GrowRoomActionInput,
  type GrowRoomAggregationInput,
  type GrowRoomAlertInput,
  type GrowRoomTentInput,
} from "@/lib/growRoomModeRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-05-22T12:00:00Z");
const FRESH = new Date(NOW - 60 * 1000).toISOString(); // 1 min ago
const STALE = new Date(NOW - 60 * 60 * 1000).toISOString(); // 60 min ago

function tent(id: string, name: string, grow_id = "g1"): GrowRoomTentInput {
  return { id, name, grow_id };
}

function snap(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FRESH,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 40,
    soil_ec: 1.4,
    soil_temp: 22,
    ppfd: 600,
    ...overrides,
  };
}

function alert(
  id: string,
  tent_id: string,
  severity: GrowRoomAlertInput["severity"],
  status: GrowRoomAlertInput["status"] = "open",
  created_at: string = FRESH,
): GrowRoomAlertInput {
  return {
    id,
    tent_id,
    grow_id: "g1",
    severity,
    status,
    title: `${severity} on ${tent_id}`,
    created_at,
  };
}

function action(
  id: string,
  tent_id: string,
  status: GrowRoomActionInput["status"] = "pending_approval",
): GrowRoomActionInput {
  return { id, tent_id, grow_id: "g1", status };
}

function baseInput(
  overrides: Partial<GrowRoomAggregationInput> = {},
): GrowRoomAggregationInput {
  return {
    tents: [],
    alerts: [],
    actions: [],
    now: NOW,
    ...overrides,
  };
}

describe("buildGrowRoomTentCards · aggregation", () => {
  it("aggregates multiple tents with snapshots, alerts, and pending actions", () => {
    const cards = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "Tent One"), tent("t2", "Tent Two")],
        snapshotsByTentId: { t1: snap(), t2: snap({ source: "manual" }) },
        alerts: [
          alert("a1", "t1", "warning"),
          alert("a2", "t1", "info"),
          alert("a3", "t2", "watch"),
        ],
        actions: [
          action("ac1", "t1"),
          action("ac2", "t1"),
          action("ac3", "t2"),
        ],
      }),
    );
    expect(cards).toHaveLength(2);
    const t1 = cards.find((c) => c.tentId === "t1")!;
    expect(t1.openAlertCount).toBe(2);
    expect(t1.highestSeverity).toBe("warning");
    expect(t1.pendingActionCount).toBe(2);
    expect(t1.snapshotState).toBe("live");
    expect(t1.dataHealth).toBe("warning");
    expect(t1.primaryRecommendation).toBe("review_alert");

    const t2 = cards.find((c) => c.tentId === "t2")!;
    expect(t2.snapshotState).toBe("manual");
    expect(t2.openAlertCount).toBe(1);
    expect(t2.highestSeverity).toBe("watch");
  });

  it("counts only OPEN alerts and PENDING actions", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
        alerts: [
          alert("a1", "t1", "warning", "open"),
          alert("a2", "t1", "critical", "resolved"),
          alert("a3", "t1", "critical", "dismissed"),
          alert("a4", "t1", "info", "acknowledged"),
        ],
        actions: [
          action("ac1", "t1", "pending_approval"),
          action("ac2", "t1", "approved"),
          action("ac3", "t1", "completed"),
          action("ac4", "t1", "rejected"),
          action("ac5", "t1", "cancelled"),
        ],
      }),
    );
    expect(card.openAlertCount).toBe(1);
    expect(card.highestSeverity).toBe("warning"); // not critical (resolved)
    expect(card.pendingActionCount).toBe(1);
  });

  it("ignores alerts/actions with no tent_id", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
        alerts: [alert("a1", "t1", "warning"), { ...alert("a2", "t1", "critical"), tent_id: null }],
        actions: [action("ac1", "t1"), { ...action("ac2", "t1"), tent_id: null }],
      }),
    );
    expect(card.openAlertCount).toBe(1);
    expect(card.pendingActionCount).toBe(1);
  });
});

describe("buildGrowRoomTentCards · snapshot classification", () => {
  it("flags missing snapshot honestly", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: EMPTY_SNAPSHOT },
      }),
    );
    expect(card.snapshotState).toBe("missing");
    expect(card.dataHealth).toBe("missing");
    expect(card.primaryRecommendation).toBe("check_stale_data");
    expect(card.snapshotAgeMinutes).toBeNull();
  });

  it("flags stale snapshot honestly", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap({ ts: STALE }) },
      }),
    );
    expect(card.snapshotState).toBe("stale");
    expect(card.dataHealth).toBe("stale");
    expect(card.primaryRecommendation).toBe("check_stale_data");
  });

  it("flags demo snapshot honestly and never labels it live", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() }, // live shape
        demoTentIds: ["t1"],
      }),
    );
    expect(card.snapshotState).toBe("demo");
    // demo should not roll up to "healthy"
    expect(card.dataHealth).not.toBe("healthy");
  });

  it("never classifies unknown/missing data as healthy", () => {
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: undefined },
      }),
    );
    expect(card.dataHealth).toBe("missing");
    expect(card.snapshotState).toBe("missing");
  });

  it("treats unknown snapshot source as missing (never silently 'live')", () => {
    const weird = snap({ source: "unknown-source" as unknown as SensorSnapshot["source"] });
    const [card] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: weird },
      }),
    );
    expect(card.snapshotState).toBe("missing");
  });
});

describe("buildGrowRoomTentCards · ordering (highest risk first)", () => {
  it("sorts critical > warning > watch > info > none", () => {
    const cards = buildGrowRoomTentCards(
      baseInput({
        tents: [
          tent("t-none", "Calm"),
          tent("t-warn", "Warn"),
          tent("t-crit", "Critical"),
          tent("t-info", "Info"),
        ],
        snapshotsByTentId: {
          "t-none": snap(),
          "t-warn": snap(),
          "t-crit": snap(),
          "t-info": snap(),
        },
        alerts: [
          alert("a1", "t-warn", "warning"),
          alert("a2", "t-crit", "critical"),
          alert("a3", "t-info", "info"),
        ],
      }),
    );
    expect(cards.map((c) => c.tentId)).toEqual([
      "t-crit",
      "t-warn",
      "t-info",
      "t-none",
    ]);
  });

  it("breaks severity ties by pending action count desc", () => {
    const cards = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t-a", "A"), tent("t-b", "B")],
        snapshotsByTentId: { "t-a": snap(), "t-b": snap() },
        alerts: [
          alert("a1", "t-a", "warning"),
          alert("a2", "t-b", "warning"),
        ],
        actions: [action("ac1", "t-b"), action("ac2", "t-b"), action("ac3", "t-a")],
      }),
    );
    expect(cards.map((c) => c.tentId)).toEqual(["t-b", "t-a"]);
  });

  it("breaks remaining ties by stale/missing before healthy", () => {
    const cards = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t-fresh", "AAA fresh"), tent("t-stale", "ZZZ stale")],
        snapshotsByTentId: {
          "t-fresh": snap(),
          "t-stale": snap({ ts: STALE }),
        },
      }),
    );
    // No alerts/actions → severity tied at none, pending tied at 0.
    // Stale must come before healthy.
    expect(cards.map((c) => c.tentId)).toEqual(["t-stale", "t-fresh"]);
  });

  it("final tie-break is lexical tent name then id (deterministic)", () => {
    const cards = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t-b", "Bravo"), tent("t-a", "Alpha")],
        snapshotsByTentId: { "t-a": snap(), "t-b": snap() },
      }),
    );
    expect(cards.map((c) => c.tentId)).toEqual(["t-a", "t-b"]);
  });

  it("ordering is stable across two runs of the same input", () => {
    const input = baseInput({
      tents: [tent("t1", "One"), tent("t2", "Two"), tent("t3", "Three")],
      snapshotsByTentId: { t1: snap(), t2: snap(), t3: snap() },
      alerts: [alert("a", "t2", "critical")],
      actions: [action("ac", "t3")],
    });
    const a = buildGrowRoomTentCards(input).map((c) => c.tentId);
    const b = buildGrowRoomTentCards(input).map((c) => c.tentId);
    expect(a).toEqual(b);
  });
});

describe("buildGrowRoomTentCards · recommendation routing", () => {
  it("open alerts → review_alert", () => {
    const [c] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
        alerts: [alert("a1", "t1", "warning")],
        actions: [action("ac1", "t1")],
      }),
    );
    expect(c.primaryRecommendation).toBe("review_alert");
  });

  it("pending actions only → review_action_queue", () => {
    const [c] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
        actions: [action("ac1", "t1")],
      }),
    );
    expect(c.primaryRecommendation).toBe("review_action_queue");
  });

  it("clean tent → no_action", () => {
    const [c] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
      }),
    );
    expect(c.primaryRecommendation).toBe("no_action");
    expect(c.dataHealth).toBe("healthy");
  });
});

describe("buildGrowRoomTentCards · safety properties", () => {
  it("returned cards never expose executable device command surface", () => {
    const [c] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
        alerts: [alert("a", "t1", "critical")],
        actions: [action("ac", "t1")],
      }),
    );
    const keys = Object.keys(c);
    for (const forbidden of [
      "command",
      "target_device",
      "payload",
      "device_command",
      "execute",
      "run",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("returned cards never expose a user_id field (RLS-owned)", () => {
    const [c] = buildGrowRoomTentCards(
      baseInput({
        tents: [tent("t1", "T")],
        snapshotsByTentId: { t1: snap() },
      }),
    );
    expect(Object.keys(c)).not.toContain("user_id");
  });

  it("labels are exposed for UI (no JSX strings invented per render)", () => {
    expect(RECOMMENDATION_LABEL.review_alert).toBeTruthy();
    expect(SNAPSHOT_STATE_LABEL.stale).toBeTruthy();
    expect(SNAPSHOT_STATE_LABEL.demo).toBeTruthy();
    expect(DATA_HEALTH_LABEL.missing).toBeTruthy();
  });
});
