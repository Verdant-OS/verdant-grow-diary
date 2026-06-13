/**
 * Action Queue → Follow-up diary rules guard.
 *
 * Re-exercises the pure helper `src/lib/actionFollowupRules.ts` to lock in
 * the safety contract for the Action Queue completion → diary/timeline
 * memory loop. Pure-helper only; no I/O, no DB, no UI.
 *
 * The helper is already wired into `src/pages/ActionDetail.tsx`. This
 * suite is additive guard coverage requested by the
 * "Action Queue completion → follow-up diary entry / timeline memory
 * guard" task and intentionally does not introduce a parallel module.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_FOLLOWUP_DEFAULT_KIND,
  ACTION_FOLLOWUP_EVENT_TYPE,
  buildActionFollowupDiaryDraft,
  followupMatchesAction,
  isActionEligibleForFollowup,
  type CompletedActionInput,
} from "@/lib/actionFollowupRules";

const ACTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ALERT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function completed(overrides: Partial<CompletedActionInput> = {}): CompletedActionInput {
  return {
    id: ACTION_ID,
    grow_id: GROW_ID,
    tent_id: null,
    plant_id: null,
    target_metric: "humidity_pct",
    suggested_change: "Lower RH toward target",
    reason: `RH is too high vs target [alert:${ALERT_ID}]`,
    status: "completed",
    completed_at: "2026-06-13T10:00:00.000Z",
    ...overrides,
  };
}

describe("Action Queue follow-up rules — eligibility", () => {
  it("accepts a completed action with grow_id and id", () => {
    expect(isActionEligibleForFollowup(completed())).toBe(true);
  });

  it.each([
    ["pending_approval"],
    ["approved"],
    ["rejected"],
    ["cancelled"],
    ["dismissed"],
    ["in_progress"],
    [""],
    [null],
    [undefined],
  ])("rejects status=%s", (status) => {
    expect(
      isActionEligibleForFollowup(completed({ status: status as string | null })),
    ).toBe(false);
  });

  it("rejects missing id / grow_id", () => {
    expect(isActionEligibleForFollowup(completed({ id: null }))).toBe(false);
    expect(isActionEligibleForFollowup(completed({ id: "   " }))).toBe(false);
    expect(isActionEligibleForFollowup(completed({ grow_id: null }))).toBe(false);
    expect(isActionEligibleForFollowup(null)).toBe(false);
    expect(isActionEligibleForFollowup(undefined)).toBe(false);
  });
});

describe("Action Queue follow-up rules — draft builder", () => {
  it("builds a safe diary draft from a completed action", () => {
    const r = buildActionFollowupDiaryDraft(completed());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.grow_id).toBe(GROW_ID);
    expect(r.draft.details.event_type).toBe(ACTION_FOLLOWUP_EVENT_TYPE);
    expect(r.draft.details.action_queue_id).toBe(ACTION_ID);
    expect(r.draft.details.source_alert_id).toBe(ALERT_ID);
    expect(r.draft.details.followup_kind).toBe(ACTION_FOLLOWUP_DEFAULT_KIND);
    expect(typeof r.draft.note).toBe("string");
    expect(r.draft.note.length).toBeGreaterThan(0);
  });

  it("rejects non-completed / missing-context inputs", () => {
    expect(buildActionFollowupDiaryDraft(null).ok).toBe(false);
    expect(
      buildActionFollowupDiaryDraft(completed({ status: "pending_approval" })).ok,
    ).toBe(false);
    expect(buildActionFollowupDiaryDraft(completed({ id: null })).ok).toBe(false);
    expect(buildActionFollowupDiaryDraft(completed({ grow_id: null })).ok).toBe(false);
  });

  it("never includes user_id in the draft (DB default auth.uid() is the source of truth)", () => {
    const r = buildActionFollowupDiaryDraft(completed());
    if (!r.ok) throw new Error("expected ok");
    expect(Object.keys(r.draft)).not.toContain("user_id");
    expect(Object.keys(r.draft.details)).not.toContain("user_id");
  });

  it("never claims the plant improved — uses re-check / review language", () => {
    const variants: Array<Partial<CompletedActionInput>> = [
      { target_metric: "humidity_pct", reason: "RH too high" },
      { target_metric: "humidity_pct", reason: "RH too low" },
      { target_metric: "temperature_c", reason: "Temp too high" },
      { target_metric: "temperature_c", reason: "Temp too low" },
      { target_metric: "vpd_kpa", reason: "VPD too high" },
      { target_metric: "vpd_kpa", reason: "VPD too low" },
      { target_metric: "co2_ppm", reason: "" },
      { target_metric: "root_zone_temp_c", reason: "" },
      { target_metric: "unknown_metric", reason: "" },
    ];
    for (const v of variants) {
      const r = buildActionFollowupDiaryDraft(completed(v));
      if (!r.ok) throw new Error("expected ok");
      const note = r.draft.note.toLowerCase();
      // Note must ask the grower to verify; must not assert the plant
      // is already fixed/cured/healed (those would be unverified claims).
      expect(note).not.toMatch(/\b(fixed|cured|healed|healthy now|problem solved)\b/i);
      expect(note).toMatch(/re-check|review|note|confirm/);
    }
  });

  it("never emits raw payloads, device commands, AI claims, or sensitive tokens", () => {
    const r = buildActionFollowupDiaryDraft(
      completed({
        suggested_change: "Lower RH toward target",
        reason: `RH too high vs target [alert:${ALERT_ID}]`,
      }),
    );
    if (!r.ok) throw new Error("expected ok");
    const json = JSON.stringify(r.draft).toLowerCase();
    for (const forbidden of [
      "service_role",
      "bridge_token",
      "raw_payload",
      "functions.invoke",
      "mqtt",
      "webhook",
      "relay",
      "actuator",
      "turn on",
      "turn off",
      "set fan",
      "set humidifier",
      "set dehumidifier",
      "set light",
      "ai-coach",
      "ai_doctor",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("preserves an [alert:<id>] back-pointer for memory linkage", () => {
    const r = buildActionFollowupDiaryDraft(completed());
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.details.source_alert_id).toBe(ALERT_ID);
    expect(r.draft.details.action_queue_id).toBe(ACTION_ID);
  });
});

describe("Action Queue follow-up rules — idempotency matcher", () => {
  it("matches a diary row carrying the same action_queue_id + event_type", () => {
    expect(
      followupMatchesAction(
        { details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: ACTION_ID } },
        ACTION_ID,
      ),
    ).toBe(true);
  });

  it("does not match unrelated event types or other action ids", () => {
    expect(
      followupMatchesAction(
        { details: { event_type: "watering", action_queue_id: ACTION_ID } },
        ACTION_ID,
      ),
    ).toBe(false);
    expect(
      followupMatchesAction(
        { details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: "other" } },
        ACTION_ID,
      ),
    ).toBe(false);
    expect(followupMatchesAction(null, ACTION_ID)).toBe(false);
    expect(followupMatchesAction({ details: null }, ACTION_ID)).toBe(false);
    expect(
      followupMatchesAction(
        { details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: ACTION_ID } },
        null,
      ),
    ).toBe(false);
  });
});

describe("Action Queue follow-up rules — static safety of helper module", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../lib/actionFollowupRules.ts"),
    "utf8",
  );

  it("contains no DB / RPC / network / secret references", () => {
    for (const forbidden of [
      "service_role",
      "bridge_token",
      "functions.invoke",
      "supabase.from",
      ".rpc(",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "fetch(",
      "raw_payload",
    ]) {
      expect(src.includes(forbidden), `helper must not reference ${forbidden}`).toBe(false);
    }
  });

  it("contains no device-control verbs", () => {
    for (const verb of [
      /\bturn on\b/i,
      /\bturn off\b/i,
      /\bset fan\b/i,
      /\bset humidifier\b/i,
      /\bset dehumidifier\b/i,
      /\bset light\b/i,
      /\brelay\b/i,
      /\bactuator\b/i,
      /\bmqtt\b/i,
      /\bwebhook\b/i,
    ]) {
      expect(verb.test(src), `helper must not reference ${verb}`).toBe(false);
    }
  });
});
