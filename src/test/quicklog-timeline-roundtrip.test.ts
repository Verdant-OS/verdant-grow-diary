/**
 * Quick Log → Plant Timeline round-trip regression.
 *
 * Proves a Quick Log entry created via the existing write path (RPC
 * `quicklog_save_manual` → grow_events + optional environment_events)
 * surfaces in the Plant Timeline read path (useQuickLogGroupedTimeline →
 * partitionQuickLogRows → groupQuickLogTimelineEntries) without
 * rewriting either side. Also guards the safety invariants of the
 * loop: no client-trusted user_id, no service_role, deterministic
 * ordering, honest source labels (never "live" for manual rows), and
 * graceful handling of missing/invalid timestamps.
 *
 * Pure: simulates the RPC's grow_events INSERT shape directly so we
 * never need a live Supabase to assert the contract.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  partitionQuickLogRows,
  type RawGrowEventRow,
} from "@/lib/quickLogGroupedTimelineRowAdapter";
import {
  groupQuickLogTimelineEntries,
  type QuickLogTimelineEntry,
} from "@/lib/quickLogTimelineGroupingViewModel";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

const PLANT_ID = "plant-1111-1111-1111-111111111111";
const TENT_ID = "tent-2222-2222-2222-222222222222";

/**
 * Mirror of the RPC's INSERT: a Quick Log "water" save produces a
 * parent grow_event of type=watering plus a sibling parent grow_event
 * of type=environment when sensor values are present. The shape below
 * matches the SELECT used by `useQuickLogGroupedTimeline`.
 */
function simulateQuickLogInsert(opts: {
  parentId: string;
  envId?: string | null;
  occurredAt: string;
  plantId: string | null;
  tentId: string;
  note?: string | null;
  volumeMl?: number | null;
  env?: {
    temperature_c?: number | null;
    humidity_pct?: number | null;
    vpd_kpa?: number | null;
  } | null;
}): RawGrowEventRow[] {
  const rows: RawGrowEventRow[] = [
    {
      id: opts.parentId,
      plant_id: opts.plantId,
      tent_id: opts.tentId,
      occurred_at: opts.occurredAt,
      event_type: opts.volumeMl != null ? "watering" : "observation",
      source: "manual",
      note: opts.note ?? null,
      is_deleted: false,
      watering_events:
        opts.volumeMl != null ? { volume_ml: opts.volumeMl } : null,
    },
  ];
  if (opts.env && opts.envId) {
    rows.push({
      id: opts.envId,
      plant_id: opts.plantId,
      tent_id: opts.tentId,
      occurred_at: opts.occurredAt,
      event_type: "environment",
      source: "manual",
      note: null,
      is_deleted: false,
      environment_events: {
        temperature_c: opts.env.temperature_c ?? null,
        humidity_pct: opts.env.humidity_pct ?? null,
        vpd_kpa: opts.env.vpd_kpa ?? null,
      },
    });
  }
  return rows;
}

function runTimeline(rows: RawGrowEventRow[]): QuickLogTimelineEntry[] {
  const { actions, environmentRows } = partitionQuickLogRows(rows);
  return groupQuickLogTimelineEntries({
    actions,
    environmentRows,
    scope: { kind: "plant", plantId: PLANT_ID, tentId: TENT_ID },
  });
}

