import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_REVIEW_STATE,
  eventTypeToStatus,
  isReviewStatusFilterActive,
  projectLatestReviewState,
  projectLatestReviewStateBySession,
  type AiDoctorSessionReviewEvent,
} from "@/lib/aiDoctorSessionReviewStatusRules";

const SESSION_A = "11111111-1111-1111-1111-111111111111";
const SESSION_B = "22222222-2222-2222-2222-222222222222";
const USER = "99999999-9999-9999-9999-999999999999";

function ev(
  overrides: Partial<AiDoctorSessionReviewEvent> & {
    id: string;
    event_type: AiDoctorSessionReviewEvent["event_type"];
    created_at: string;
  },
): AiDoctorSessionReviewEvent {
  return {
    user_id: USER,
    session_id: SESSION_A,
    note: null,
    ...overrides,
  };
}

describe("eventTypeToStatus", () => {
  it("maps marked_reviewed → reviewed", () => {
    expect(eventTypeToStatus("marked_reviewed")).toBe("reviewed");
  });
  it("maps needs_follow_up → needs_follow_up", () => {
    expect(eventTypeToStatus("needs_follow_up")).toBe("needs_follow_up");
  });
  it("maps cleared → not_reviewed", () => {
    expect(eventTypeToStatus("cleared")).toBe("not_reviewed");
  });
  it("maps unknown → not_reviewed", () => {
    expect(eventTypeToStatus("anything_else")).toBe("not_reviewed");
    expect(eventTypeToStatus(undefined)).toBe("not_reviewed");
    expect(eventTypeToStatus(null)).toBe("not_reviewed");
    expect(eventTypeToStatus(42)).toBe("not_reviewed");
  });
});

describe("projectLatestReviewState", () => {
  it("empty events → not_reviewed default", () => {
    expect(projectLatestReviewState([])).toEqual(DEFAULT_REVIEW_STATE);
  });

  it("null input → not_reviewed default", () => {
    expect(projectLatestReviewState(null)).toEqual(DEFAULT_REVIEW_STATE);
  });

  it("undefined input → not_reviewed default", () => {
    expect(projectLatestReviewState(undefined)).toEqual(DEFAULT_REVIEW_STATE);
  });

  it("single marked_reviewed → reviewed", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
    ]);
    expect(state.status).toBe("reviewed");
    expect(state.latestEventId).toBe("a");
    expect(state.latestEventAt).toBe("2026-05-01T10:00:00Z");
    expect(state.latestNote).toBeNull();
  });

  it("single needs_follow_up → needs_follow_up", () => {
    const state = projectLatestReviewState([
      ev({
        id: "a",
        event_type: "needs_follow_up",
        created_at: "2026-05-01T10:00:00Z",
        note: "check trichomes",
      }),
    ]);
    expect(state.status).toBe("needs_follow_up");
    expect(state.latestNote).toBe("check trichomes");
  });

  it("single cleared → not_reviewed (but records latest event metadata)", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "cleared", created_at: "2026-05-01T10:00:00Z" }),
    ]);
    expect(state.status).toBe("not_reviewed");
    expect(state.latestEventId).toBe("a");
  });

  it("marked_reviewed then needs_follow_up → needs_follow_up", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
      ev({ id: "b", event_type: "needs_follow_up", created_at: "2026-05-01T11:00:00Z" }),
    ]);
    expect(state.status).toBe("needs_follow_up");
    expect(state.latestEventId).toBe("b");
  });

  it("needs_follow_up then cleared → not_reviewed", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "needs_follow_up", created_at: "2026-05-01T10:00:00Z" }),
      ev({ id: "b", event_type: "cleared", created_at: "2026-05-01T12:00:00Z" }),
    ]);
    expect(state.status).toBe("not_reviewed");
    expect(state.latestEventId).toBe("b");
  });

  it("out-of-order input sorts deterministically", () => {
    const a = ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" });
    const b = ev({ id: "b", event_type: "needs_follow_up", created_at: "2026-05-01T11:00:00Z" });
    const c = ev({ id: "c", event_type: "cleared", created_at: "2026-05-01T12:00:00Z" });
    const forward = projectLatestReviewState([a, b, c]);
    const reverse = projectLatestReviewState([c, b, a]);
    const shuffled = projectLatestReviewState([b, a, c]);
    expect(forward).toEqual(reverse);
    expect(forward).toEqual(shuffled);
    expect(forward.status).toBe("not_reviewed");
    expect(forward.latestEventId).toBe("c");
  });

  it("same created_at: tie breaks by id ascending (last id wins)", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
      ev({ id: "b", event_type: "needs_follow_up", created_at: "2026-05-01T10:00:00Z" }),
    ]);
    // After ascending sort by (created_at, id), "b" is last.
    expect(state.latestEventId).toBe("b");
    expect(state.status).toBe("needs_follow_up");

    // Reversed input must produce identical result.
    const state2 = projectLatestReviewState([
      ev({ id: "b", event_type: "needs_follow_up", created_at: "2026-05-01T10:00:00Z" }),
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
    ]);
    expect(state2).toEqual(state);
  });

  it("unknown event_type values are ignored", () => {
    const state = projectLatestReviewState([
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
      // Unknown future event type — should be dropped, not crash.
      {
        id: "b",
        user_id: USER,
        session_id: SESSION_A,
        event_type: "future_unseen_type" as unknown as AiDoctorSessionReviewEvent["event_type"],
        note: null,
        created_at: "2026-05-01T11:00:00Z",
      },
    ]);
    expect(state.status).toBe("reviewed");
    expect(state.latestEventId).toBe("a");
  });

  it("malformed events (missing fields, wrong types) are dropped safely", () => {
    const state = projectLatestReviewState([
      null,
      undefined,
      "not an object",
      42,
      {},
      { id: "x" },
      { id: "y", session_id: SESSION_A, user_id: USER, event_type: "marked_reviewed" }, // missing created_at
      ev({ id: "a", event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
    ] as unknown[]);
    expect(state.status).toBe("reviewed");
    expect(state.latestEventId).toBe("a");
  });

  it("all-malformed input → default state", () => {
    const state = projectLatestReviewState([null, undefined, {}, "bad"] as unknown[]);
    expect(state).toEqual(DEFAULT_REVIEW_STATE);
  });
});

