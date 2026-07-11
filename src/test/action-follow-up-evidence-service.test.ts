import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActionFollowUpInflightForTests,
  buildActionFollowUpIdempotencyKey,
  buildActionFollowUpInsertPayload,
  saveActionFollowUpEvidence,
  type ActionFollowUpEvidenceServiceDependencies,
} from "@/lib/actionFollowUpEvidenceService";
import type { ActionFollowUpDraft } from "@/lib/actionFollowUpEvidenceRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

function baseDraft(overrides: Partial<ActionFollowUpDraft> = {}): ActionFollowUpDraft {
  return {
    actionQueueId: "act-1",
    growId: "grow-1",
    tentId: "tent-1",
    plantId: "plant-1",
    outcome: "improved",
    note: "leaf perked up",
    observedAt: "2026-07-11T12:00:00.000Z",
    photoReference: null,
    sensorSnapshotId: null,
    ...overrides,
  };
}

interface FakeState {
  actionRow: Record<string, unknown> | null;
  actionError: { message: string; code?: string } | null;
  lookupRows: Array<Record<string, unknown>>;
  lookupError: { message: string } | null;
  insertRow: Record<string, unknown> | null;
  insertError: { message: string; code?: string } | null;
  reconRows?: Array<Record<string, unknown>>;
  reconError?: { message: string } | null;
  insertCalls: number;
  lookupCalls: number;
  actionCalls: number;
}

