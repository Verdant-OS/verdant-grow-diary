import { describe, it, expect } from "vitest";
import {
  buildPhenoKeeperActionQueuePayloads,
  suggestKeeperFollowUpActions,
  PHENO_KEEPER_ACTION_TYPE,
} from "@/lib/phenoKeeperActionQueue";

const EVENT = {
  id: "dec-1",
  decision: "keep",
  candidateLabel: "BD #1",
  decidedAt: "2026-03-01T00:00:00Z",
};

describe("suggestKeeperFollowUpActions", () => {
  it("maps each decision to approval-worthy reminders (undecided → none)", () => {
    expect(suggestKeeperFollowUpActions("keep", "X").length).toBe(2);
    expect(suggestKeeperFollowUpActions("cull", "X").length).toBe(1);
    expect(suggestKeeperFollowUpActions("hold", "X").length).toBe(1);
    expect(suggestKeeperFollowUpActions("undecided", "X")).toEqual([]);
  });

  it("uses only allowed risk levels and includes the candidate label", () => {
    for (const d of ["keep", "cull", "hold"] as const) {
      for (const s of suggestKeeperFollowUpActions(d, "Blue Dream #7")) {
        expect(["low", "medium"]).toContain(s.risk_level);
        expect(s.title).toContain("Blue Dream #7");
      }
    }
    // Culling is the higher-consequence reminder.
    expect(suggestKeeperFollowUpActions("cull", "X")[0].risk_level).toBe("medium");
  });
});

describe("buildPhenoKeeperActionQueuePayloads", () => {
  it("emits pending-approval, manual-source payloads — never auto-executing", () => {
    const payloads = buildPhenoKeeperActionQueuePayloads(EVENT, "grow-1", "plant-1", "tent-1");
    expect(payloads.length).toBe(2);
    for (const p of payloads) {
      expect(p.status).toBe("pending_approval");
      expect(p.source).toBe("manual");
      expect(p.action_type).toBe(PHENO_KEEPER_ACTION_TYPE);
      expect(p.target_metric).toBe(PHENO_KEEPER_ACTION_TYPE);
      expect(p.grow_id).toBe("grow-1");
      expect(p.plant_id).toBe("plant-1");
      expect(p.tent_id).toBe("tent-1");
      expect(["low", "medium", "high", "critical"]).toContain(p.risk_level);
    }
  });

  it("never targets a device and carries no execution/automation vocabulary", () => {
    const payloads = buildPhenoKeeperActionQueuePayloads(
      { ...EVENT, decision: "cull" },
      "grow-1",
      "plant-1",
    );
    for (const p of payloads) {
      // target_device is never set — keeper follow-ups are metric-tagged reminders.
      expect((p as Record<string, unknown>).target_device ?? null).toBeNull();
      const blob = JSON.stringify(p).toLowerCase();
      for (const banned of [
        "auto-execute",
        "autoexecute",
        "autopilot",
        "auto-apply",
        "dispatch_command",
        "device_command",
        "actuator",
        "relay.",
        "mqtt",
      ]) {
        expect(blob).not.toContain(banned);
      }
    }
  });

  it("carries decision provenance on reason and in a normalized originating event", () => {
    const [p] = buildPhenoKeeperActionQueuePayloads(EVENT, "grow-1", "plant-1");
    expect(p.reason).toContain("[keeper_decision:dec-1]");
    const originating = p.originating_timeline_events as unknown as Array<{
      id: string;
      type: string | null;
      occurred_at: string | null;
      source: string;
    }>;
    expect(originating).toHaveLength(1);
    expect(originating[0]).toMatchObject({
      id: "dec-1",
      type: "pheno_keeper_keep",
      occurred_at: "2026-03-01T00:00:00Z",
      source: "manual",
    });
  });

  it("stores a parseable suggested_change with decision context", () => {
    const [p] = buildPhenoKeeperActionQueuePayloads(EVENT, "grow-1", "plant-1");
    const change = JSON.parse(p.suggested_change as string);
    expect(change).toMatchObject({
      decision: "keep",
      decision_label: "Keep",
      candidate_label: "BD #1",
      source_decision_id: "dec-1",
    });
    expect(typeof change.title).toBe("string");
    expect(typeof change.next_steps).toBe("string");
  });

  it("normalizes the decision and defaults a blank label", () => {
    const payloads = buildPhenoKeeperActionQueuePayloads(
      { id: "d2", decision: "CULL", candidateLabel: "  ", decidedAt: null },
      "grow-1",
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0].reason.toLowerCase()).toContain("cull");
    const change = JSON.parse(payloads[0].suggested_change as string);
    expect(change.candidate_label).toBe("this candidate");
    // Missing decidedAt must NOT fabricate a timestamp.
    const originating = payloads[0].originating_timeline_events as unknown as Array<{
      occurred_at: string | null;
    }>;
    expect(originating[0].occurred_at).toBeNull();
  });

  it("returns [] for undecided decisions and for missing decision id / grow id", () => {
    expect(
      buildPhenoKeeperActionQueuePayloads({ ...EVENT, decision: "undecided" }, "grow-1"),
    ).toEqual([]);
    expect(buildPhenoKeeperActionQueuePayloads({ ...EVENT, decision: "maybe" }, "grow-1")).toEqual(
      [],
    );
    expect(buildPhenoKeeperActionQueuePayloads({ ...EVENT, id: "  " }, "grow-1")).toEqual([]);
    expect(buildPhenoKeeperActionQueuePayloads(EVENT, "  ")).toEqual([]);
  });
});