describe("projectLatestReviewStateBySession", () => {
  it("groups events by session_id", () => {
    const map = projectLatestReviewStateBySession([
      ev({ id: "a1", session_id: SESSION_A, event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
      ev({ id: "a2", session_id: SESSION_A, event_type: "needs_follow_up", created_at: "2026-05-01T11:00:00Z" }),
      ev({ id: "b1", session_id: SESSION_B, event_type: "marked_reviewed", created_at: "2026-05-01T09:00:00Z" }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get(SESSION_A)?.status).toBe("needs_follow_up");
    expect(map.get(SESSION_A)?.latestEventId).toBe("a2");
    expect(map.get(SESSION_B)?.status).toBe("reviewed");
    expect(map.get(SESSION_B)?.latestEventId).toBe("b1");
  });

  it("empty/null/undefined input → empty map", () => {
    expect(projectLatestReviewStateBySession([]).size).toBe(0);
    expect(projectLatestReviewStateBySession(null).size).toBe(0);
    expect(projectLatestReviewStateBySession(undefined).size).toBe(0);
  });

  it("sessions with only malformed events are omitted", () => {
    const map = projectLatestReviewStateBySession([
      { id: "bad", session_id: SESSION_A } as unknown,
      ev({ id: "b1", session_id: SESSION_B, event_type: "marked_reviewed", created_at: "2026-05-01T10:00:00Z" }),
    ]);
    expect(map.has(SESSION_A)).toBe(false);
    expect(map.get(SESSION_B)?.status).toBe("reviewed");
  });
});

describe("isReviewStatusFilterActive", () => {
  it("any → false", () => {
    expect(isReviewStatusFilterActive("any")).toBe(false);
  });
  it("not_reviewed / reviewed / needs_follow_up → true", () => {
    expect(isReviewStatusFilterActive("not_reviewed")).toBe(true);
    expect(isReviewStatusFilterActive("reviewed")).toBe(true);
    expect(isReviewStatusFilterActive("needs_follow_up")).toBe(true);
  });
  it("unknown / null / undefined → false", () => {
    expect(isReviewStatusFilterActive("garbage")).toBe(false);
    expect(isReviewStatusFilterActive(null)).toBe(false);
    expect(isReviewStatusFilterActive(undefined)).toBe(false);
    expect(isReviewStatusFilterActive("")).toBe(false);
  });
});

describe("static safety scan: ai_doctor_session_reviews foundation", () => {
  const rulesSrc = fs.readFileSync(
    path.resolve(__dirname, "../lib/aiDoctorSessionReviewStatusRules.ts"),
    "utf8",
  );

  it("helper module has no I/O, automation, AI, or unsafe markers", () => {
    expect(rulesSrc).not.toMatch(/functions\.invoke/);
    expect(rulesSrc).not.toMatch(/service_role/);
    // Tighten to write-target patterns so calm user-facing copy that
    // *mentions* alerts/tasks/action queue (e.g. "this does not change
    // alerts, tasks, or action queue items") does not trip the scan.
    expect(rulesSrc).not.toMatch(/from\(\s*["']action_queue["']/);
    expect(rulesSrc).not.toMatch(/from\(\s*["']alerts["']/);
    expect(rulesSrc).not.toMatch(/from\(\s*["']tasks["']/);
    expect(rulesSrc).not.toMatch(/alert_events/);
    expect(rulesSrc).not.toMatch(/automation/i);
    expect(rulesSrc).not.toMatch(/device[_-]?control/i);
    expect(rulesSrc).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(rulesSrc).not.toMatch(/\bfetch\s*\(/);
    expect(rulesSrc).not.toMatch(/lovable[_-]?api/i);
  });

  it("helper module exports only pure helpers (no React imports)", () => {
    expect(rulesSrc).not.toMatch(/from\s+["']react["']/);
    expect(rulesSrc).not.toMatch(/from\s+["']react-dom/);
  });
});