function makeClient(state: FakeState) {
  return {
    from(table: string) {
      if (table === "action_queue") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    state.actionCalls++;
                    return { data: state.actionRow, error: state.actionError };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "diary_entries") {
        return {
          select() {
            return {
              eq() {
                return {
                  contains: async () => {
                    state.lookupCalls++;
                    if (state.lookupCalls === 1) {
                      return { data: state.lookupRows, error: state.lookupError };
                    }
                    return {
                      data: state.reconRows ?? [],
                      error: state.reconError ?? null,
                    };
                  },
                };
              },
            };
          },
          insert() {
            state.insertCalls++;
            return {
              select() {
                return {
                  async maybeSingle() {
                    return { data: state.insertRow, error: state.insertError };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as NonNullable<ActionFollowUpEvidenceServiceDependencies["supabase"]>;
}

function completedAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    status: "completed",
    ...overrides,
  };
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    actionRow: completedAction(),
    actionError: null,
    lookupRows: [],
    lookupError: null,
    insertRow: {
      id: "diary-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: "leaf perked up",
      details: {
        event_type: "action_followup",
        action_queue_id: "act-1",
        outcome: "improved",
        observed_at: "2026-07-11T12:00:00.000Z",
        note: "leaf perked up",
        photo_reference: null,
        sensor_snapshot_id: null,
        idempotency_key: "action-followup:act-1",
      },
    },
    insertError: null,
    insertCalls: 0,
    lookupCalls: 0,
    actionCalls: 0,
    ...overrides,
  };
}

beforeEach(() => __resetActionFollowUpInflightForTests());
afterEach(() => __resetActionFollowUpInflightForTests());

describe("buildActionFollowUpIdempotencyKey", () => {
  it("is deterministic and contains the action id", () => {
    expect(buildActionFollowUpIdempotencyKey("act-42")).toBe("action-followup:act-42");
    expect(buildActionFollowUpIdempotencyKey("act-42")).toBe("action-followup:act-42");
  });
});

describe("buildActionFollowUpInsertPayload", () => {
  it("uses verified action relationships, not draft", () => {
    const payload = buildActionFollowUpInsertPayload(
      baseDraft({ growId: "grow-DRAFT", tentId: "tent-DRAFT", plantId: "plant-DRAFT" }),
      completedAction() as never,
    );
    expect(payload.grow_id).toBe("grow-1");
    expect(payload.tent_id).toBe("tent-1");
    expect(payload.plant_id).toBe("plant-1");
  });

  it("populates details with grower outcome, timestamp, and normalized note", () => {
    const payload = buildActionFollowUpInsertPayload(
      baseDraft({ note: "  hello  " }),
      completedAction() as never,
    );
    const d = payload.details as Record<string, unknown>;
    expect(d.event_type).toBe("action_followup");
    expect(d.action_queue_id).toBe("act-1");
    expect(d.outcome).toBe("improved");
    expect(d.observed_at).toBe("2026-07-11T12:00:00.000Z");
    expect(d.note).toBe("hello");
    expect(d.idempotency_key).toBe("action-followup:act-1");
    expect(d.photo_reference).toBeNull();
    expect(d.sensor_snapshot_id).toBeNull();
  });

  it("falls back to conservative label when note is empty", () => {
    const payload = buildActionFollowUpInsertPayload(
      baseDraft({ note: "" }),
      completedAction() as never,
    );
    expect(payload.note).toBe("Follow-up recorded.");
    const d = payload.details as Record<string, unknown>;
    expect(d.note).toBe("");
  });

  it("preserves durable photo + sensor references", () => {
    const payload = buildActionFollowUpInsertPayload(
      baseDraft({
        photoReference: "storage://diary-photos/uid/plant/1.jpg",
        sensorSnapshotId: "snap-99",
      }),
      completedAction() as never,
    );
    const d = payload.details as Record<string, unknown>;
    expect(d.photo_reference).toBe("storage://diary-photos/uid/plant/1.jpg");
    expect(d.sensor_snapshot_id).toBe("snap-99");
  });

  it("never carries device or user_id fields", () => {
    const payload = buildActionFollowUpInsertPayload(baseDraft(), completedAction() as never);
    const rec = payload as unknown as Record<string, unknown>;
    expect(rec.user_id).toBeUndefined();
    const d = payload.details as Record<string, unknown>;
    expect(d.device_command).toBeUndefined();
    expect(d.execute).toBeUndefined();
    expect(d.user_id).toBeUndefined();
  });
});

describe("saveActionFollowUpEvidence — draft validation", () => {
  it("returns blocked/invalid_draft and never queries when draft invalid", async () => {
    const state = baseState();
    const client = makeClient(state);
    const res = await saveActionFollowUpEvidence(
      baseDraft({ outcome: "recovered" as never }),
      { supabase: client },
    );
    expect(res.status).toBe("blocked");
    if (res.status === "blocked") expect(res.reason).toBe("invalid_draft");
    expect(state.actionCalls).toBe(0);
    expect(state.insertCalls).toBe(0);
  });

  it("rejects signed URL before any query", async () => {
    const state = baseState();
    const client = makeClient(state);
    const res = await saveActionFollowUpEvidence(
      baseDraft({ photoReference: "https://x/y?token=abc" }),
      { supabase: client },
    );
    expect(res.status).toBe("blocked");
    expect(state.actionCalls).toBe(0);
  });
});

describe("saveActionFollowUpEvidence — action verification", () => {
  it("action_query error → failed/action_query_failed", async () => {
    const state = baseState({ actionError: { message: "boom" } });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "failed", reason: "action_query_failed" });
  });

  it("missing action row → blocked/action_not_found (RLS-safe)", async () => {
    const state = baseState({ actionRow: null });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "action_not_found" });
  });

  it("suggested action → blocked/action_not_completed", async () => {
    const state = baseState({ actionRow: completedAction({ status: "pending_approval" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "action_not_completed" });
  });

  it("approved (not completed) → blocked/action_not_completed", async () => {
    const state = baseState({ actionRow: completedAction({ status: "approved" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "action_not_completed" });
  });

  it("rejected → blocked/action_not_completed", async () => {
    const state = baseState({ actionRow: completedAction({ status: "rejected" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "action_not_completed" });
  });

  it("grow mismatch → blocked/relationship_mismatch", async () => {
    const state = baseState({ actionRow: completedAction({ grow_id: "grow-OTHER" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "relationship_mismatch" });
  });

  it("tent mismatch → blocked/relationship_mismatch", async () => {
    const state = baseState({ actionRow: completedAction({ tent_id: "tent-OTHER" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "relationship_mismatch" });
  });

  it("plant mismatch → blocked/relationship_mismatch", async () => {
    const state = baseState({ actionRow: completedAction({ plant_id: "plant-OTHER" }) });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "blocked", reason: "relationship_mismatch" });
  });

  it("null optional tent/plant on action allows draft with values (no mismatch)", async () => {
    const state = baseState({
      actionRow: completedAction({ tent_id: null, plant_id: null }),
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("created");
  });
});

describe("saveActionFollowUpEvidence — existing follow-up lookup", () => {
  const existingRow = {
    id: "diary-existing",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    note: "prior",
    details: {
      event_type: "action_followup",
      action_queue_id: "act-1",
      outcome: "unchanged",
      observed_at: "2026-07-10T12:00:00.000Z",
      note: "prior",
    },
  };

  it("existing linked follow-up → existing (no insert)", async () => {
    const state = baseState({ lookupRows: [existingRow] });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("existing");
    expect(state.insertCalls).toBe(0);
    if (res.status === "existing") expect(res.followUp.diaryEntryId).toBe("diary-existing");
  });

  it("unrelated diary row not returned by contains() is not treated as follow-up", async () => {
    // .contains() filter means Postgres returns only matching rows in production.
    const state = baseState({ lookupRows: [] });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("created");
  });

  it("row with wrong event_type is not selected as primary", async () => {
    const state = baseState({
      lookupRows: [
        {
          id: "diary-wrong",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          note: "x",
          details: { event_type: "action_outcome", action_queue_id: "act-1" },
        },
      ],
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("blocked");
    if (res.status === "blocked") expect(res.reason).toBe("existing_follow_up_unreadable");
  });

  it("multiple duplicate follow-ups → deterministic (earliest id) reconciliation", async () => {
    const r1 = { ...existingRow, id: "diary-a" };
    const r2 = { ...existingRow, id: "diary-b" };
    const state = baseState({ lookupRows: [r2, r1] });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("existing");
    if (res.status === "existing") expect(res.followUp.diaryEntryId).toBe("diary-a");
    expect(state.insertCalls).toBe(0);
  });

  it("lookup error → failed/follow_up_query_failed", async () => {
    const state = baseState({ lookupError: { message: "boom" } });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "failed", reason: "follow_up_query_failed" });
    expect(state.insertCalls).toBe(0);
  });
});

describe("saveActionFollowUpEvidence — insert + reconciliation", () => {
  it("happy path → created", async () => {
    const state = baseState();
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("created");
    expect(state.insertCalls).toBe(1);
    if (res.status === "created") {
      expect(res.followUp.actionQueueId).toBe("act-1");
      expect(res.followUp.outcome).toBe("improved");
      expect(res.followUp.idempotencyKey).toBe("action-followup:act-1");
    }
  });

  it("duplicate error (23505) then reconcile → existing", async () => {
    const state = baseState({
      insertRow: null,
      insertError: { message: "duplicate key", code: "23505" },
      reconRows: [
        {
          id: "diary-recon",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          note: "x",
          details: {
            event_type: "action_followup",
            action_queue_id: "act-1",
            outcome: "improved",
            observed_at: "2026-07-11T12:00:00.000Z",
          },
        },
      ],
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res.status).toBe("existing");
    if (res.status === "existing") expect(res.followUp.diaryEntryId).toBe("diary-recon");
  });

  it("ambiguous insert error with no reconciled row → failed/insert_failed", async () => {
    const state = baseState({
      insertRow: null,
      insertError: { message: "network" },
      reconRows: [],
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "failed", reason: "insert_failed" });
  });

  it("reconciliation query error → failed/reconciliation_failed", async () => {
    const state = baseState({
      insertRow: null,
      insertError: { message: "network" },
      reconError: { message: "boom" },
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "failed", reason: "reconciliation_failed" });
  });

  it("insert returns null row and no error → failed/insert_failed", async () => {
    const state = baseState({ insertRow: null });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(res).toEqual({ status: "failed", reason: "insert_failed" });
  });

  it("does not leak Supabase error messages into the result", async () => {
    const state = baseState({
      insertRow: null,
      insertError: { message: "column x does not exist" },
      reconRows: [],
    });
    const res = await saveActionFollowUpEvidence(baseDraft(), { supabase: makeClient(state) });
    expect(JSON.stringify(res)).not.toContain("column x");
  });
});

describe("saveActionFollowUpEvidence — in-flight guard", () => {
  it("rapid same-action calls share one in-flight operation (one insert)", async () => {
    const state = baseState();
    const client = makeClient(state);
    const [a, b] = await Promise.all([
      saveActionFollowUpEvidence(baseDraft(), { supabase: client }),
      saveActionFollowUpEvidence(baseDraft(), { supabase: client }),
    ]);
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    expect(state.insertCalls).toBe(1);
    expect(state.actionCalls).toBe(1);
  });

  it("different action IDs do not share in-flight state", async () => {
    const s1 = baseState();
    const s2 = baseState({
      actionRow: completedAction({ id: "act-2" }),
      insertRow: {
        id: "diary-2",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        note: "n",
        details: {
          event_type: "action_followup",
          action_queue_id: "act-2",
          outcome: "improved",
          observed_at: "2026-07-11T12:00:00.000Z",
        },
      },
    });
    const c1 = makeClient(s1);
    const c2 = makeClient(s2);
    const [a, b] = await Promise.all([
      saveActionFollowUpEvidence(baseDraft({ actionQueueId: "act-1" }), { supabase: c1 }),
      saveActionFollowUpEvidence(baseDraft({ actionQueueId: "act-2" }), { supabase: c2 }),
    ]);
    expect(a.status).toBe("created");
    expect(b.status).toBe("created");
    expect(s1.insertCalls).toBe(1);
    expect(s2.insertCalls).toBe(1);
  });

  it("in-flight entry clears after success (sequential call re-queries)", async () => {
    const state = baseState();
    const client = makeClient(state);
    await saveActionFollowUpEvidence(baseDraft(), { supabase: client });
    // Simulate second submission with a row now present.
    state.lookupRows = [
      {
        id: "diary-1",
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        note: "leaf perked up",
        details: {
          event_type: "action_followup",
          action_queue_id: "act-1",
          outcome: "improved",
          observed_at: "2026-07-11T12:00:00.000Z",
        },
      },
    ];
    state.lookupCalls = 0;
    const res2 = await saveActionFollowUpEvidence(baseDraft(), { supabase: client });
    expect(res2.status).toBe("existing");
    expect(state.actionCalls).toBe(2);
  });

  it("in-flight entry clears after failure", async () => {
    const state = baseState({ actionError: { message: "boom" } });
    const client = makeClient(state);
    await saveActionFollowUpEvidence(baseDraft(), { supabase: client });
    const res2 = await saveActionFollowUpEvidence(baseDraft(), { supabase: client });
    expect(res2.status).toBe("failed");
    expect(state.actionCalls).toBe(2);
  });
});
