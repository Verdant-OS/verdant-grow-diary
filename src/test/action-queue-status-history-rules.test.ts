/**
 * actionQueueStatusHistoryRules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildActionQueueStatusHistory,
  STATUS_HISTORY_EMPTY_COPY,
} from "@/lib/actionQueueStatusHistoryRules";

const ACTION_ID = "aq-1";

function traceRow(opts: {
  id: string;
  entry_at: string;
  kind: "approved" | "rejected";
  action_id?: string;
  idempotency_key?: string;
}) {
  return {
    id: opts.id,
    entry_at: opts.entry_at,
    note: "Action approved: do thing",
    details: {
      kind: "action_queue_trace",
      trace_kind: opts.kind,
      idempotency_key:
        opts.idempotency_key ?? `action-queue:${opts.action_id ?? ACTION_ID}:${opts.kind}`,
      action_id: opts.action_id ?? ACTION_ID,
      tent_id: null,
      plant_id: null,
      source: "ai_doctor",
      action_type: "lower_humidity",
      reason_summary: "",
      device_control: false,
    },
  };
}

describe("buildActionQueueStatusHistory", () => {
  it("returns empty array for null / empty input", () => {
    expect(buildActionQueueStatusHistory(null, ACTION_ID)).toEqual([]);
    expect(buildActionQueueStatusHistory([], ACTION_ID)).toEqual([]);
  });

  it("normalizes approve/reject diary rows with grower-readable labels", () => {
    const out = buildActionQueueStatusHistory(
      [
        traceRow({ id: "d1", entry_at: "2026-06-10T10:00:00Z", kind: "approved" }),
        traceRow({ id: "d2", entry_at: "2026-06-11T10:00:00Z", kind: "rejected" }),
      ],
      ACTION_ID,
    );
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("Action rejected");
    expect(out[1].label).toBe("Action approved");
  });

  it("sorts deterministically by timestamp DESC, then kind, then key", () => {
    const out = buildActionQueueStatusHistory(
      [
        traceRow({ id: "d1", entry_at: "2026-06-10T10:00:00Z", kind: "rejected" }),
        traceRow({ id: "d2", entry_at: "2026-06-12T10:00:00Z", kind: "approved" }),
        traceRow({ id: "d3", entry_at: "2026-06-11T10:00:00Z", kind: "approved" }),
      ],
      ACTION_ID,
    );
    expect(out.map((h) => h.at)).toEqual([
      "2026-06-12T10:00:00.000Z",
      "2026-06-11T10:00:00.000Z",
      "2026-06-10T10:00:00.000Z",
    ]);
  });

  it("dedupes by idempotency_key", () => {
    const row = traceRow({
      id: "d1",
      entry_at: "2026-06-10T10:00:00Z",
      kind: "approved",
    });
    const out = buildActionQueueStatusHistory([row, { ...row, id: "d2" }], ACTION_ID);
    expect(out).toHaveLength(1);
  });

  it("filters out trace rows belonging to other actions", () => {
    const out = buildActionQueueStatusHistory(
      [
        traceRow({
          id: "d1",
          entry_at: "2026-06-10T10:00:00Z",
          kind: "approved",
          action_id: "different-action",
        }),
      ],
      ACTION_ID,
    );
    expect(out).toEqual([]);
  });

  it("ignores non-action-queue diary rows", () => {
    const out = buildActionQueueStatusHistory(
      [
        {
          id: "d1",
          entry_at: "2026-06-10T10:00:00Z",
          note: "free-form diary entry",
          details: { kind: "manual_log" },
        },
      ],
      ACTION_ID,
    );
    expect(out).toEqual([]);
  });

  it("falls back to created_at when entry_at is missing", () => {
    const out = buildActionQueueStatusHistory(
      [
        {
          id: "d1",
          entry_at: null,
          created_at: "2026-06-10T10:00:00Z",
          details: traceRow({
            id: "x",
            entry_at: "ignored",
            kind: "approved",
          }).details,
        },
      ],
      ACTION_ID,
    );
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe("2026-06-10T10:00:00.000Z");
  });

  it("skips rows with invalid timestamps", () => {
    const row = traceRow({ id: "d1", entry_at: "not-a-date", kind: "approved" });
    expect(buildActionQueueStatusHistory([row], ACTION_ID)).toEqual([]);
  });

  it("exposes calm empty-state copy constant", () => {
    expect(STATUS_HISTORY_EMPTY_COPY).toBe("No status history found yet.");
  });
});
