/**
 * aiCoachCreditDenialAdapter — unit tests (S3.2).
 */
import { describe, it, expect } from "vitest";
import { parseAiCoachCreditDenial } from "@/lib/aiCoachCreditDenialAdapter";

function fakeHttpError(body: unknown, status = 402) {
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: {
      status,
      json: async () => body,
    },
  };
}

const validCredit = {
  ok: false,
  status: "denied",
  reason: "limit_reached",
  scope: "per_grow",
  scope_used: 3,
  scope_limit: 3,
  remaining: 0,
  plan_id: "free",
};

describe("parseAiCoachCreditDenial", () => {
  it("parses HTTP 402 credit_denied body into a normalized denial", async () => {
    const out = await parseAiCoachCreditDenial(
      fakeHttpError({ error: "credit_denied", credit: validCredit }),
    );
    expect(out).not.toBeNull();
    expect(out?.reason).toBe("credit_denied");
    expect(out?.credit.plan_id).toBe("free");
    expect(out?.credit.scope).toBe("per_grow");
  });

  it("returns null when error code is not credit_denied", async () => {
    const out = await parseAiCoachCreditDenial(
      fakeHttpError({ error: "internal", credit: validCredit }, 500),
    );
    expect(out).toBeNull();
  });

  it("returns null when credit payload is malformed (missing status)", async () => {
    const out = await parseAiCoachCreditDenial(
      fakeHttpError({ error: "credit_denied", credit: { ok: false, scope: "x" } }),
    );
    expect(out).toBeNull();
  });

  it("returns null when credit payload is missing entirely", async () => {
    const out = await parseAiCoachCreditDenial(
      fakeHttpError({ error: "credit_denied" }),
    );
    expect(out).toBeNull();
  });

  it("does not throw when context.json throws", async () => {
    const err = {
      name: "FunctionsHttpError",
      context: {
        status: 402,
        json: async () => {
          throw new Error("boom");
        },
        text: async () => '{"error":"credit_denied","credit":' + JSON.stringify(validCredit) + "}",
      },
    };
    const out = await parseAiCoachCreditDenial(err);
    expect(out?.reason).toBe("credit_denied");
  });

  it("does not throw when context is undefined", async () => {
    const out = await parseAiCoachCreditDenial({
      name: "FunctionsHttpError",
      message: "no context",
    });
    expect(out).toBeNull();
  });

  it("returns null for plain Error / null / non-object errors", async () => {
    expect(await parseAiCoachCreditDenial(null)).toBeNull();
    expect(await parseAiCoachCreditDenial(undefined)).toBeNull();
    expect(await parseAiCoachCreditDenial("nope")).toBeNull();
    expect(await parseAiCoachCreditDenial(new Error("generic"))).toBeNull();
  });

  it("returns null when body is not a JSON object (text fallback non-JSON)", async () => {
    const err = {
      name: "FunctionsHttpError",
      context: {
        status: 502,
        json: async () => {
          throw new Error("bad json");
        },
        text: async () => "Bad Gateway",
      },
    };
    expect(await parseAiCoachCreditDenial(err)).toBeNull();
  });
});
