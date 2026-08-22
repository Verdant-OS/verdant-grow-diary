/**
 * One-Tent Loop Proof — pure rules tests.
 *
 * Covers happy path, missing/blocked propagation, stale/invalid/demo
 * telemetry safety, Action Queue approval-required guard, device-command
 * safety flag, and AI Doctor missing-context enumeration.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateLoop,
  evaluateSensorSnapshot,
  evaluateActionQueue,
  evaluateAiDoctor,
  evaluateAlert,
  enrichLoopStepRow,
  LOOP_STEP_IDS,
  type LoopEvidence,
  type LoopStepRow,
  type SensorSourceLabel,
} from "@/lib/oneTentLoopProofRules";

const NOW = Date.parse("2026-06-09T12:00:00.000Z");

function fresh(): LoopEvidence {
  return {
    grow: { id: "g1", name: "Grow A", stage: "veg", status: "active" },
    tent: { id: "t1", name: "Tent A", grow_id: "g1", has_environment_target: true },
    plant: {
      id: "p1",
      name: "Plant A",
      stage: "veg",
      medium: "coco",
      pot_size: "3 gal",
      tent_id: "t1",
    },
    latest_quick_log: {
      id: "d1",
      entry_at: "2026-06-09T11:00:00.000Z",
      entry_type: "note",
      has_note: true,
      has_photo: true,
      has_action_context: false,
      plant_id: "p1",
      tent_id: "t1",
    },
    timeline: { event_count: 5, latest_entry_id: "d1", linked_directly: true },
    latest_sensor_snapshot: {
      source: "live",
      captured_at: "2026-06-09T11:55:00.000Z",
      confidence: 0.9,
      metric: "temp",
      has_usable_metric: true,
    },
    latest_ai_doctor: {
      session_id: "s1",
      created_at: "2026-06-09T11:30:00.000Z",
      had_plant_stage: true,
      had_medium: true,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: true,
      had_recent_sensor_snapshot: true,
      had_alerts: true,
    },
    latest_alert: {
      id: "a1",
      metric: "temp",
      severity: "warning",
      reason: "temp above target",
      status: "open",
      created_at: "2026-06-09T11:00:00.000Z",
    },
    latest_action_queue: {
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_control_marker: false,
      has_target_device: false,
      source: "environment_alert",
      reason: "raise humidity [alert:a1]",
      risk_level: "low",
      linked_alert_id: "a1",
    },
    latest_follow_up: { id: "f1", kind: "diary", entry_at: "2026-06-09T11:40:00.000Z" },
    now_ms: NOW,
  };
}

describe("oneTentLoopProofRules — evaluateLoop", () => {
  it("returns all 10 loop steps in canonical order", () => {
    const rows = evaluateLoop(fresh());
    expect(rows.map((r) => r.id)).toEqual([...LOOP_STEP_IDS]);
  });

  it("complete fresh evidence marks all steps passed", () => {
    const rows = evaluateLoop(fresh());
    for (const r of rows) expect(r.status).toBe("passed");
  });

  it("does not pass an AI Doctor Action Queue advisory when its selected session needs review", () => {
    const evidence = fresh();
    evidence.latest_ai_doctor = {
      ...evidence.latest_ai_doctor!,
      context_provenance: "current_state_reconstructed",
    };
    evidence.latest_action_queue = {
      ...evidence.latest_action_queue!,
      source: "ai_doctor",
      linked_alert_id: null,
      linked_ai_doctor_session_id: "s1",
    };

    const byId = Object.fromEntries(evaluateLoop(evidence).map((row) => [row.id, row]));
    expect(byId["ai-doctor"].status).toBe("needs_review");
    expect(byId["action-queue"].status).toBe("needs_review");
  });

  it("does not pass an alert-derived Action Queue advisory when its selected alert needs review", () => {
    const evidence = fresh();
    evidence.latest_alert = { ...evidence.latest_alert!, status: "resolved" };

    const byId = Object.fromEntries(evaluateLoop(evidence).map((row) => [row.id, row]));
    expect(byId["alert"].status).toBe("needs_review");
    expect(byId["action-queue"].status).toBe("needs_review");
  });

  it("missing grow blocks tent and plant downstream", () => {
    const rows = evaluateLoop({ ...fresh(), grow: null, tent: null, plant: null });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId["grow"]).toBe("missing");
    expect(byId["tent"]).toBe("blocked");
    expect(byId["plant"]).toBe("blocked");
  });

  it("missing tent blocks plant + quick log evaluation", () => {
    const ev = fresh();
    ev.tent = null;
    ev.plant = null;
    ev.latest_quick_log = null;
    const rows = evaluateLoop(ev);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(byId["tent"]).toBe("missing");
    expect(byId["plant"]).toBe("blocked");
    expect(byId["quick-log"]).toBe("blocked");
  });

  it("plant with missing stage/medium/pot_size returns needs_review", () => {
    const ev = fresh();
    ev.plant = { id: "p1", name: "P", tent_id: "t1" };
    const rows = evaluateLoop(ev);
    const plant = rows.find((r) => r.id === "plant")!;
    expect(plant.status).toBe("needs_review");
    expect(plant.missing_info.join(" ")).toMatch(/Stage unknown/);
    expect(plant.missing_info.join(" ")).toMatch(/Medium unknown/);
    expect(plant.missing_info.join(" ")).toMatch(/Pot size unknown/);
  });
});

describe("evaluateSensorSnapshot — never healthy for bad data", () => {
  it("missing snapshot is missing (never passed)", () => {
    const row = evaluateSensorSnapshot(null, NOW);
    expect(row.status).toBe("missing");
    expect(row.safety_note.toLowerCase()).toMatch(/never shown as healthy/);
  });
  it("invalid source is invalid", () => {
    const row = evaluateSensorSnapshot(
      { source: "invalid", captured_at: "2026-06-09T11:59:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("invalid");
  });
  it("demo source is demo_only", () => {
    const row = evaluateSensorSnapshot(
      { source: "demo", captured_at: "2026-06-09T11:59:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("demo_only");
  });
  it("live snapshot older than 15 min is stale", () => {
    const row = evaluateSensorSnapshot(
      { source: "live", captured_at: "2026-06-09T11:30:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("stale");
  });
  it("manual snapshot within 24h is needs_review (not live)", () => {
    const row = evaluateSensorSnapshot(
      { source: "manual", captured_at: "2026-06-09T05:00:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("needs_review");
    expect(row.safety_note.toLowerCase()).toMatch(/manual reading/);
  });
  it("fresh live snapshot is passed", () => {
    const row = evaluateSensorSnapshot(
      {
        source: "live",
        captured_at: "2026-06-09T11:55:00.000Z",
        has_usable_metric: true,
      },
      NOW,
    );
    expect(row.status).toBe("passed");
  });

  it("rejects a live snapshot one millisecond after injected now while keeping exact-now eligible", () => {
    const exactNow = evaluateSensorSnapshot(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00.000Z",
        has_usable_metric: true,
      },
      NOW,
    );
    const future = evaluateSensorSnapshot(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00.001Z",
        has_usable_metric: true,
      },
      NOW,
    );

    expect(exactNow.status).toBe("passed");
    expect(future.status).toBe("invalid");
    expect(future.missing_info.join(" ")).toMatch(/future/i);
  });

  it("marks a fresh live snapshot without explicit usable-metric proof as needs_review", () => {
    const row = evaluateSensorSnapshot(
      { source: "live", captured_at: "2026-06-09T11:55:00.000Z" },
      NOW,
    );
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/finite recognized metric/i);
  });

  it("marks a fresh live snapshot with no finite recognized metric as needs_review", () => {
    const row = evaluateSensorSnapshot(
      {
        source: "live",
        captured_at: "2026-06-09T11:55:00.000Z",
        has_usable_metric: false,
      } as never,
      NOW,
    );
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/finite recognized metric/i);
  });
});

describe("evaluateAiDoctor — missing context enumerated", () => {
  it("missing session is missing", () => {
    const row = evaluateAiDoctor(null);
    expect(row.status).toBe("missing");
  });
  it("lists exactly which context pieces are missing", () => {
    const row = evaluateAiDoctor({
      session_id: "s1",
      created_at: "2026-06-09T11:00:00.000Z",
      had_plant_stage: false,
      had_medium: false,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: false,
      had_recent_sensor_snapshot: true,
      had_alerts: false,
    });
    expect(row.status).toBe("needs_review");
    const joined = row.missing_info.join(" ");
    expect(joined).toMatch(/plant stage/);
    expect(joined).toMatch(/medium/);
    expect(joined).toMatch(/recent photo/);
    expect(joined).toMatch(/alerts/);
    expect(joined).not.toMatch(/pot size/);
  });

  it("does not pass context reconstructed from current app state as frozen session evidence", () => {
    const row = evaluateAiDoctor({
      session_id: "s1",
      created_at: "2026-06-09T11:00:00.000Z",
      had_plant_stage: true,
      had_medium: true,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: true,
      had_recent_sensor_snapshot: true,
      had_alerts: true,
      context_provenance: "current_state_reconstructed",
      session_scope_matches_selected_context: true,
    } as never);
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/reconstructed.*not frozen/i);
  });

  it("does not pass a session whose persisted scope mismatches the selected grow, tent, or plant", () => {
    const row = evaluateAiDoctor({
      session_id: "s1",
      created_at: "2026-06-09T11:00:00.000Z",
      had_plant_stage: true,
      had_medium: true,
      had_pot_size: true,
      had_recent_log: true,
      had_recent_photo: true,
      had_recent_sensor_snapshot: true,
      had_alerts: true,
      context_provenance: "frozen_session",
      session_scope_matches_selected_context: false,
    } as never);
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/scope.*selected/i);
  });
});

describe("evaluateAlert — scoped, active, trusted evidence", () => {
  const TRUSTED_ALERT = {
    id: "a1",
    metric: "temp",
    severity: "warning",
    reason: "temperature above target",
    status: "open",
    created_at: "2026-06-09T11:00:00.000Z",
    source: "environment_alerts",
    scope_matches_selected_context: true,
    has_trusted_event_reference: true,
  } as const;

  it.each([
    [
      "is not scoped to the selected grow, tent, and plant",
      { scope_matches_selected_context: false },
    ],
    ["is resolved", { status: "resolved" }],
    ["is dismissed", { status: "dismissed" }],
    ["has an unknown source", { source: "unknown-source" }],
    ["has no trusted originating event reference", { has_trusted_event_reference: false }],
  ])("needs review when it %s", (_label, override) => {
    const row = evaluateAlert({ ...TRUSTED_ALERT, ...override } as never);
    expect(row.status).toBe("needs_review");
  });
});

describe("evaluateActionQueue — persisted approval and provenance", () => {
  it("missing row is missing", () => {
    const row = evaluateActionQueue(null);
    expect(row.status).toBe("missing");
    expect(row.safety_note.toLowerCase()).toMatch(/approval required/);
    expect(row.safety_note.toLowerCase()).toMatch(/no device command/);
  });
  it("row with an executable command marker is blocked as unsafe", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_control_marker: true,
    });
    expect(row.status).toBe("blocked");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/executable device command/);
  });
  it("row not marked approval_required is blocked", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "queued",
      approval_required: false,
      has_device_control_marker: false,
    });
    expect(row.status).toBe("blocked");
  });
  it("approval-required row without device command is passed", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "environment_alert",
        reason: "raise rh [alert:a1]",
        risk_level: "low",
        linked_alert_id: "a1",
      },
      { alert_id: "a1", alert_status: "passed" },
    );
    expect(row.status).toBe("passed");
    expect(row.deep_link).toBe("/actions/aq1");
    expect(row.evidence.join(" ").toLowerCase()).toMatch(/approval required/);
    expect(row.evidence.join(" ").toLowerCase()).toMatch(/no device command/);
    expect(row.evidence.join(" ")).toMatch(/Alert-derived advisory/);
  });

  it("fails closed when an alert-derived advisory has a matching id but no passed alert eligibility", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "environment_alert",
        reason: "Review humidity [alert:a1]",
        linked_alert_id: "a1",
      },
      { alert_id: "a1", alert_status: "needs_review" },
    );

    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/selected alert.*not eligible/i);
  });

  it("marks a persisted target device for review without treating it as an executed command", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: true,
        source: "environment_alert",
        linked_alert_id: "a1",
      },
      { alert_id: "a1", alert_status: "passed" },
    );
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/target device/);
    expect(row.missing_info.join(" ").toLowerCase()).not.toMatch(/executed/);
  });

  it("does not pass an environment alert action linked to a different alert", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "environment_alert",
        linked_alert_id: "other-alert",
      },
      { alert_id: "a1", alert_status: "passed" },
    );
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/matching.*alert/);
  });

  it("does not pass a row whose persisted status is not pending approval", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "approved",
      approval_required: true,
      has_device_control_marker: false,
      has_target_device: false,
      source: "ai_coach",
    });
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/pending approval/);
  });

  it("keeps a matching AI Doctor advisory as non-alert recommendation evidence", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "ai_doctor",
        linked_ai_doctor_session_id: "s1",
      },
      { ai_doctor_session_id: "s1", ai_doctor_status: "passed" },
    );
    expect(row.status).toBe("passed");
    expect(row.evidence.join(" ")).toMatch(/AI Doctor advisory/);
    expect(row.evidence.join(" ")).not.toMatch(/originating alert/i);
  });

  it("fails closed when an AI Doctor advisory has a matching id but no passed session eligibility", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "ai_doctor",
        linked_ai_doctor_session_id: "s1",
      },
      { ai_doctor_session_id: "s1" },
    );

    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/selected ai doctor session.*not eligible/i);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["whitespace", "   "],
  ])(
    "requires a nonempty matching AI Doctor session token when the back-pointer is %s",
    (_label, linkedSessionId) => {
      const row = evaluateActionQueue(
        {
          id: "aq1",
          status: "pending_approval",
          approval_required: true,
          has_device_control_marker: false,
          has_target_device: false,
          source: "ai_doctor",
          linked_ai_doctor_session_id: linkedSessionId,
        },
        { ai_doctor_session_id: "s1", ai_doctor_status: "passed" },
      );
      expect(row.status).toBe("needs_review");
      expect(row.missing_info.join(" ")).toMatch(/nonempty.*session/i);
    },
  );

  it("keeps AI Coach advice distinct from alert-derived evidence", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "ai_coach",
        plant_id: "p1",
      },
      { selected_plant_id: "p1" },
    );
    expect(row.status).toBe("passed");
    expect(row.evidence.join(" ")).toMatch(/AI Coach advisory/);
  });

  it("fails closed when an AI Coach advisory belongs to another plant", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "ai_coach",
        plant_id: "p-other",
      },
      { selected_plant_id: "p1" },
    );

    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ")).toMatch(/selected plant/i);
  });

  it("does not pass a manual or unknown source as Alert or AI evidence", () => {
    const row = evaluateActionQueue({
      id: "aq1",
      status: "pending_approval",
      approval_required: true,
      has_device_control_marker: false,
      has_target_device: false,
      source: "manual",
    });
    expect(row.status).toBe("needs_review");
    expect(row.missing_info.join(" ").toLowerCase()).toMatch(/provenance/);
  });

  it("never re-emits internal alert or session back-pointers in proof evidence", () => {
    const row = evaluateActionQueue(
      {
        id: "aq1",
        status: "pending_approval",
        approval_required: true,
        has_device_control_marker: false,
        has_target_device: false,
        source: "ai_doctor",
        reason: "Review humidity [alert:alert-1] [session:session-1]",
        linked_ai_doctor_session_id: "session-1",
      },
      { ai_doctor_session_id: "session-1", ai_doctor_status: "passed" },
    );
    const rendered = [...row.evidence, ...row.missing_info].join(" ");
    expect(rendered).not.toMatch(/\[alert:/);
    expect(rendered).not.toMatch(/\[session:/);
  });
});

// ---------------------------------------------------------------------------
// Never-healthy invariant helpers
// ---------------------------------------------------------------------------

/**
 * Detect unsafe healthy-claim wording while allowing honest negations that
 * the rules helpers may legitimately use ("not healthy", "never shown as
 * healthy", "excluded from healthy status").
 */