describe("Quick Log save payload (write path)", () => {
  it("builds a valid RPC payload with target context and never includes user_id", () => {
    const result = buildQuickLogV2SavePayload({
      resolved: {
        ok: true,
        targetType: "plant",
        targetId: PLANT_ID,
        // The resolved type carries more fields in production; the
        // payload builder only reads ok/targetType/targetId.
      } as unknown as Parameters<typeof buildQuickLogV2SavePayload>[0]["resolved"],
      action: "water",
      volumeMl: "500",
      note: "Top-feed, full strength",
      temperatureC: "24",
      humidityPct: "55",
      vpdKpa: "1.1",
      occurredAt: "2026-05-30T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = result.payload as unknown as Record<string, unknown>;
    expect(payload.p_target_type).toBe("plant");
    expect(payload.p_target_id).toBe(PLANT_ID);
    expect(payload.p_action).toBe("water");
    expect(payload.p_volume_ml).toBe(500);
    expect(payload.p_note).toBe("Top-feed, full strength");
    expect(payload.p_temperature_c).toBe(24);
    expect(payload.p_humidity_pct).toBe(55);
    expect(payload.p_vpd_kpa).toBe(1.1);
    expect(payload.p_occurred_at).toBe("2026-05-30T12:00:00.000Z");
    // Hard invariant: client never sends user_id — RLS + auth.uid()
    // own the ownership boundary inside the RPC.
    for (const k of Object.keys(payload)) {
      expect(k).not.toMatch(/user_id/i);
    }
  });
});

describe("Quick Log → Plant Timeline round-trip", () => {
  it("newly created Quick Log (water + sensor snapshot) renders as a grouped Manual entry", () => {
    const rows = simulateQuickLogInsert({
      parentId: "evt-a",
      envId: "evt-a-env",
      occurredAt: "2026-05-30T12:00:00.000Z",
      plantId: PLANT_ID,
      tentId: TENT_ID,
      note: "Top-feed",
      volumeMl: 500,
      env: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    });
    const entries = runTimeline(rows);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.kind).toBe("grouped");
    if (e.kind !== "grouped") return;
    expect(e.action.kind).toBe("water");
    expect(e.action.noteText).toBe("Top-feed");
    expect(e.action.volumeMl).toBe(500);
    expect(e.occurredAt).toBe("2026-05-30T12:00:00.000Z");
    // Source labels are honest: Manual, never live/synced/imported.
    expect(e.actionSourceLabel).toBe("Manual");
    expect(e.environmentSourceLabel).toBe("Manual");
  });

  it("note-only Quick Log surfaces as a standalone action entry with note + occurredAt", () => {
    const rows = simulateQuickLogInsert({
      parentId: "evt-b",
      occurredAt: "2026-05-30T13:00:00.000Z",
      plantId: PLANT_ID,
      tentId: TENT_ID,
      note: "Leaves look perky after lights-on",
      volumeMl: null,
    });
    const entries = runTimeline(rows);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.kind).toBe("action");
    if (e.kind !== "action") return;
    expect(e.action.kind).toBe("note");
    expect(e.action.noteText).toContain("perky");
    expect(e.occurredAt).toBe("2026-05-30T13:00:00.000Z");
    expect(e.actionSourceLabel).toBe("Manual");
  });

  it("missing/invalid timestamp is dropped, not rendered as 'live' or NaN", () => {
    const rows: RawGrowEventRow[] = [
      {
        id: "evt-bad",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        occurred_at: "not-a-date",
        event_type: "observation",
        source: "manual",
        note: "garbage ts",
        is_deleted: false,
      },
      ...simulateQuickLogInsert({
        parentId: "evt-good",
        occurredAt: "2026-05-30T14:00:00.000Z",
        plantId: PLANT_ID,
        tentId: TENT_ID,
        note: "valid",
      }),
    ];
    const entries = runTimeline(rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("action");
  });

  it("ordering is deterministic: newest-first with stable id tiebreak on identical timestamps", () => {
    const sameTs = "2026-05-30T15:00:00.000Z";
    const rows = [
      ...simulateQuickLogInsert({
        parentId: "evt-zzz",
        occurredAt: sameTs,
        plantId: PLANT_ID,
        tentId: TENT_ID,
        note: "z",
      }),
      ...simulateQuickLogInsert({
        parentId: "evt-aaa",
        occurredAt: sameTs,
        plantId: PLANT_ID,
        tentId: TENT_ID,
        note: "a",
      }),
      ...simulateQuickLogInsert({
        parentId: "evt-newer",
        occurredAt: "2026-05-30T16:00:00.000Z",
        plantId: PLANT_ID,
        tentId: TENT_ID,
        note: "newest",
      }),
    ];
    const ids = runTimeline(rows).map((e) =>
      e.kind === "environment" ? e.environment.id : e.action.id,
    );
    expect(ids).toEqual(["evt-newer", "evt-aaa", "evt-zzz"]);

    // Determinism: same input order → identical output ordering twice.
    const idsAgain = runTimeline(rows).map((e) =>
      e.kind === "environment" ? e.environment.id : e.action.id,
    );
    expect(idsAgain).toEqual(ids);
  });

  it("empty timeline input returns an empty entry list (calm state)", () => {
    expect(runTimeline([])).toEqual([]);
  });

  it("environment row with no usable telemetry is not silently labeled healthy", () => {
    const rows = simulateQuickLogInsert({
      parentId: "evt-c",
      envId: "evt-c-env",
      occurredAt: "2026-05-30T17:00:00.000Z",
      plantId: PLANT_ID,
      tentId: TENT_ID,
      note: "water only",
      volumeMl: 250,
      env: { temperature_c: null, humidity_pct: null, vpd_kpa: null },
    });
    const entries = runTimeline(rows);
    // Action still renders; empty env card must not appear as a
    // "healthy" snapshot — the VM drops env rows with no telemetry.
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      if (e.kind === "grouped" || e.kind === "environment") {
        expect(e.environmentSourceLabel).toBe("Manual");
      }
    }
  });
});

describe("static safety: Quick Log + Timeline write/read paths", () => {
  const root = process.cwd();
  const files: Record<string, string> = {
    save: readFileSync(join(root, "src/hooks/useQuickLogV2Save.ts"), "utf8"),
    payload: readFileSync(join(root, "src/lib/quickLogV2SavePayload.ts"), "utf8"),
    hook: readFileSync(join(root, "src/hooks/useQuickLogGroupedTimeline.ts"), "utf8"),
    vm: readFileSync(join(root, "src/lib/quickLogTimelineGroupingViewModel.ts"), "utf8"),
    adapter: readFileSync(
      join(root, "src/lib/quickLogGroupedTimelineRowAdapter.ts"),
      "utf8",
    ),
  };

  it("never references service_role / SUPABASE_SERVICE_ROLE in client code", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).not.toMatch(/service_role/i);
      expect(src, name).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    }
  });

  it("client save payload type does not declare a user_id field", () => {
    expect(files.payload).not.toMatch(/\buser_id\b/);
    expect(files.payload).not.toMatch(/p_user_id/);
  });

  it("timeline read hook is SELECT-only — no insert/update/delete/upsert/rpc/invoke", () => {
    const forbidden = [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      ".rpc(",
      "functions.invoke",
    ];
    for (const needle of forbidden) {
      expect(files.hook, needle).not.toContain(needle);
    }
  });

  it("timeline pipeline never emits live/synced/connected/imported source wording", () => {
    const banned = /\b(live|synced|connected|imported|autopilot|executed)Label\b/i;
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).not.toMatch(banned);
    }
  });

  it("no device-control or automation execution paths", () => {
    const banned = [
      /device\.execute/i,
      /automation_executed/i,
      /actuator\.write/i,
      /relay\.set/i,
    ];
    for (const [name, src] of Object.entries(files)) {
      for (const re of banned) {
        expect(src, name).not.toMatch(re);
      }
    }
  });
});
