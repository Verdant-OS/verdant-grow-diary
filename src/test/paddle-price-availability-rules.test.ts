/**
 * paddlePriceAvailabilityRules — a plan that cannot be priced must read as
 * unavailable, not as a fault, and must never leak internal ids or promise a
 * launch the app cannot know about.
 *
 * Regression context: getPaddlePriceId threw a bare Error for every failure,
 * so an unconfigured plan produced a destructive "Checkout unavailable" toast
 * whose body was `Failed to resolve price: craft_monthly` — a configuration
 * state presented as a crash, with the internal plan id shown to the buyer.
 */
import { describe, expect, it } from "vitest";
import {
  PLAN_SOLD_OUT_MESSAGE,
  PLAN_UNAVAILABLE_MESSAGE,
  classifyPaddlePriceFailure,
  extractFunctionErrorCode,
} from "@/lib/paddlePriceAvailabilityRules";

/** Shape supabase-js produces for a non-2xx function response. */
function httpError(code: string, asString = false) {
  return { context: { body: asString ? JSON.stringify({ error: code }) : { error: code } } };
}

describe("paddle price availability", () => {
  it("treats every server 'not purchasable' code as unavailable", () => {
    for (const code of [
      "price_resolution_unavailable",
      "unknown_plan",
      "price_not_configured",
      "plan_sold_out",
    ]) {
      const result = classifyPaddlePriceFailure({ invokeError: httpError(code), data: null });
      expect(result.kind, `${code} should classify as unavailable`).toBe("unavailable");
    }
  });

  it("reads the discriminating code whether the body is parsed or a JSON string", () => {
    expect(extractFunctionErrorCode(httpError("unknown_plan"))).toBe("unknown_plan");
    expect(extractFunctionErrorCode(httpError("unknown_plan", true))).toBe("unknown_plan");
    expect(extractFunctionErrorCode({ context: { body: "not json" } })).toBeNull();
    expect(extractFunctionErrorCode(null)).toBeNull();
  });

  it("honours an error code returned on an otherwise-successful response", () => {
    const result = classifyPaddlePriceFailure({
      invokeError: null,
      data: { error: "price_not_configured" },
    });
    expect(result.kind).toBe("unavailable");
  });

  it("fails OPEN to unexpected for anything unrecognised", () => {
    // A new or unknown server code must keep the louder treatment rather than
    // being silently reclassified as a benign, expected state.
    expect(classifyPaddlePriceFailure({ invokeError: httpError("weird_new_code") }).kind).toBe(
      "unexpected",
    );
    expect(classifyPaddlePriceFailure({ invokeError: new Error("network down") }).kind).toBe(
      "unexpected",
    );
    expect(classifyPaddlePriceFailure({ invokeError: null, data: null }).kind).toBe("unexpected");
  });

  it("never leaks an internal plan id or server code to the grower", () => {
    const messages = [PLAN_UNAVAILABLE_MESSAGE, PLAN_SOLD_OUT_MESSAGE];
    for (const message of messages) {
      expect(message).not.toMatch(/craft|pro_monthly|pro_annual|founder_lifetime|_id\b/i);
      expect(message).not.toMatch(/price_resolution|unknown_plan|price_not_configured|paddle/i);
    }
  });

  it("never promises a launch the app cannot know about", () => {
    // A failed price lookup cannot distinguish "not launched yet" from "a
    // secret was rotated". Claiming intent would be a guess presented as fact.
    for (const message of [PLAN_UNAVAILABLE_MESSAGE, PLAN_SOLD_OUT_MESSAGE]) {
      expect(message).not.toMatch(/coming soon|launching|soon|early access|waitlist/i);
    }
  });

  it("reassures that nothing was charged and scopes the failure to one plan", () => {
    for (const message of [PLAN_UNAVAILABLE_MESSAGE, PLAN_SOLD_OUT_MESSAGE]) {
      expect(message).toMatch(/nothing was charged/i);
      expect(message).toMatch(/other plans are unaffected/i);
    }
  });

  it("is plan-agnostic — no tier is special-cased", () => {
    // A tier-specific branch would go stale the day that tier ships and would
    // leave every other plan unprotected.
    const source = classifyPaddlePriceFailure.toString();
    expect(source).not.toMatch(/craft|pro_monthly|founder/i);
  });
});