function hasUnsafeHealthyClaim(text: string): boolean {
  let scrubbed = text.toLowerCase();
  const allowedNegations = [
    /not healthy/g,
    /never shown as healthy/g,
    /never healthy/g,
    /excluded from healthy(?: status)?/g,
  ];
  for (const re of allowedNegations) scrubbed = scrubbed.replace(re, "");
  return /\bhealthy\b|\bok\b|\bnormal\b|\bverified\b|\bsuccess\b|all good|no issues detected/.test(
    scrubbed,
  );
}

function collectRowText(row: LoopStepRow): string {
  return [
    row.status,
    row.safety_note,
    ...row.evidence,
    ...row.missing_info,
    row.drilldown?.what_is_missing ?? "",
    row.drilldown?.why_it_matters ?? "",
    row.drilldown?.where_to_record ?? "",
  ].join(" \n ");
}

const NOW_MS = Date.parse("2026-06-09T12:00:00.000Z");
const FRESH_ISO = "2026-06-09T11:58:00.000Z";
const OLD_ISO = "2026-06-01T00:00:00.000Z"; // >> 24h
const STALE_LIVE_ISO = "2026-06-09T11:30:00.000Z"; // 30 min old, live
const NON_TELEMETRY_SOURCES: SensorSourceLabel[] = ["live", "manual", "csv", "demo"];

