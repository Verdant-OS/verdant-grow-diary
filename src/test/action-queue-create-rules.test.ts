/**
 * Pure coverage for actionQueueCreateRules (#586 + Coach residual).
 */
import { describe, expect, it } from "vitest";
import {
  actionQueueCreateFailureCopy,
  buildActionQueueCreateRpcArgs,
  buildAiCoachRecommendationDedupeKey,
  buildAiDoctorCoachSuggestionDedupeKey,
  buildAiDoctorSessionDedupeKey,
  buildEnvironmentAlertDedupeKey,
  parseActionQueueCreateResult,
} from "@/lib/actionQueueCreateRules";

describe("buildEnvironmentAlertDedupeKey", () => {
  it("prefixes a trimmed alert id", () => {
    expect(buildEnvironmentAlertDedupeKey("  abc-123  ")).toBe("env_alert:abc-123");
  });
  it("returns null for empty", () => {
    expect(buildEnvironmentAlertDedupeKey("")).toBeNull();
    expect(buildEnvironmentAlertDedupeKey(null)).toBeNull();
  });
});

describe("buildAiDoctorSessionDedupeKey", () => {
  it("prefixes a trimmed session id", () => {
    expect(buildAiDoctorSessionDedupeKey("sess-9")).toBe("ai_doctor_session:sess-9");
  });
});

describe("buildAiCoachRecommendationDedupeKey", () => {
  it("scopes a normalized recommendation to the grow", () => {
    expect(buildAiCoachRecommendationDedupeKey("grow-1", "  Lower VPD  ")).toBe(
      "ai_coach:grow-1:lower vpd",
    );
  });
  it("returns null without grow or recommendation", () => {
    expect(buildAiCoachRecommendationDedupeKey("", "x")).toBeNull();
    expect(buildAiCoachRecommendationDedupeKey("g", "  ")).toBeNull();
  });
  it("bounds long recommendations", () => {
    const long = "a".repeat(200);
    const key = buildAiCoachRecommendationDedupeKey("g", long)!;
    expect(key.startsWith("ai_coach:g:")).toBe(true);
    expect(key.length).toBeLessThanOrEqual("ai_coach:g:".length + 160);
  });
});

describe("buildAiDoctorCoachSuggestionDedupeKey", () => {
  it("combines title and detail under grow", () => {
    expect(buildAiDoctorCoachSuggestionDedupeKey("g1", "Check RH", "Raise airflow")).toBe(
      "ai_doctor_coach:g1:check rh::raise airflow",
    );
  });
  it("returns null without grow or title", () => {
    expect(buildAiDoctorCoachSuggestionDedupeKey(null, "t", "d")).toBeNull();
    expect(buildAiDoctorCoachSuggestionDedupeKey("g", "", "d")).toBeNull();
  });
});

describe("buildActionQueueCreateRpcArgs", () => {
  it("maps a valid draft and never includes user_id or target_device", () => {
    const args = buildActionQueueCreateRpcArgs({
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: null,
      action_type: "advisory",
      target_metric: "temp",
      suggested_change: "Review heat load",
      reason: "Hot tent [alert:a1]",
      risk_level: "high",
      source: "environment_alert",
      dedupe_key: "env_alert:a1",
      audit_note: "Created from persisted alert a1",
      originating_timeline_events: [{ id: "d1", type: "diary_entry" }],
    });
    expect(args).toEqual({
      p_grow_id: "grow-1",
      p_action_type: "advisory",
      p_suggested_change: "Review heat load",
      p_reason: "Hot tent [alert:a1]",
      p_risk_level: "high",
      p_source: "environment_alert",
      p_target_metric: "temp",
      p_tent_id: "tent-1",
      p_plant_id: null,
      p_originating_timeline_events: [{ id: "d1", type: "diary_entry" }],
      p_audit_note: "Created from persisted alert a1",
      p_dedupe_key: "env_alert:a1",
    });
    const json = JSON.stringify(args);
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("target_device");
  });

  it("accepts ai_coach as a source", () => {
    const args = buildActionQueueCreateRpcArgs({
      grow_id: "g",
      action_type: "advisory",
      suggested_change: "Review RH",
      reason: "AI Coach recommendation",
      risk_level: "low",
      source: "ai_coach",
      dedupe_key: "ai_coach:g:review rh",
    });
    expect(args).toMatchObject({ p_source: "ai_coach", p_dedupe_key: "ai_coach:g:review rh" });
  });

  it("rejects missing required fields", () => {
    expect(buildActionQueueCreateRpcArgs({} as never)).toMatchObject({ ok: false });
    expect(
      buildActionQueueCreateRpcArgs({
        grow_id: "g",
        action_type: "advisory",
        suggested_change: "",
        reason: "r",
        risk_level: "low",
        source: "manual",
      }),
    ).toEqual({ ok: false, reason: "missing_suggested_change" });
  });
});

describe("parseActionQueueCreateResult", () => {
  it("parses success and reuse", () => {
    expect(
      parseActionQueueCreateResult({
        ok: true,
        action_queue_id: "aq-1",
        grow_id: "g-1",
        status: "pending_approval",
        event_id: "ev-1",
        reused: true,
      }),
    ).toEqual({
      ok: true,
      action_queue_id: "aq-1",
      grow_id: "g-1",
      status: "pending_approval",
      event_id: "ev-1",
      reused: true,
      created_at: null,
    });
  });

  it("parses structured failure", () => {
    expect(parseActionQueueCreateResult({ ok: false, reason: "grow_not_found" })).toEqual({
      ok: false,
      reason: "grow_not_found",
    });
  });

  it("rejects garbage", () => {
    expect(parseActionQueueCreateResult(null)).toEqual({
      ok: false,
      reason: "invalid_response",
    });
    expect(parseActionQueueCreateResult({ ok: true })).toEqual({
      ok: false,
      reason: "invalid_response",
    });
  });
});

describe("actionQueueCreateFailureCopy", () => {
  it("never leaks internal tokens or device language", () => {
    const copy = actionQueueCreateFailureCopy("plant_not_in_grow");
    expect(copy.toLowerCase()).not.toMatch(/device|command|auto|service_role|rpc/);
    expect(actionQueueCreateFailureCopy("unknown")).toMatch(/try again/i);
  });
});
