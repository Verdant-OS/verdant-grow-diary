import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildActionQueueDraftFromAiDoctorSession,
  isSessionSuggestionEligibleForActionQueue,
  sessionActionMatchesExisting,
  type AiDoctorSessionLike,
  type AiDoctorSuggestedActionLike,
} from "@/lib/aiDoctorSessionToActionQueueRules";

const baseSession: AiDoctorSessionLike = {
  id: "sess-123",
  grow_id: "grow-1",
  tent_id: "tent-1",
  plant_id: "plant-1",
  diagnosis: { riskLevel: "medium" },
};

const baseAction: AiDoctorSuggestedActionLike = {
  type: "task",
  title: "Add a daily photo",
  detail: "Capture a top-down photo each day to track recovery.",
  priority: "medium",
  reason: "Need visual baseline before changing inputs.",
  approvalRequired: true,
};

describe("aiDoctorSessionToActionQueueRules — eligibility", () => {
  it("accepts a well-formed approval-required suggestion", () => {
    expect(isSessionSuggestionEligibleForActionQueue(baseSession, baseAction)).toBe(true);
  });

  it("rejects null/undefined inputs", () => {
    expect(isSessionSuggestionEligibleForActionQueue(null, baseAction)).toBe(false);
    expect(isSessionSuggestionEligibleForActionQueue(baseSession, null)).toBe(false);
    expect(isSessionSuggestionEligibleForActionQueue(undefined, undefined)).toBe(false);
  });

  it("rejects when approvalRequired is missing or false", () => {
    expect(
      isSessionSuggestionEligibleForActionQueue(baseSession, { ...baseAction, approvalRequired: false as unknown as true }),
    ).toBe(false);
    const { approvalRequired: _omit, ...noFlag } = baseAction;
    expect(isSessionSuggestionEligibleForActionQueue(baseSession, noFlag)).toBe(false);
  });

  it("rejects empty title or detail", () => {
    expect(isSessionSuggestionEligibleForActionQueue(baseSession, { ...baseAction, title: "  " })).toBe(false);
    expect(isSessionSuggestionEligibleForActionQueue(baseSession, { ...baseAction, detail: "" })).toBe(false);
  });

  it("rejects device-control language", () => {
    expect(
      isSessionSuggestionEligibleForActionQueue(baseSession, {
        ...baseAction,
        detail: "Turn on the dehumidifier overnight.",
      }),
    ).toBe(false);
  });
});

describe("aiDoctorSessionToActionQueueRules — buildActionQueueDraftFromAiDoctorSession", () => {
  it("produces a pending_approval ai_doctor draft", () => {
    const r = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.status).toBe("pending_approval");
    expect(r.draft.source).toBe("ai_doctor");
    expect(r.draft.target_metric).toBe("general");
  });

  it("forwards grow_id, tent_id, plant_id", () => {
    const r = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.grow_id).toBe("grow-1");
    expect(r.draft.tent_id).toBe("tent-1");
    expect(r.draft.plant_id).toBe("plant-1");
  });

  it("embeds [session:<id>] back-pointer in reason", () => {
    const r = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.reason).toContain("[session:sess-123]");
    expect(r.draft.session_back_pointer).toBe("[session:sess-123]");
  });

  it("omits target_device entirely", () => {
    const r = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    if (!r.ok) throw new Error("expected ok");
    expect(Object.prototype.hasOwnProperty.call(r.draft, "target_device")).toBe(false);
  });

  it("omits user_id entirely", () => {
    const r = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    if (!r.ok) throw new Error("expected ok");
    expect(Object.prototype.hasOwnProperty.call(r.draft, "user_id")).toBe(false);
  });

  it("rejects null/empty grow_id", () => {
    const r = buildActionQueueDraftFromAiDoctorSession({ ...baseSession, grow_id: null }, baseAction);
    if (r.ok) throw new Error("expected failure");
    expect(r.reason).toBe("missing_grow_id");
  });

  it("rejects missing session id", () => {
    const r = buildActionQueueDraftFromAiDoctorSession({ ...baseSession, id: "" }, baseAction);
    if (r.ok) throw new Error("expected failure");
    expect(r.reason).toBe("missing_session_id");
  });

  it("rejects approvalRequired false or missing", () => {
    const r1 = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      approvalRequired: false as unknown as true,
    });
    expect(r1.ok).toBe(false);
    const { approvalRequired: _omit, ...noFlag } = baseAction;
    const r2 = buildActionQueueDraftFromAiDoctorSession(baseSession, noFlag);
    expect(r2.ok).toBe(false);
  });

  it("rejects empty title and empty detail", () => {
    const rTitle = buildActionQueueDraftFromAiDoctorSession(baseSession, { ...baseAction, title: " " });
    expect(rTitle.ok).toBe(false);
    if (!rTitle.ok) expect(rTitle.reason).toBe("missing_title");
    const rDetail = buildActionQueueDraftFromAiDoctorSession(baseSession, { ...baseAction, detail: "" });
    expect(rDetail.ok).toBe(false);
    if (!rDetail.ok) expect(rDetail.reason).toBe("missing_detail");
  });

  it("rejects device-control language in any field", () => {
    const rDetail = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      detail: "Switch off the exhaust fan at night.",
    });
    expect(rDetail.ok).toBe(false);
    if (!rDetail.ok) expect(rDetail.reason).toBe("device_control_language");

    const rTitle = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      title: "Send a command to the smart plug",
    });
    expect(rTitle.ok).toBe(false);

    const rReason = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      reason: "Automate humidity adjustments via MQTT.",
    });
    expect(rReason.ok).toBe(false);
  });

  it("normalizes risk_level from priority, then diagnosis, then 'low'", () => {
    const rHigh = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      priority: "high",
    });
    if (!rHigh.ok) throw new Error("expected ok");
    expect(rHigh.draft.risk_level).toBe("high");

    const rDiag = buildActionQueueDraftFromAiDoctorSession(
      { ...baseSession, diagnosis: { riskLevel: "high" } },
      { ...baseAction, priority: "bogus" },
    );
    if (!rDiag.ok) throw new Error("expected ok");
    expect(rDiag.draft.risk_level).toBe("high");

    const rDefault = buildActionQueueDraftFromAiDoctorSession(
      { ...baseSession, diagnosis: null },
      { ...baseAction, priority: "bogus" },
    );
    if (!rDefault.ok) throw new Error("expected ok");
    expect(rDefault.draft.risk_level).toBe("low");
  });

  it("normalizes action_type, falling back to 'advisory'", () => {
    const rTask = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    if (!rTask.ok) throw new Error("expected ok");
    expect(rTask.draft.action_type).toBe("task");
    const rUnknown = buildActionQueueDraftFromAiDoctorSession(baseSession, {
      ...baseAction,
      type: "weird-type",
    });
    if (!rUnknown.ok) throw new Error("expected ok");
    expect(rUnknown.draft.action_type).toBe("advisory");
  });

  it("is deterministic for repeated inputs", () => {
    const a = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    const b = buildActionQueueDraftFromAiDoctorSession(baseSession, baseAction);
    expect(a).toEqual(b);
  });

  it("fails safely on null/malformed inputs", () => {
    expect(buildActionQueueDraftFromAiDoctorSession(null, null).ok).toBe(false);
    expect(
      buildActionQueueDraftFromAiDoctorSession(
        { id: null, grow_id: null } as unknown as AiDoctorSessionLike,
        baseAction,
      ).ok,
    ).toBe(false);
    expect(
      buildActionQueueDraftFromAiDoctorSession(baseSession, {} as AiDoctorSuggestedActionLike).ok,
    ).toBe(false);
  });
});

