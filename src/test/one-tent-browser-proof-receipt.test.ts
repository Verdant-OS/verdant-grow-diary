/**
 * One-Tent browser-proof receipt — pure contract tests.
 * No Playwright, no browser: the builder takes a staged result object.
 */
import { describe, it, expect } from "vitest";
import {
  ONE_TENT_BROWSER_PROOF_JSON_PREFIX,
  ONE_TENT_PROOF_STAGES,
  buildBlockedOneTentBrowserProofReceipt,
  buildOneTentBrowserProofReceipt,
  renderOneTentBrowserProofReceipt,
  type OneTentProofStage,
  type StageOutcome,
} from "../../e2e/helpers/oneTentBrowserProofReceipt";

function allPassStages(): Partial<Record<OneTentProofStage, StageOutcome>> {
  const out: Partial<Record<OneTentProofStage, StageOutcome>> = {};
  for (const key of ONE_TENT_PROOF_STAGES) out[key] = "pass";
  return out;
}

describe("blocked receipt", () => {
  const receipt = buildBlockedOneTentBrowserProofReceipt("managed session unavailable");

  it("status blocked, seed blocked, every stage blocked or not_run", () => {
    expect(receipt.status).toBe("blocked");
    expect(receipt.seed_status).toBe("blocked");
    for (const key of ONE_TENT_PROOF_STAGES) {
      expect(["blocked", "not_run"]).toContain(receipt.stages[key]);
    }
    expect(receipt.stages.auto_diary_follow_up).toBe("not_run");
  });

  it("carries the blocker reason and null duplicate fences", () => {
    expect(receipt.blocker_reason).toBe("managed session unavailable");
    expect(receipt.duplicate_fences).toEqual({
      quick_log_count: null,
      alert_count: null,
      action_queue_count: null,
      follow_up_marker_count: null,
    });
  });

  it("remains valid parseable single-line JSON", () => {
    const line = renderOneTentBrowserProofReceipt(receipt);
    expect(line.startsWith(ONE_TENT_BROWSER_PROOF_JSON_PREFIX)).toBe(true);
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line.slice(ONE_TENT_BROWSER_PROOF_JSON_PREFIX.length));
    expect(parsed.schema_version).toBe("1");
    expect(parsed.proof).toBe("one-tent-loop-authenticated-ui");
  });

  it("a blocked receipt can never smuggle pass/fail stages", () => {
    const r = buildOneTentBrowserProofReceipt({
      restoreStrategy: "none",
      seedStatus: "blocked",
      blockerReason: "x",
      stages: { auth_restored: "pass", grow_resolved: "blocked" },
    });
    expect(r.status).toBe("blocked");
    for (const key of ONE_TENT_PROOF_STAGES) {
      expect(["blocked", "not_run"]).toContain(r.stages[key]);
    }
  });
});

describe("pass receipt", () => {
  const receipt = buildOneTentBrowserProofReceipt({
    restoreStrategy: "storage_session",
    seedStatus: "completed",
    stages: allPassStages(),
    duplicateFences: {
      quick_log_count: 1,
      alert_count: 1,
      action_queue_count: 1,
      follow_up_marker_count: 1,
    },
  });

  it("status pass, all stages pass, duplicate counts 1", () => {
    expect(receipt.status).toBe("pass");
    for (const key of ONE_TENT_PROOF_STAGES) expect(receipt.stages[key]).toBe("pass");
    expect(receipt.duplicate_fences.quick_log_count).toBe(1);
    expect(receipt.blocker_reason).toBeNull();
  });

  it("auto_diary_follow_up is intentionally_unsupported (honest gap)", () => {
    expect(receipt.stages.auto_diary_follow_up).toBe("intentionally_unsupported");
  });

  it("safety booleans default false and fabricated_login_used is unrepresentable as true", () => {
    expect(receipt.safety).toEqual({
      fabricated_login_used: false,
      paid_ai_request_observed: false,
      device_control_request_observed: false,
      service_role_in_browser_observed: false,
    });
  });
});

describe("fail receipt", () => {
  const stages = allPassStages();
  stages.quick_log_persisted = "fail";
  stages.timeline_visible = "pass"; // later stage claiming pass — must be normalized
  const receipt = buildOneTentBrowserProofReceipt({
    restoreStrategy: "storage_plus_cookies",
    seedStatus: "completed",
    blockerReason: "quick_log_save_failed",
    stages,
  });

  it("status fail; earlier passes kept; first fail recorded; later stages not_run", () => {
    expect(receipt.status).toBe("fail");
    expect(receipt.stages.auth_restored).toBe("pass");
    expect(receipt.stages.plant_resolved).toBe("pass");
    expect(receipt.stages.quick_log_persisted).toBe("fail");
    expect(receipt.stages.timeline_visible).toBe("not_run");
    expect(receipt.stages.follow_up_marker_verified).toBe("not_run");
    expect(receipt.stages.auto_diary_follow_up).toBe("not_run");
  });
});

describe("safety violations force fail", () => {
  it("an observed safety boolean forbids a pass receipt even with all stages passing", () => {
    const r = buildOneTentBrowserProofReceipt({
      restoreStrategy: "storage_session",
      seedStatus: "completed",
      stages: allPassStages(),
      safety: { paid_ai_request_observed: true },
    });
    expect(r.status).toBe("fail");
    expect(r.safety.paid_ai_request_observed).toBe(true);
    expect(r.stages.auto_diary_follow_up).toBe("not_run");
  });

  it("safetyViolationReason (e.g. password auth observed) forces fail and lands in blocker_reason", () => {
    const r = buildOneTentBrowserProofReceipt({
      restoreStrategy: "storage_session",
      seedStatus: "completed",
      stages: allPassStages(),
      safetyViolationReason: "password_auth_request_observed",
    });
    expect(r.status).toBe("fail");
    expect(r.blocker_reason).toBe("password_auth_request_observed");
  });
});

describe("determinism + hygiene", () => {
  it("the same staged result serializes byte-identically", () => {
    const staged = {
      restoreStrategy: "storage_session" as const,
      seedStatus: "completed" as const,
      stages: allPassStages(),
      duplicateFences: { quick_log_count: 1 },
    };
    const a = renderOneTentBrowserProofReceipt(buildOneTentBrowserProofReceipt(staged));
    const b = renderOneTentBrowserProofReceipt(buildOneTentBrowserProofReceipt(staged));
    expect(a).toBe(b);
  });

  it("receipt contains no timestamps, worker ids, uuids, or path-like strings", () => {
    const line = renderOneTentBrowserProofReceipt(
      buildBlockedOneTentBrowserProofReceipt("reported_signed_out"),
    );
    expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(line).not.toMatch(/worker/i);
    expect(line).not.toMatch(/\/home\/|\/tmp\/|[A-Z]:\\/);
  });

  it("stage key order is the documented contract order", () => {
    const receipt = buildBlockedOneTentBrowserProofReceipt("x");
    expect(Object.keys(receipt.stages)).toEqual([...ONE_TENT_PROOF_STAGES, "auto_diary_follow_up"]);
  });
});
