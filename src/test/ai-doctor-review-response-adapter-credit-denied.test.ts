import { describe, it, expect } from "vitest";
import { adaptAiDoctorReviewResponse } from "@/lib/aiDoctorReviewResponseAdapter";

const credit = {
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: "per_month",
  scope_used: 100,
  scope_limit: 100,
  remaining: 0,
  plan_id: "pro_monthly",
  period_key: "2026-06",
};

describe("adaptAiDoctorReviewResponse — credit_denied passthrough", () => {
  it("round-trips reason=credit_denied with credit payload intact", () => {
    const out = adaptAiDoctorReviewResponse({
      ok: false,
      reason: "credit_denied",
      credit,
    });
    expect(out.ok).toBe(false);
    if (out.ok === false) {
      expect(out.reason).toBe("credit_denied");
      expect(out.credit).toEqual(credit);
    }
  });

  it("regression guard: all legacy reasons still map unchanged", () => {
    for (const reason of [
      "config",
      "http",
      "timeout",
      "parse",
      "empty",
      "invalid",
      "shape",
    ]) {
      const out = adaptAiDoctorReviewResponse({ ok: false, reason });
      expect(out.ok).toBe(false);
      if (out.ok === false) expect(out.reason).toBe(reason);
    }
  });

  it("unknown reason still falls back to 'invalid' (no regression)", () => {
    const out = adaptAiDoctorReviewResponse({ ok: false, reason: "gibberish" });
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe("invalid");
  });
});