describe("aiDoctorSessionToActionQueueRules — sessionActionMatchesExisting", () => {
  it("matches an existing pending_approval row with same session token", () => {
    const row = {
      source: "ai_doctor",
      status: "pending_approval",
      reason: "Some reason — [session:sess-123]",
      grow_id: "grow-1",
      suggested_change: "Add a daily photo — Capture …",
    };
    expect(sessionActionMatchesExisting(row, baseSession, baseAction)).toBe(true);
  });

  it("does not match a different session", () => {
    const row = {
      source: "ai_doctor",
      status: "pending_approval",
      reason: "[session:other-session]",
      grow_id: "grow-1",
      suggested_change: "Add a daily photo",
    };
    expect(sessionActionMatchesExisting(row, baseSession, baseAction)).toBe(false);
  });

  it("ignores rejected/completed/cancelled rows", () => {
    for (const status of ["rejected", "completed", "cancelled"]) {
      const row = {
        source: "ai_doctor",
        status,
        reason: "[session:sess-123]",
        grow_id: "grow-1",
        suggested_change: "Add a daily photo",
      };
      expect(sessionActionMatchesExisting(row, baseSession, baseAction)).toBe(false);
    }
  });

  it("falls back to normalized title match when token missing", () => {
    const row = {
      source: "ai_doctor",
      status: "pending_approval",
      reason: "no token here",
      grow_id: "grow-1",
      suggested_change: "Add a daily photo — Capture top down",
    };
    expect(sessionActionMatchesExisting(row, baseSession, baseAction)).toBe(true);
  });

  it("returns false for null inputs", () => {
    expect(sessionActionMatchesExisting(null, baseSession, baseAction)).toBe(false);
    expect(sessionActionMatchesExisting({} as never, null, baseAction)).toBe(false);
  });

  it("requires source = ai_doctor", () => {
    const row = {
      source: "environment_alert",
      status: "pending_approval",
      reason: "[session:sess-123]",
      grow_id: "grow-1",
    };
    expect(sessionActionMatchesExisting(row, baseSession, baseAction)).toBe(false);
  });
});

describe("aiDoctorSessionToActionQueueRules — static safety scan", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/aiDoctorSessionToActionQueueRules.ts"),
    "utf8",
  );

  it("contains no DB write or insert/update/upsert/delete calls", () => {
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.delete\(/);
  });

  it("contains no functions.invoke / service_role / AI calls", () => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/fetch\(/);
    expect(src).not.toMatch(/openai|gemini|anthropic|lovable-ai/i);
  });

  it("does not reference action_queue, alerts, or tasks tables", () => {
    expect(src).not.toMatch(/from\(["']action_queue["']\)/);
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
    expect(src).not.toMatch(/from\(["']tasks["']\)/);
  });

  it("never assigns target_device or includes user_id in the draft", () => {
    expect(src).not.toMatch(/target_device\s*:/);
    expect(src).not.toMatch(/user_id\s*:/);
  });

  it("contains no automation/device-control markers", () => {
    expect(src).not.toMatch(/\bautomate\b/i);
    expect(src).not.toMatch(/\bmqtt_publish\b/i);
    // Note: DEVICE_CONTROL_PATTERNS is the *rejection* list; it does not
    // imply emitting device commands, just blocking them.
  });
});
