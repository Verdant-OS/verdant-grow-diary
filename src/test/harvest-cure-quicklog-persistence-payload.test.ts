import { describe, it, expect } from "vitest";
import {
  buildHarvestCureQuickLogPersistencePayload,
  type HarvestCureSensorSnapshotInput,
} from "../lib/harvestCureQuickLogPersistencePayload";

const GROW_ID = "00000000-0000-0000-0000-000000000001";
const TENT_ID = "00000000-0000-0000-0000-000000000002";
const PLANT_ID = "00000000-0000-0000-0000-000000000003";
const IK = "abcd-efgh-ijkl-12345678";

function manualSnapshot(): HarvestCureSensorSnapshotInput {
  return {
    source: "manual",
    captured_at: "2026-06-26T18:00:00Z",
    metrics: { temperature_c: 22.1, humidity_pct: 58 },
  };
}

describe("harvestCureQuickLogPersistencePayload", () => {
  describe("happy paths", () => {
    it("builds a harvest persistence payload through Quick Log save path", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "harvest",
        growId: GROW_ID,
        idempotencyKey: IK,
        tentId: TENT_ID,
        plantId: PLANT_ID,
        note: "Wet trim, kept top colas",
        harvest: {
          harvest_stage_note: "Mostly cloudy, ~15% amber",
          trim_style: "wet_trim",
          wet_weight_grams: 412.5,
          keeper_candidate: "yes",
        },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.payload.p_event_type).toBe("harvest");
      expect(r.payload.p_grow_id).toBe(GROW_ID);
      expect(r.payload.p_idempotency_key).toBe(IK);
      expect(r.payload.p_tent_id).toBe(TENT_ID);
      expect(r.payload.p_plant_id).toBe(PLANT_ID);
      expect(r.payload.p_note).toBe("Wet trim, kept top colas");
      expect(r.payload.p_details).toEqual({
        harvest: {
          harvest_stage_note: "Mostly cloudy, ~15% amber",
          trim_style: "wet_trim",
          wet_weight_grams: 412.5,
          keeper_candidate: "yes",
        },
      });
      expect(r.payload.p_sensor_snapshot).toBeNull();
    });

    it("builds a cure_check persistence payload through Quick Log save path", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
        plantId: PLANT_ID,
        cureCheck: {
          container_label: "Jar A",
          cure_day: 5,
          jar_or_bag_rh: 62,
          cure_temp_f: 65,
          mold_check: "clear",
          burped: "yes",
        },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.payload.p_event_type).toBe("cure_check");
      expect(r.payload.p_details).toEqual({
        cure_check: {
          container_label: "Jar A",
          cure_day: 5,
          jar_or_bag_rh: 62,
          cure_temp_f: 65,
          mold_check: "clear",
          burped: "yes",
        },
      });
    });

    it("omits optional harvest fields when not provided", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "harvest",
        growId: GROW_ID,
        idempotencyKey: IK,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // No details → envelope is null (no harvest sub-object created).
      expect(r.payload.p_details).toBeNull();
      expect(r.payload.p_note).toBeNull();
      expect(r.payload.p_tent_id).toBeNull();
      expect(r.payload.p_plant_id).toBeNull();
    });

    it("omits optional cure_check fields when not provided", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.payload.p_details).toBeNull();
    });

    it("preserves manual sensor snapshot source label verbatim", () => {
      const snap = manualSnapshot();
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
        cureCheck: { jar_or_bag_rh: 60 },
        sensorSnapshot: snap,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.payload.p_sensor_snapshot).toEqual(snap);
      expect(r.payload.p_sensor_snapshot?.source).toBe("manual");
    });

    it("preserves stale/demo/invalid snapshot source — never treated as live", () => {
      for (const source of ["stale", "demo", "invalid"]) {
        const snap: HarvestCureSensorSnapshotInput = {
          source,
          captured_at: "2026-06-20T00:00:00Z",
          metrics: { humidity_pct: 50 },
        };
        const r = buildHarvestCureQuickLogPersistencePayload({
          eventType: "cure_check",
          growId: GROW_ID,
          idempotencyKey: IK,
          cureCheck: { jar_or_bag_rh: 60 },
          sensorSnapshot: snap,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // The builder never relabels a snapshot. Source label is exact.
        expect(r.payload.p_sensor_snapshot?.source).toBe(source);
      }
    });
  });

  describe("validation gates persistence", () => {
    it("rejects negative harvest weight before persistence", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "harvest",
        growId: GROW_ID,
        idempotencyKey: IK,
        harvest: { wet_weight_grams: -10 },
      });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("expected failure");
      const fail = r as Extract<typeof r, { ok: false }>;
      expect(fail.reason).toBe("invalid_harvest_details");
    });

    it("rejects negative cure_day before persistence", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
        cureCheck: { cure_day: -1 },
      });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("expected failure");
      const fail = r as Extract<typeof r, { ok: false }>;
      expect(fail.reason).toBe("invalid_cure_check_details");
    });

    it("rejects RH outside 0–100 before persistence", () => {
      for (const rh of [-1, 101, 250]) {
        const r = buildHarvestCureQuickLogPersistencePayload({
          eventType: "cure_check",
          growId: GROW_ID,
          idempotencyKey: IK,
          cureCheck: { jar_or_bag_rh: rh },
        });
        expect(r.ok).toBe(false);
      }
    });

    it("rejects unrealistic cure temperature before persistence", () => {
      for (const t of [10, 31, 121, 200]) {
        const r = buildHarvestCureQuickLogPersistencePayload({
          eventType: "cure_check",
          growId: GROW_ID,
          idempotencyKey: IK,
          cureCheck: { cure_temp_f: t },
        });
        expect(r.ok).toBe(false);
      }
    });

    it("rejects invalid idempotency keys", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "harvest",
        growId: GROW_ID,
        idempotencyKey: "short",
      });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("expected failure");
      const fail = r as Extract<typeof r, { ok: false }>;
      expect(fail.reason).toBe("invalid_idempotency_key");
    });

    it("rejects invalid sensor snapshots", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
        cureCheck: { jar_or_bag_rh: 60 },
        sensorSnapshot: {
          source: "",
          captured_at: "2026-06-26T00:00:00Z",
          metrics: { humidity_pct: 50 },
        },
      });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("expected failure");
      const fail = r as Extract<typeof r, { ok: false }>;
      expect(fail.reason).toBe("invalid_sensor_snapshot");
    });

    it("rejects unknown event types", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "watering" as unknown as "harvest",
        growId: GROW_ID,
        idempotencyKey: IK,
      });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("expected failure");
      const fail = r as Extract<typeof r, { ok: false }>;
      expect(fail.reason).toBe("invalid_event_type");
    });
  });

  describe("operator-only safety invariants", () => {
    it("keeper_candidate is operator-entered only — never inferred from absence", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "harvest",
        growId: GROW_ID,
        idempotencyKey: IK,
        harvest: { wet_weight_grams: 100 }, // no keeper_candidate
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const d = r.payload.p_details as { harvest?: Record<string, unknown> } | null;
      expect(d?.harvest).toBeDefined();
      expect(d?.harvest && "keeper_candidate" in d.harvest).toBe(false);
    });

    it("mold_check = concern does NOT produce alert/action keys in payload", () => {
      const r = buildHarvestCureQuickLogPersistencePayload({
        eventType: "cure_check",
        growId: GROW_ID,
        idempotencyKey: IK,
        cureCheck: { mold_check: "concern", jar_or_bag_rh: 65 },
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Payload contains ONLY persistence keys — no alert/action queue
      // side-effect surfaces are added by this builder.
      const keys = Object.keys(r.payload);
      for (const forbidden of ["p_alert", "p_action_queue", "alerts", "action_queue"]) {
        expect(keys).not.toContain(forbidden);
      }
      const json = JSON.stringify(r.payload);
      expect(/alert/i.test(json)).toBe(false);
      expect(/action[_ ]?queue/i.test(json)).toBe(false);
    });
  });
});