describe("never-healthy helper — self-check", () => {
  it("flags bare 'healthy' as unsafe", () => {
    expect(hasUnsafeHealthyClaim("Reading looks healthy.")).toBe(true);
  });
  it("allows honest negations", () => {
    expect(hasUnsafeHealthyClaim("Never shown as healthy.")).toBe(false);
    expect(hasUnsafeHealthyClaim("Excluded from healthy status.")).toBe(false);
    expect(hasUnsafeHealthyClaim("Not healthy — needs review.")).toBe(false);
  });
  it("flags OK/normal/verified/success wording", () => {
    expect(hasUnsafeHealthyClaim("All OK now.")).toBe(true);
    expect(hasUnsafeHealthyClaim("normal reading")).toBe(true);
    expect(hasUnsafeHealthyClaim("verified reading")).toBe(true);
    expect(hasUnsafeHealthyClaim("Save success")).toBe(true);
    expect(hasUnsafeHealthyClaim("all good today")).toBe(true);
    expect(hasUnsafeHealthyClaim("no issues detected")).toBe(true);
  });
});

describe("evaluateSensorSnapshot — stale across all telemetry sources", () => {
  for (const source of NON_TELEMETRY_SOURCES) {
    it(`stale ${source} snapshot is never passed and never claims healthy`, () => {
      const captured_at = source === "live" ? STALE_LIVE_ISO : OLD_ISO;
      const row = evaluateSensorSnapshot({ source, captured_at, confidence: 0.9 }, NOW_MS);
      expect(row.status).not.toBe("passed");
      expect(row.status).not.toBe("needs_review");
      if (source === "demo") {
        expect(row.status).toBe("demo_only");
      } else {
        expect(row.status).toBe("stale");
      }
      const enriched = enrichLoopStepRow(row, {
        grow: null,
        tent: null,
        plant: null,
        latest_quick_log: null,
        timeline: null,
        latest_sensor_snapshot: { source, captured_at },
        latest_ai_doctor: null,
        latest_alert: null,
        latest_action_queue: null,
        latest_follow_up: null,
      });
      expect(enriched.provenance === "stale" || enriched.provenance === "demo_only").toBe(true);
      expect(hasUnsafeHealthyClaim(collectRowText(enriched))).toBe(false);
    });
  }

  it("explicit source='stale' returns stale regardless of freshness", () => {
    const row = evaluateSensorSnapshot({ source: "stale", captured_at: FRESH_ISO }, NOW_MS);
    expect(row.status).toBe("stale");
    expect(hasUnsafeHealthyClaim(collectRowText(row))).toBe(false);
  });
});

