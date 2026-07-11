/**
 * One-Tent authenticated browser-proof receipt — versioned, deterministic,
 * machine-readable.
 *
 * Contract:
 *  - Pure data construction + serialization. No I/O, no Date.now, no
 *    randomness, no Playwright types. The Playwright spec feeds a staged
 *    result object in; the SAME staged object must serialize to a
 *    byte-identical line.
 *  - Never contains tokens, cookies, raw requests, private payloads,
 *    worker IDs, trace IDs, UUIDs, file paths, or screenshots.
 *  - Exactly one line, prefixed ONE_TENT_BROWSER_PROOF_JSON=.
 *  - `fabricated_login_used` is the literal false — a receipt claiming
 *    otherwise must be unrepresentable.
 *
 * Consumers:
 *   e2e/one-tent-loop-golden-path-ui.spec.ts
 *   src/test/one-tent-browser-proof-receipt.test.ts
 */

export const ONE_TENT_BROWSER_PROOF_JSON_PREFIX = "ONE_TENT_BROWSER_PROOF_JSON=";

export type StageOutcome = "pass" | "blocked" | "fail" | "not_run";

/** Ordered stage keys — order is part of the receipt contract. */
export const ONE_TENT_PROOF_STAGES = [
  "auth_restored",
  "grow_resolved",
  "tent_resolved",
  "plant_resolved",
  "quick_log_persisted",
  "timeline_visible",
  "manual_provenance_visible",
  "ai_doctor_boundary_verified",
  "alert_verified",
  "action_queue_suggestion_verified",
  "grower_decision_verified",
  "follow_up_marker_verified",
] as const;

export type OneTentProofStage = (typeof ONE_TENT_PROOF_STAGES)[number];

export interface OneTentBrowserProofReceipt {
  schema_version: "1";
  proof: "one-tent-loop-authenticated-ui";
  status: "pass" | "blocked" | "fail";
  blocker_reason: string | null;
  restore_strategy: "storage_session" | "storage_plus_cookies" | "cookies_only" | "none";
  seed_status: "not_started" | "blocked" | "completed" | "failed";
  stages: Record<OneTentProofStage, StageOutcome> & {
    auto_diary_follow_up: "intentionally_unsupported" | "not_run";
  };
  duplicate_fences: {
    quick_log_count: number | null;
    alert_count: number | null;
    action_queue_count: number | null;
    follow_up_marker_count: number | null;
  };
  safety: {
    fabricated_login_used: false;
    paid_ai_request_observed: boolean;
    device_control_request_observed: boolean;
    service_role_in_browser_observed: boolean;
  };
}

export interface OneTentProofStagedResult {
  restoreStrategy: OneTentBrowserProofReceipt["restore_strategy"];
  seedStatus: OneTentBrowserProofReceipt["seed_status"];
  /** Sanitized reason code — never a raw error message. */
  blockerReason?: string | null;
  /**
   * Sanitized safety-violation code (e.g. "password_auth_request_observed").
   * Setting this — or any observed safety boolean — forces the receipt
   * out of "pass" even when all stages passed.
   */
  safetyViolationReason?: string | null;
  /**
   * Outcome per stage. Stages omitted are treated as "not_run".
   * When status resolves to "blocked", every stage must be blocked or
   * not_run — buildOneTentBrowserProofReceipt enforces this.
   */
  stages?: Partial<Record<OneTentProofStage, StageOutcome>>;
  duplicateFences?: Partial<OneTentBrowserProofReceipt["duplicate_fences"]>;
  safety?: Partial<Omit<OneTentBrowserProofReceipt["safety"], "fabricated_login_used">>;
}

function deriveStatus(
  staged: OneTentProofStagedResult,
  stages: Record<OneTentProofStage, StageOutcome>,
): OneTentBrowserProofReceipt["status"] {
  const outcomes = ONE_TENT_PROOF_STAGES.map((k) => stages[k]);
  if (outcomes.some((o) => o === "fail")) return "fail";
  if (outcomes.every((o) => o === "pass")) return "pass";
  return "blocked";
}

/**
 * Build the receipt from a staged result. Deterministic: fixed key
 * order, no clocks, no identifiers. Enforces consistency rules:
 *  - a blocked proof may not carry pass/fail stages after the block
 *    boundary is normalized (blocked stages stay blocked/not_run);
 *  - a fail proof keeps earlier passes, the first fail, and forces
 *    everything after the first fail to not_run.
 */
