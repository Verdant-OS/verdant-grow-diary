/**
 * Behavioral tests for the shared action follow-up diary writer.
 *
 * Contract (mirrors the original ActionDetail implementation exactly):
 *  - writes one idempotent `action_followup` diary entry for a completed
 *    action, never including `user_id` (auth.uid() default is the source);
 *  - skips when a matching follow-up already exists;
 *  - reports insert failures as `ok: false` so callers can warn without
 *    blocking the completed status;
 *  - invalid drafts (e.g. not completed, missing grow) are a silent no-op.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const lookupState: { data: unknown[] | null; error: unknown } = { data: [], error: null };
const insertState: { error: unknown } = { error: null };
const insertMock = vi.fn(async (_payload: unknown) => ({ error: insertState.error }));
const containsMock = vi.fn(() => ({
  limit: async () => ({ data: lookupState.data, error: lookupState.error }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "diary_entries") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({ eq: () => ({ contains: containsMock }) }),
        insert: (payload: unknown) => insertMock(payload),
      };
    },
  },
}));

import { maybeWriteActionFollowupDiaryEntry } from "@/lib/writeActionFollowupDiaryEntry";

function completedAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    grow_id: "g1",
    tent_id: "t1",
    plant_id: null,
    target_metric: "humidity_pct",
    suggested_change: "Lower humidifier target",
    reason: "RH too high overnight",
    status: "completed",
    completed_at: "2026-07-16T12:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lookupState.data = [];
  lookupState.error = null;
  insertState.error = null;
});

describe("maybeWriteActionFollowupDiaryEntry", () => {
  it("writes an idempotent follow-up entry without user_id", async () => {
    const result = await maybeWriteActionFollowupDiaryEntry(completedAction());
    expect(result).toEqual({ ok: true, wrote: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.grow_id).toBe("g1");
    expect(payload.tent_id).toBe("t1");
    expect("user_id" in payload).toBe(false);
    const details = payload.details as Record<string, unknown>;
    expect(details.event_type).toBe("action_followup");
    expect(details.action_queue_id).toBe("a1");
    expect(typeof payload.note).toBe("string");
    expect((payload.note as string).length).toBeGreaterThan(0);
  });

  it("skips the insert when a matching follow-up already exists", async () => {
    lookupState.data = [
      { id: "d1", details: { event_type: "action_followup", action_queue_id: "a1" } },
    ];
    const result = await maybeWriteActionFollowupDiaryEntry(completedAction());
    expect(result).toEqual({ ok: true, wrote: false, skipped: "already_exists" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("still writes when the existing row is for a different action", async () => {
    lookupState.data = [
      { id: "d1", details: { event_type: "action_followup", action_queue_id: "other" } },
    ];
    const result = await maybeWriteActionFollowupDiaryEntry(completedAction());
    expect(result).toEqual({ ok: true, wrote: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("reports insert failure as ok:false with the message", async () => {
    insertState.error = { message: "row-level security violation" };
    const result = await maybeWriteActionFollowupDiaryEntry(completedAction());
    expect(result).toEqual({ ok: false, message: "row-level security violation" });
  });

  it("is a silent no-op for a non-completed action (invalid draft)", async () => {
    const result = await maybeWriteActionFollowupDiaryEntry(
      completedAction({ status: "approved" }),
    );
    expect(result).toEqual({ ok: true, wrote: false, skipped: "draft_invalid" });
    expect(containsMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("proceeds to insert when the idempotency lookup errors (original semantics)", async () => {
    lookupState.data = null;
    lookupState.error = { message: "lookup failed" };
    const result = await maybeWriteActionFollowupDiaryEntry(completedAction());
    expect(result).toEqual({ ok: true, wrote: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
