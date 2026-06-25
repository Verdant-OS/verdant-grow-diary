import { describe, it, expect } from "vitest";
import {
  recommendForStatus,
  recommendForwardingNextStep,
  NEXT_STEP_COPY,
} from "@/lib/ecowittForwardingRecommendedNextStepRules";
import type { LocalForwardingStatus } from "@/lib/ecowittLocalForwardingStatus";

const BASE: LocalForwardingStatus = {
  ok: true,
  forwarding_enabled: true,
  forwarding_ready: true,
  ingest_url_configured: true,
  bridge_token_configured: true,
  tent_id_configured: true,
  tent_id_valid: true,
  last_forward_status: 200,
  last_forward_error: null,
  last_forward_response_error: null,
  last_forward_response_classification: null,
  last_forward_response_reason: null,
  last_forward_response_message: null,
  forward_success_count: 1,
  forward_failure_count: 0,
  forward_attempt_count: 1,
  forward_blocked_count: 0,
  retry_count: 0,
  last_retry_error: null,
  last_retry_at: null,
  last_retryable_status: null,
  max_retry_attempts: 2,
  recommended_next_step: null,
  malformed_line_count: 0,
  generated_at: null,
  latest_metrics: null,
};

describe("ecowittForwardingRecommendedNextStepRules", () => {
  it("returns offline copy when fetch state is offline", () => {
    expect(
      recommendForwardingNextStep({ state: "offline", reason: "x" }).kind,
    ).toBe("offline");
  });

  it("classifies token_revoked / token_expired / forbidden_tent", () => {
    for (const [c, k] of [
      ["token_revoked", "token_revoked"],
      ["token_expired", "token_expired"],
      ["forbidden_tent", "forbidden_tent"],
    ] as const) {
      const out = recommendForStatus({
        ...BASE,
        last_forward_status: 401,
        forward_failure_count: 1,
        last_forward_response_classification: c,
      });
      expect(out.kind).toBe(k);
      expect(out.text).toBe(NEXT_STEP_COPY[k]);
    }
  });

  it("classifies every storage_insert_failed reason", () => {
    for (const r of [
      "insert_required_field_missing",
      "insert_source_constraint_failed",
      "insert_check_failed",
      "insert_column_mismatch",
      "insert_duplicate",
      "insert_unknown",
    ] as const) {
      const out = recommendForStatus({
        ...BASE,
        last_forward_status: 400,
        forward_failure_count: 1,
        last_forward_response_classification: "storage_insert_failed",
        last_forward_response_reason: r,
      });
      expect(out.kind).toBe(r);
    }
  });

  it("storage_insert_failed with no reason maps to missing_reason", () => {
    expect(
      recommendForStatus({
        ...BASE,
        last_forward_status: 400,
        forward_failure_count: 1,
        last_forward_response_classification: "storage_insert_failed",
        last_forward_response_reason: null,
      }).kind,
    ).toBe("missing_reason");
  });

  it("surfaces config gaps before failure copy", () => {
    expect(
      recommendForStatus({ ...BASE, forwarding_enabled: false }).kind,
    ).toBe("forwarding_disabled");
    expect(
      recommendForStatus({ ...BASE, bridge_token_configured: false }).kind,
    ).toBe("bridge_token_missing");
    expect(recommendForStatus({ ...BASE, tent_id_valid: false }).kind).toBe(
      "tent_id_invalid",
    );
  });

  it("healthy state returns healthy", () => {
    expect(recommendForStatus(BASE).kind).toBe("healthy");
  });

  it("never recommends raw SQL or direct database edits", () => {
    for (const text of Object.values(NEXT_STEP_COPY)) {
      expect(text).not.toMatch(/\bSQL\b/i);
      expect(text).not.toMatch(/\bUPDATE\s+\w+\s+SET\b/i);
      expect(text).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(text).not.toMatch(/edit\s+the\s+database/i);
      expect(text).not.toMatch(/edit\s+\w+\s+rows/i);
    }
  });
});