describe("evaluateSensorSnapshot — invalid across all telemetry sources", () => {
  it("explicit source='invalid' returns invalid and never claims healthy", () => {
    const row = evaluateSensorSnapshot({ source: "invalid", captured_at: FRESH_ISO }, NOW_MS);
    expect(row.status).toBe("invalid");
    expect(row.status).not.toBe("passed");
    expect(row.status).not.toBe("needs_review");
    expect(hasUnsafeHealthyClaim(collectRowText(row))).toBe(false);
  });

  // Structural invalidity across sources (missing/malformed captured_at)
  for (const source of NON_TELEMETRY_SOURCES) {
    it(`${source} snapshot with malformed captured_at is never passed`, () => {
      const row = evaluateSensorSnapshot({ source, captured_at: "not-a-date" }, NOW_MS);
      // Live requires verifiable freshness → stale. Manual/csv → needs_review
      // (still not passed). Demo → demo_only.
      expect(row.status).not.toBe("passed");
      if (source === "live") expect(row.status).toBe("stale");
      if (source === "demo") expect(row.status).toBe("demo_only");
      expect(hasUnsafeHealthyClaim(collectRowText(row))).toBe(false);
    });

    it(`${source} snapshot with null captured_at is never passed`, () => {
      const row = evaluateSensorSnapshot({ source, captured_at: null }, NOW_MS);
      expect(row.status).not.toBe("passed");
      if (source === "live") expect(row.status).toBe("stale");
      if (source === "demo") expect(row.status).toBe("demo_only");
      expect(hasUnsafeHealthyClaim(collectRowText(row))).toBe(false);
    });
  }
});

