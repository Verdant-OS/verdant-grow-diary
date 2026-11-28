// Security review finding E1 (2026-11-19): the paid Cultivar Q&A had no per-user
// limit, so one account could loop the shared AI gateway. These tests pin the cap's
// decision rules and that the Edge function counts the call before the model call.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CULTIVAR_QA_DAILY_LIMIT,
  decideCultivarQaDailyCap,
} from "../../supabase/functions/_shared/cultivarQaDailyCap.ts";

const INDEX = readFileSync(resolve("supabase/functions/ai-cultivar-qa/index.ts"), "utf8");
const MIGRATION = readFileSync(
  resolve("supabase/migrations/20261128070000_ai_cultivar_qa_daily_usage.sql"),
  "utf8",
);
const PANEL = readFileSync(resolve("src/components/CultivarQaPanel.tsx"), "utf8");
const REACH = JSON.parse(readFileSync(resolve("config/edge-function-domain-reach.json"), "utf8"));

describe("decideCultivarQaDailyCap", () => {
  it("allows a call the RPC counted", () => {
    expect(
      decideCultivarQaDailyCap({ data: { allowed: true, used: 3, limit: 30 }, error: null }),
    ).toEqual({ ok: true, used: 3, limit: 30 });
  });

  it("allows the call that reaches the limit exactly", () => {
    expect(
      decideCultivarQaDailyCap({ data: { allowed: true, used: 30, limit: 30 }, error: null }),
    ).toEqual({ ok: true, used: 30, limit: 30 });
  });

  it("answers daily_limit_reached with a calm 200 when the RPC denies", () => {
    expect(
      decideCultivarQaDailyCap({ data: { allowed: false, used: 30, limit: 30 }, error: null }),
    ).toEqual({ ok: false, reason: "daily_limit_reached", status: 200 });
  });

  it.each([
    ["an RPC error", { data: null, error: { message: "function does not exist" } }],
    [
      "an error alongside an allowed answer",
      {
        data: { allowed: true, used: 1, limit: 30 },
        error: { message: "x" },
      },
    ],
    ["no data", { data: null, error: null }],
    ["an array", { data: [{ allowed: true, used: 1, limit: 30 }], error: null }],
    ["a string", { data: "allowed", error: null }],
    ["a missing allowed flag", { data: { used: 1, limit: 30 }, error: null }],
    ["a string allowed flag", { data: { allowed: "true", used: 1, limit: 30 }, error: null }],
    ["a negative count", { data: { allowed: true, used: -1, limit: 30 }, error: null }],
    ["a fractional count", { data: { allowed: true, used: 1.5, limit: 30 }, error: null }],
    ["a missing limit", { data: { allowed: true, used: 1 }, error: null }],
    ["a count past the limit", { data: { allowed: true, used: 31, limit: 30 }, error: null }],
  ])("fails closed on %s", (_label, result) => {
    expect(decideCultivarQaDailyCap(result)).toEqual({
      ok: false,
      reason: "usage_unavailable",
      status: 503,
    });
  });

  it("is a positive whole number", () => {
    expect(Number.isInteger(CULTIVAR_QA_DAILY_LIMIT)).toBe(true);
    expect(CULTIVAR_QA_DAILY_LIMIT).toBeGreaterThan(0);
  });
});

describe("ai-cultivar-qa counts the call before the model call", () => {
  // @source-scan-justified: Deno.serve entry point; the handler cannot be imported and run under Vitest.
  it("calls the consume RPC with the verified user and the shared limit", () => {
    expect(INDEX).toMatch(/from "\.\.\/_shared\/cultivarQaDailyCap\.ts"/);
    expect(INDEX).toMatch(
      /\.rpc\("ai_cultivar_qa_consume",\s*\{\s*p_user_id:\s*u\.user\.id,\s*p_daily_limit:\s*CULTIVAR_QA_DAILY_LIMIT,?\s*\}\)/,
    );
    expect(INDEX).toMatch(/decideCultivarQaDailyCap\(/);
  });

  // @source-scan-justified: ordering inside the Deno handler can only be read from source.
  it("checks the cap after the paid gate and request validation, before the gateway fetch", () => {
    const paid = INDEX.indexOf("if (!isPaid)");
    const parsed = INDEX.indexOf("if (!parsedRequest.ok)");
    const cap = INDEX.indexOf('.rpc("ai_cultivar_qa_consume"');
    const denied = INDEX.indexOf("if (!dailyCap.ok)");
    const gateway = INDEX.indexOf("https://ai.gateway.lovable.dev");
    expect(paid).toBeGreaterThan(-1);
    expect(parsed).toBeGreaterThan(paid);
    expect(cap).toBeGreaterThan(parsed);
    expect(denied).toBeGreaterThan(cap);
    expect(gateway).toBeGreaterThan(denied);
  });

  it("declares the RPC in the service-role reach manifest", () => {
    expect(REACH.functions["ai-cultivar-qa"]).toMatchObject({
      domain: "ai",
      tables: [],
      rpcs: ["ai_cultivar_qa_consume"],
    });
  });
});

describe("ai_cultivar_qa_daily_usage migration", () => {
  // @source-scan-justified: the migration is SQL; its behaviour is proven by supabase/tests/ai_cultivar_qa_daily_usage.sql.
  it("keeps browsers out of the table and the function", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE public\.ai_cultivar_qa_daily_usage ENABLE ROW LEVEL SECURITY;/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON TABLE public\.ai_cultivar_qa_daily_usage\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.ai_cultivar_qa_consume\(uuid, integer\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ai_cultivar_qa_consume\(uuid, integer\) TO service_role;/,
    );
    expect(MIGRATION).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
  });
});

describe("CultivarQaPanel copy", () => {
  // @source-scan-justified: reasonCopy is module-private; the panel test renders upstream_error only.
  it("explains the daily limit in plain words", () => {
    expect(PANEL).toMatch(
      /case "daily_limit_reached":\s*return "You've reached today's limit for cultivar questions\. It resets at midnight UTC\.";/,
    );
  });
});
