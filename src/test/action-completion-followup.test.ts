/**
 * Action completion → follow-up diary entry.
 *
 * Pure-rules tests + static safety assertions on ActionDetail wiring.
 * No live DB. No automation. No device control. No alert mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ACTION_FOLLOWUP_DEFAULT_KIND,
  ACTION_FOLLOWUP_EVENT_TYPE,
  buildActionFollowupDiaryDraft,
  followupMatchesAction,
  followupNoteForAction,
  isActionEligibleForFollowup,
  type CompletedActionInput,
} from "@/lib/actionFollowupRules";
import { buildTransitionPatch } from "@/lib/actionQueueTransitions";

const ROOT = resolve(__dirname, "../..");
const ACTION_DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const ALERT_DETAIL = readFileSync(resolve(ROOT, "src/pages/AlertDetail.tsx"), "utf8");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/actionFollowupRules.ts"), "utf8");

function baseCompleted(overrides: Partial<CompletedActionInput> = {}): CompletedActionInput {
  return {
    id: "action-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: null,
    target_metric: "humidity_pct",
    suggested_change: "Review humidity control and increase airflow.",
    reason: "Humidity is high (78% > 65%) [alert:alert-99]",
    status: "completed",
    completed_at: "2026-05-26T10:00:00.000Z",
    ...overrides,
  };
}

describe("actionFollowupRules — note picker", () => {
  it("maps high humidity to the 24h RH re-check note", () => {
    expect(followupNoteForAction({ target_metric: "humidity_pct", reason: "high" })).toBe(
      "Re-check RH in ~24h and confirm humidity stayed closer to target.",
    );
  });
  it("maps low humidity to the dry-room re-check note", () => {
    expect(followupNoteForAction({ target_metric: "humidity_pct", reason: "low" })).toBe(
      "Re-check RH in ~24h and confirm the room is not too dry.",
    );
  });
  it("maps temp high/low deterministically", () => {
    expect(followupNoteForAction({ target_metric: "temperature_c", reason: "high" })).toBe(
      "Re-check temperature in ~24h and confirm heat load improved.",
    );
    expect(followupNoteForAction({ target_metric: "temperature_c", reason: "low" })).toBe(
      "Re-check temperature in ~24h and confirm the tent is staying warm enough.",
    );
  });
  it("maps VPD high/low deterministically", () => {
    expect(followupNoteForAction({ target_metric: "vpd_kpa", reason: "high" })).toBe(
      "Re-check VPD in ~24h and confirm temp/RH balance improved.",
    );
    expect(followupNoteForAction({ target_metric: "vpd_kpa", reason: "low" })).toBe(
      "Re-check VPD in ~24h and confirm humidity/airflow improved.",
    );
  });
  it("CO2 returns context-only note (no optimization advice)", () => {
    const note = followupNoteForAction({ target_metric: "co2_ppm", reason: "high" });
    expect(note).toBe("Re-check CO2 in ~24h as context only; do not optimize around CO2 alone.");
    expect(note).not.toMatch(/increase|decrease|raise|lower|adjust/i);
  });
  it("soil / moisture / root-zone metrics map to root-zone re-check", () => {
    const expected = "Re-check the root-zone reading in ~24h and compare against plant response.";
    expect(followupNoteForAction({ target_metric: "soil_moisture_pct", reason: "low" })).toBe(
      expected,
    );
    expect(followupNoteForAction({ target_metric: "root_zone_temp_c", reason: "low" })).toBe(
      expected,
    );
  });
  it("unknown / missing metric returns generic re-check note", () => {
    expect(followupNoteForAction({ target_metric: null, reason: null })).toBe(
      "Re-check the related condition in ~24h and note whether the plant response improved.",
    );
    expect(followupNoteForAction({ target_metric: "mystery_metric", reason: "high" })).toBe(
      "Re-check the related condition in ~24h and note whether the plant response improved.",
    );
  });
});

describe("actionFollowupRules — draft builder", () => {
  it("builds a complete draft from a completed high-humidity action", () => {
    const r = buildActionFollowupDiaryDraft(baseCompleted());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.grow_id).toBe("grow-1");
    expect(r.draft.tent_id).toBe("tent-1");
    expect(r.draft.plant_id).toBeNull();
    expect(r.draft.note).toMatch(/Re-check RH in ~24h/);
    expect(r.draft.details.event_type).toBe(ACTION_FOLLOWUP_EVENT_TYPE);
    expect(r.draft.details.followup_kind).toBe(ACTION_FOLLOWUP_DEFAULT_KIND);
    expect(r.draft.details.action_queue_id).toBe("action-1");
    expect(r.draft.details.source_alert_id).toBe("alert-99");
    expect(r.draft.details.metric).toBe("humidity_pct");
    expect(r.draft.details.suggested_change).toBe("Review humidity control and increase airflow.");
    expect(r.draft.details.reason).toContain("[alert:alert-99]");
    expect(r.draft.details.completed_at).toBe("2026-05-26T10:00:00.000Z");
  });

  it("extracts source alert id from [alert:<id>] in reason", () => {
    const r = buildActionFollowupDiaryDraft(baseCompleted({ reason: "Temp high [alert:abc-123]" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.details.source_alert_id).toBe("abc-123");
  });

  it("source_alert_id is null when no back-pointer present", () => {
    const r = buildActionFollowupDiaryDraft(baseCompleted({ reason: "Plain reason, no token" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.details.source_alert_id).toBeNull();
  });

  it("handles missing metric/reason/suggested_change safely", () => {
    const r = buildActionFollowupDiaryDraft(
      baseCompleted({
        target_metric: null,
        suggested_change: null,
        reason: null,
        completed_at: null,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.details.metric).toBeNull();
    expect(r.draft.details.suggested_change).toBeNull();
    expect(r.draft.details.reason).toBeNull();
    expect(r.draft.details.completed_at).toBeNull();
    expect(r.draft.details.source_alert_id).toBeNull();
    expect(r.draft.note).toMatch(/Re-check the related condition/);
  });

  it("rejects when action context is missing", () => {
    expect(buildActionFollowupDiaryDraft(null).ok).toBe(false);
    expect(buildActionFollowupDiaryDraft(baseCompleted({ id: null })).ok).toBe(false);
    expect(buildActionFollowupDiaryDraft(baseCompleted({ id: "" })).ok).toBe(false);
    expect(buildActionFollowupDiaryDraft(baseCompleted({ grow_id: null })).ok).toBe(false);
    expect(buildActionFollowupDiaryDraft(baseCompleted({ grow_id: "   " })).ok).toBe(false);
  });

  it("rejects non-completed actions (approve/reject/cancel/simulate/pending)", () => {
    for (const status of ["pending_approval", "approved", "rejected", "simulated", "cancelled"]) {
      expect(buildActionFollowupDiaryDraft(baseCompleted({ status })).ok).toBe(false);
    }
  });

  it("isActionEligibleForFollowup mirrors builder eligibility", () => {
    expect(isActionEligibleForFollowup(baseCompleted())).toBe(true);
    expect(isActionEligibleForFollowup(baseCompleted({ status: "approved" }))).toBe(false);
    expect(isActionEligibleForFollowup(null)).toBe(false);
    expect(isActionEligibleForFollowup(baseCompleted({ id: null }))).toBe(false);
  });

  it("draft NEVER includes user_id (let DB default auth.uid() win)", () => {
    const r = buildActionFollowupDiaryDraft(baseCompleted());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.draft)).not.toContain("user_id");
    expect(Object.keys(r.draft.details)).not.toContain("user_id");
  });

  it("draft NEVER emits device commands or aggressive grow advice", () => {
    const metrics = [
      "humidity_pct",
      "temperature_c",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
      "root_zone_ec",
      "unknown_metric",
    ];
    const directions = ["high", "low"];
    for (const m of metrics) {
      for (const d of directions) {
        const r = buildActionFollowupDiaryDraft(
          baseCompleted({ target_metric: m, reason: `${d} reading` }),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        const txt = r.draft.note.toLowerCase();
        expect(txt).not.toMatch(
          /mqtt|webhook|relay|actuator|home[- ]?assistant|pi[- ]?bridge|service_role|turn on|turn off|execute|nutrient|feed strength|ec to|ph to/,
        );
        expect(txt).toMatch(/re-check/);
      }
    }
  });
});

describe("actionFollowupRules — idempotency matcher", () => {
  it("matches rows tagged action_followup with the right action id", () => {
    const row = {
      details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: "action-1" },
    };
    expect(followupMatchesAction(row, "action-1")).toBe(true);
  });
  it("rejects mismatched / missing details safely", () => {
    expect(followupMatchesAction(null, "action-1")).toBe(false);
    expect(followupMatchesAction({ details: null }, "action-1")).toBe(false);
    expect(
      followupMatchesAction(
        { details: { event_type: "note", action_queue_id: "action-1" } },
        "action-1",
      ),
    ).toBe(false);
    expect(
      followupMatchesAction(
        { details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: "other" } },
        "action-1",
      ),
    ).toBe(false);
    expect(
      followupMatchesAction(
        { details: { event_type: ACTION_FOLLOWUP_EVENT_TYPE, action_queue_id: "action-1" } },
        null,
      ),
    ).toBe(false);
  });
});

describe("buildTransitionPatch preserves [alert:<id>] back-pointer", () => {
  it("never writes a reason field on any transition", () => {
    for (const kind of ["approve", "reject", "complete", "cancel", "simulate"] as const) {
      const patch = buildTransitionPatch(kind);
      expect(Object.keys(patch)).not.toContain("reason");
    }
  });
});

describe("ActionDetail — follow-up wiring (static)", () => {
  it("imports the pure helper, not an inline mapping table", () => {
    expect(ACTION_DETAIL).toMatch(/from "@\/lib\/actionFollowupRules"/);
    expect(ACTION_DETAIL).toMatch(/buildActionFollowupDiaryDraft/);
    expect(ACTION_DETAIL).toMatch(/followupMatchesAction/);
    // No duplicated metric → note table inline.
    expect(ACTION_DETAIL).not.toMatch(/Re-check RH in ~24h/);
    expect(ACTION_DETAIL).not.toMatch(/Re-check VPD in ~24h/);
    expect(ACTION_DETAIL).not.toMatch(/Re-check the root-zone reading/);
  });

  it("only triggers follow-up creation when transitioning to completed", () => {
    // The transition() function gates the call on new_status === "completed".
    expect(ACTION_DETAIL).toMatch(
      /if \(new_status === "completed"\)\s*\{\s*await maybeCreateFollowupDiaryEntry/,
    );
    // There is exactly one call site for the helper.
    const calls = ACTION_DETAIL.match(/maybeCreateFollowupDiaryEntry\(/g) ?? [];
    // One definition + one call = 2 occurrences.
    expect(calls.length).toBe(2);
  });

  it("never invokes the follow-up path from approve/reject/cancel/simulate dialogs", () => {
    // The helper is only reachable through the new_status === "completed" gate.
    // Sanity: the simulate toast is unchanged, and no direct diary insert sits
    // next to it.
    expect(ACTION_DETAIL).toMatch(/toast\.message\("Simulated/);
    expect(ACTION_DETAIL).not.toMatch(/Simulated[\s\S]{0,400}maybeCreateFollowupDiaryEntry/);
  });

  it("uses an idempotent contains() lookup before insert", () => {
    expect(ACTION_DETAIL).toMatch(/\.contains\(\s*"details"/);
    expect(ACTION_DETAIL).toMatch(/event_type: ACTION_FOLLOWUP_EVENT_TYPE/);
    expect(ACTION_DETAIL).toMatch(/action_queue_id: completed\.id/);
  });

  it("insert payload does NOT include user_id", () => {
    const insertBlock = ACTION_DETAIL.match(
      /\.from\("diary_entries"\)\s*\.insert\(\{([\s\S]*?)\}\)/,
    );
    expect(insertBlock).not.toBeNull();
    expect(insertBlock![1]).not.toMatch(/\buser_id\s*:/);
  });

  it("failure path is non-blocking (toast.warning, no rollback)", () => {
    expect(ACTION_DETAIL).toMatch(/Action completed, but follow-up note could not be created\./);
    expect(ACTION_DETAIL).not.toMatch(/maybeCreateFollowupDiaryEntry[\s\S]{0,400}rollback/i);
  });

  it("preserves existing action_queue_events audit insert path", () => {
    expect(ACTION_DETAIL).toMatch(/\.from\("action_queue_events"\)\.insert\(/);
    expect(ACTION_DETAIL).toMatch(/await logEvent\(current, event_type, new_status, note\)/);
  });

  it("does NOT mutate alerts when completing an action", () => {
    // Reads alerts (stale-source-alert warning) are allowed, but no .update/.insert
    // of alerts must happen inside the transition / follow-up path.
    expect(ACTION_DETAIL).not.toMatch(/\.from\("alerts"\)[\s\S]{0,400}\.update\(/);
    expect(ACTION_DETAIL).not.toMatch(/\.from\("alert_events"\)[\s\S]{0,400}\.insert\(/);
  });
});

describe("Static safety — actionFollowupRules + ActionDetail", () => {
  it("rules module contains no device-control surface or service_role", () => {
    // Strip block + line comments so the safety docstring (which legitimately
    // names the forbidden surfaces) doesn't trip the scan.
    const code = RULES.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
    expect(code).not.toMatch(/nutrient|feed strength|ec to|ph to|turn on|turn off|execute/i);
  });

  it("ActionDetail introduces no device-control surface", () => {
    // ActionDetail mentions "device" only in copy reassuring the grower that
    // no equipment command is sent ("No equipment command is sent"). It must
    // not reference any banned integration or privileged-key pattern.
    expect(ACTION_DETAIL).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });

  it("Coach + Alert paths unchanged (no follow-up wiring leaked into them)", () => {
    expect(COACH).not.toMatch(/actionFollowupRules/);
    expect(ALERT_DETAIL).not.toMatch(/actionFollowupRules/);
    expect(COACH).toMatch(/Action queued for approval\./);
    expect(ALERT_DETAIL).toMatch(/Action queued for approval\./);
  });
});

/**
 * Duplicate-completion + retry idempotency.
 *
 * Mirrors the production flow in ActionDetail.maybeCreateFollowupDiaryEntry():
 *   1. buildActionFollowupDiaryDraft(completed)
 *   2. lookup existing diary_entries where details contains
 *      { event_type: action_followup, action_queue_id: completed.id }
 *   3. if a match is found (verified via followupMatchesAction), bail out
 *   4. otherwise insert exactly one diary row
 *
 * The test uses a small in-memory fake of the Supabase chain so we can prove
 * that a second completion of the same action id never produces a second row,
 * regardless of timestamp drift or regenerated note text.
 */