export function buildOneTentBrowserProofReceipt(
  staged: OneTentProofStagedResult,
): OneTentBrowserProofReceipt {
  const rawStages: Record<OneTentProofStage, StageOutcome> = {} as Record<
    OneTentProofStage,
    StageOutcome
  >;
  for (const key of ONE_TENT_PROOF_STAGES) {
    rawStages[key] = staged.stages?.[key] ?? "not_run";
  }

  // Normalize: after the FIRST fail, later stages cannot claim pass.
  let failed = false;
  for (const key of ONE_TENT_PROOF_STAGES) {
    if (failed && rawStages[key] !== "not_run") rawStages[key] = "not_run";
    if (rawStages[key] === "fail") failed = true;
  }

  let status = deriveStatus(staged, rawStages);

  // An observed safety violation (paid model call, device-control
  // request, service_role in the browser, password-grant auth) can
  // never coexist with a PASS receipt — even when every stage passed.
  const safetyFlags = staged.safety ?? {};
  const safetyViolated =
    Boolean(staged.safetyViolationReason) ||
    safetyFlags.paid_ai_request_observed === true ||
    safetyFlags.device_control_request_observed === true ||
    safetyFlags.service_role_in_browser_observed === true;
  if (safetyViolated && status === "pass") status = "fail";

  // A blocked proof must not report any stage as pass or fail.
  if (status === "blocked") {
    for (const key of ONE_TENT_PROOF_STAGES) {
      if (rawStages[key] === "pass" || rawStages[key] === "fail") {
        rawStages[key] = "blocked";
      }
    }
  }

  const fences = staged.duplicateFences ?? {};
  const safety = staged.safety ?? {};

  return {
    schema_version: "1",
    proof: "one-tent-loop-authenticated-ui",
    status,
    blocker_reason:
      status === "pass" ? null : (staged.safetyViolationReason ?? staged.blockerReason ?? null),
    restore_strategy: staged.restoreStrategy,
    seed_status: staged.seedStatus,
    stages: {
      auth_restored: rawStages.auth_restored,
      grow_resolved: rawStages.grow_resolved,
      tent_resolved: rawStages.tent_resolved,
      plant_resolved: rawStages.plant_resolved,
      quick_log_persisted: rawStages.quick_log_persisted,
      timeline_visible: rawStages.timeline_visible,
      manual_provenance_visible: rawStages.manual_provenance_visible,
      ai_doctor_boundary_verified: rawStages.ai_doctor_boundary_verified,
      alert_verified: rawStages.alert_verified,
      action_queue_suggestion_verified: rawStages.action_queue_suggestion_verified,
      grower_decision_verified: rawStages.grower_decision_verified,
      follow_up_marker_verified: rawStages.follow_up_marker_verified,
      // Honest: the app has no auto-diary handoff; a passing proof
      // records that explicitly instead of pretending coverage.
      auto_diary_follow_up: status === "pass" ? "intentionally_unsupported" : "not_run",
    },
    duplicate_fences: {
      quick_log_count: fences.quick_log_count ?? null,
      alert_count: fences.alert_count ?? null,
      action_queue_count: fences.action_queue_count ?? null,
      follow_up_marker_count: fences.follow_up_marker_count ?? null,
    },
    safety: {
      fabricated_login_used: false,
      paid_ai_request_observed: safety.paid_ai_request_observed ?? false,
      device_control_request_observed: safety.device_control_request_observed ?? false,
      service_role_in_browser_observed: safety.service_role_in_browser_observed ?? false,
    },
  };
}

/** Convenience: fully-blocked receipt (preflight refused; nothing ran). */
export function buildBlockedOneTentBrowserProofReceipt(
  blockerReason: string,
  restoreStrategy: OneTentBrowserProofReceipt["restore_strategy"] = "none",
  seedStatus: Extract<
    OneTentBrowserProofReceipt["seed_status"],
    "not_started" | "blocked"
  > = "blocked",
): OneTentBrowserProofReceipt {
  const stages: Partial<Record<OneTentProofStage, StageOutcome>> = {};
  for (const key of ONE_TENT_PROOF_STAGES) stages[key] = "blocked";
  return buildOneTentBrowserProofReceipt({
    restoreStrategy,
    seedStatus,
    blockerReason,
    stages,
  });
}

/** One compact line. Key order is fixed by construction above. */
export function renderOneTentBrowserProofReceipt(receipt: OneTentBrowserProofReceipt): string {
  return `${ONE_TENT_BROWSER_PROOF_JSON_PREFIX}${JSON.stringify(receipt)}`;
}
