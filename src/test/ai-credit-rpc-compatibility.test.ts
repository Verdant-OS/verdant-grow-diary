import { describe, expect, it } from "vitest";
import { isMissingAiCreditRpcOverload } from "../../supabase/functions/_shared/aiCreditRpcCompatibility.ts";

describe("AI credit edge-first RPC compatibility", () => {
  it("recognizes only the missing service spend overload", () => {
    expect(
      isMissingAiCreditRpcOverload(
        {
          code: "PGRST202",
          message:
            "Could not find the function public.ai_credit_spend(p_billing_environment, p_feature, p_user_id) in the schema cache",
        },
        "ai_credit_spend",
        "p_user_id",
      ),
    ).toBe(true);
  });

  it("recognizes Postgres undefined-function errors for the expected refund overload", () => {
    expect(
      isMissingAiCreditRpcOverload(
        {
          code: "42883",
          message:
            "function public.ai_credit_refund(p_expected_user_id => uuid, p_spend_id => uuid) does not exist",
        },
        "ai_credit_refund",
        "p_expected_user_id",
      ),
    ).toBe(true);
  });

  it.each([
    ["permission", { code: "42501", message: "permission denied for function ai_credit_spend" }],
    ["timeout", { code: "57014", message: "canceling statement due to timeout" }],
    ["database", { code: "XX000", message: "internal database error" }],
    ["schema cache", { code: "PGRST204", message: "schema cache error" }],
    ["null", null],
  ])("rejects arbitrary %s errors", (_label, error) => {
    expect(isMissingAiCreditRpcOverload(error, "ai_credit_spend", "p_user_id")).toBe(false);
  });

  it("rejects a missing-function error for the wrong function or overload", () => {
    const error = {
      code: "PGRST202",
      message: "Could not find public.ai_credit_refund(p_expected_user_id)",
    };
    expect(isMissingAiCreditRpcOverload(error, "ai_credit_spend", "p_user_id")).toBe(false);
    expect(
      isMissingAiCreditRpcOverload(
        { code: "PGRST202", message: "Could not find public.ai_credit_spend(p_feature)" },
        "ai_credit_spend",
        "p_user_id",
      ),
    ).toBe(false);
  });
});