describe("maybeCreateFollowupDiaryEntry — duplicate completion retry idempotency", () => {
  type DiaryRow = {
    id: string;
    grow_id: string;
    tent_id: string | null;
    plant_id: string | null;
    note: string;
    details: { event_type?: unknown; action_queue_id?: unknown } & Record<string, unknown>;
  };

  function makeFakeSupabase(initial: DiaryRow[] = []) {
    const rows: DiaryRow[] = [...initial];
    const insertCalls: Array<Record<string, unknown>> = [];
    let nextId = initial.length + 1;

    function from(_table: string) {
      const select = (_cols: string) => {
        const filters: Array<(r: DiaryRow) => boolean> = [];
        const api = {
          eq(col: keyof DiaryRow, val: unknown) {
            filters.push((r) => r[col] === val);
            return api;
          },
          contains(_col: "details", needle: Record<string, unknown>) {
            filters.push((r) =>
              Object.entries(needle).every(
                ([k, v]) => (r.details as Record<string, unknown>)[k] === v,
              ),
            );
            return api;
          },
          async limit(n: number) {
            const data = rows.filter((r) => filters.every((f) => f(r))).slice(0, n);
            return { data, error: null as null };
          },
        };
        return api;
      };
      const insert = async (payload: Record<string, unknown>) => {
        insertCalls.push(payload);
        rows.push({
          id: `diary-${nextId++}`,
          grow_id: payload.grow_id as string,
          tent_id: (payload.tent_id as string | null) ?? null,
          plant_id: (payload.plant_id as string | null) ?? null,
          note: payload.note as string,
          details: payload.details as DiaryRow["details"],
        });
        return { error: null as null };
      };
      return { select, insert };
    }
    return { from, rows, insertCalls };
  }

  // Mirrors ActionDetail.maybeCreateFollowupDiaryEntry() exactly: pure helpers
  // + lookup-by-action-id + idempotent bail-out + single insert.
  async function runFollowup(
    db: ReturnType<typeof makeFakeSupabase>,
    completed: CompletedActionInput,
  ): Promise<{ inserted: boolean }> {
    const result = buildActionFollowupDiaryDraft(completed);
    if (!result.ok) return { inserted: false };
    const { draft } = result;

    const lookup = await db
      .from("diary_entries")
      .select("id,details")
      .eq("grow_id", draft.grow_id)
      .contains("details", {
        event_type: ACTION_FOLLOWUP_EVENT_TYPE,
        action_queue_id: completed.id,
      })
      .limit(1);

    if (lookup.data && lookup.data.length > 0) {
      const row = lookup.data[0] as { id: string; details: unknown };
      if (
        followupMatchesAction(
          { details: row.details as { event_type?: unknown; action_queue_id?: unknown } | null },
          completed.id,
        )
      ) {
        return { inserted: false };
      }
    }

    await db.from("diary_entries").insert({
      grow_id: draft.grow_id,
      tent_id: draft.tent_id,
      plant_id: draft.plant_id,
      note: draft.note,
      details: draft.details,
    });
    return { inserted: true };
  }

  it("does not insert a second action_followup when the same action completion is retried", async () => {
    const db = makeFakeSupabase();
    const first = baseCompleted({ id: "action-dup-1", completed_at: "2026-05-26T10:00:00.000Z" });

    const r1 = await runFollowup(db, first);
    expect(r1.inserted).toBe(true);
    expect(db.rows.length).toBe(1);
    expect(db.insertCalls.length).toBe(1);

    // Retry with the same action id but a later completed_at — idempotency
    // must be action-id based, not timestamp-equality based.
    const retry = baseCompleted({
      id: "action-dup-1",
      completed_at: "2026-05-26T10:05:30.000Z",
    });
    const r2 = await runFollowup(db, retry);
    expect(r2.inserted).toBe(false);
    expect(db.rows.length).toBe(1);
    expect(db.insertCalls.length).toBe(1);

    const stored = db.rows[0];
    expect(followupMatchesAction({ details: stored.details }, "action-dup-1")).toBe(true);
    expect(stored.details.action_queue_id).toBe("action-dup-1");
    expect(stored.details.event_type).toBe(ACTION_FOLLOWUP_EVENT_TYPE);

    // Safety: insert payload never includes user_id.
    expect(Object.keys(db.insertCalls[0])).not.toContain("user_id");
    expect(Object.keys(db.insertCalls[0].details as Record<string, unknown>)).not.toContain(
      "user_id",
    );
  });

  it("uses the action id back-pointer to treat an existing follow-up as already created", async () => {
    // Seed a follow-up row from a prior run; current process has no memory of it.
    const db = makeFakeSupabase([
      {
        id: "diary-seed",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: null,
        note: "Re-check RH in ~24h and confirm humidity stayed closer to target.",
        details: {
          event_type: ACTION_FOLLOWUP_EVENT_TYPE,
          action_queue_id: "action-existing",
        },
      },
    ]);

    const completed = baseCompleted({
      id: "action-existing",
      // Different reason wording so any "same generated text" idempotency
      // would falsely allow a second insert.
      reason: "Humidity high again [alert:alert-77]",
      completed_at: "2026-05-27T09:00:00.000Z",
    });

    const r = await runFollowup(db, completed);
    expect(r.inserted).toBe(false);
    expect(db.rows.length).toBe(1);
    expect(db.insertCalls.length).toBe(0);
  });

  it("inserts when a different action id is completed (sanity: idempotency is per action id)", async () => {
    const db = makeFakeSupabase();
    await runFollowup(db, baseCompleted({ id: "action-A" }));
    await runFollowup(db, baseCompleted({ id: "action-B" }));
    expect(db.rows.length).toBe(2);
    expect(db.insertCalls.length).toBe(2);
    expect(db.rows[0].details.action_queue_id).toBe("action-A");
    expect(db.rows[1].details.action_queue_id).toBe("action-B");
  });
});