describe("evaluateSensorSnapshot — unknown / malformed telemetry", () => {
  const cases: Array<{ name: string; input: unknown }> = [
    { name: "null snapshot", input: null },
    { name: "source missing", input: { source: null, captured_at: FRESH_ISO } },
    { name: "source undefined", input: { source: undefined, captured_at: FRESH_ISO } },
    { name: "source empty string", input: { source: "", captured_at: FRESH_ISO } },
    {
      name: "source outside allowed labels ('unknown')",
      input: { source: "unknown", captured_at: FRESH_ISO },
    },
    {
      name: "source outside allowed labels ('bogus')",
      input: { source: "bogus", captured_at: FRESH_ISO },
    },
    { name: "source is number", input: { source: 42, captured_at: FRESH_ISO } },
    { name: "source is object", input: { source: { hax: 1 }, captured_at: FRESH_ISO } },
  ];

  for (const c of cases) {
    it(`${c.name} is never passed and never claims healthy`, () => {
      const row = evaluateSensorSnapshot(c.input as never, NOW_MS);
      expect(row.status).not.toBe("passed");
      expect(["missing", "invalid", "needs_review"]).toContain(row.status);
      const enriched = enrichLoopStepRow(row, {
        grow: null,
        tent: null,
        plant: null,
        latest_quick_log: null,
        timeline: null,
        latest_sensor_snapshot: (c.input as never) ?? null,
        latest_ai_doctor: null,
        latest_alert: null,
        latest_action_queue: null,
        latest_follow_up: null,
      });
      // Unknown telemetry must never advertise "direct" (passed) provenance.
      expect(enriched.provenance).not.toBe("direct");
      expect(hasUnsafeHealthyClaim(collectRowText(enriched))).toBe(false);
    });
  }
});

describe("evaluateLoop — text report never claims healthy for bad telemetry", () => {
  const base = (): LoopEvidence => ({
    grow: { id: "g1", name: "G", stage: "veg", status: "active" },
    tent: { id: "t1", name: "T", grow_id: "g1", has_environment_target: true },
    plant: { id: "p1", name: "P", stage: "veg", medium: "coco", pot_size: "3 gal", tent_id: "t1" },
    latest_quick_log: null,
    timeline: null,
    latest_sensor_snapshot: null,
    latest_ai_doctor: null,
    latest_alert: null,
    latest_action_queue: null,
    latest_follow_up: null,
    now_ms: NOW_MS,
  });

  const scenarios: Array<{ name: string; snap: LoopEvidence["latest_sensor_snapshot"] }> = [
    { name: "stale live", snap: { source: "live", captured_at: STALE_LIVE_ISO } },
    { name: "invalid", snap: { source: "invalid", captured_at: FRESH_ISO } },
    { name: "demo", snap: { source: "demo", captured_at: FRESH_ISO } },
    { name: "unknown", snap: { source: "unknown" as never, captured_at: FRESH_ISO } },
    { name: "missing", snap: null },
  ];

  for (const s of scenarios) {
    it(`${s.name} snapshot: sensor step + full row text stays never-healthy`, () => {
      const ev = { ...base(), latest_sensor_snapshot: s.snap };
      const rows = evaluateLoop(ev);
      const sensor = rows.find((r) => r.id === "sensor-snapshot")!;
      expect(sensor.status).not.toBe("passed");
      for (const r of rows) {
        expect(hasUnsafeHealthyClaim(collectRowText(r))).toBe(false);
      }
    });
  }
});
