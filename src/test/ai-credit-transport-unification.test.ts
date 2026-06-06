/**
 * Credit-denial transport unification — static + behavioral.
 *
 * Locks the unified 200-envelope contract for credit business-rule
 * outcomes across `ai-coach` and `ai-doctor-review`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adaptCreditedAiResponse,
  type AiCreditedFailureReason,
} from "@/lib/aiCreditedResponseAdapter";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("ai-coach edge — 200-envelope credit transport", () => {
  const src = read("supabase/functions/ai-coach/index.ts");

  it("ai_credit_spend denial returns 200 with { ok:false, reason:'credit_denied', credit }", () => {
    // The denial branch must not return a non-200 status.
    expect(src).toMatch(
      /spendObj\.ok\s*!==\s*true[\s\S]{0,300}return\s+json\(\s*\{\s*ok:\s*false,\s*reason:\s*"credit_denied",\s*credit:\s*spendObj\s*\}\s*,\s*200\s*\)/,
    );
    // Legacy shapes removed.
    expect(src).not.toMatch(
      /return\s+json\(\s*\{\s*error:\s*"credit_denied"[\s\S]{0,80}\}\s*,\s*402/,
    );
  });

  it("upstream provider 402 after refund returns 200 with { ok:false, reason:'upstream_credit_exhausted' }", () => {
    expect(src).toMatch(
      /r\.status\s*===\s*402[\s\S]{0,200}refund\(\s*"upstream_402"\s*\)[\s\S]{0,300}return\s+json\(\s*\{\s*ok:\s*false,\s*reason:\s*"upstream_credit_exhausted"\s*\}\s*,\s*200\s*\)/,
    );
    // Legacy 402 paywall copy removed.
    expect(src).not.toMatch(/AI credits exhausted\. Add credits/);
  });

  it("logs the new HTTP=200 business envelopes", () => {
    expect(src).toMatch(/ai-coach status=credit_denied http=200/);
    expect(src).toMatch(/ai-coach status=upstream_credit_exhausted http=200/);
  });

  it("does not introduce new RPCs, action_queue writes, device control, or service_role", () => {
    const rpcCalls = [
      ...src.matchAll(/\.rpc\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g),
    ].map((m) => m[1]);
    for (const name of rpcCalls) {
      expect(["ai_credit_spend", "ai_credit_refund"]).toContain(name);
    }
    expect(src).not.toMatch(/\baction_queue\b/);
    expect(src).not.toMatch(/\bservice_role\b/);
    expect(src).not.toMatch(/\b(turn on|switch off|toggle the|power the)\b/i);
  });
});

describe("ai-doctor-review edge — credit_denied envelope unchanged", () => {
  const src = read("supabase/functions/ai-doctor-review/index.ts");

  it("still returns HTTP 200 { ok:false, reason:'credit_denied', credit } via calmFailure", () => {
    expect(src).toMatch(
      /spendObj\.ok\s*!==\s*true[\s\S]{0,300}return\s+calmFailure\(\s*"credit_denied"\s*,\s*\{\s*credit:\s*spendObj\s*\}\s*\)/,
    );
    // calmFailure returns 200.
    expect(src).toMatch(
      /function\s+calmFailure[\s\S]{0,200}status:\s*200/,
    );
  });
});

describe("shared adapter — adaptCreditedAiResponse", () => {
  it("passes credit_denied through with credit payload intact", () => {
    const credit = {
      ok: false,
      status: "denied",
      reason: "limit_reached",
      scope: "per_month",
      scope_limit: 100,
      remaining: 0,
    };
    const out = adaptCreditedAiResponse({
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

  it("passes upstream_credit_exhausted through with no credit", () => {
    const out = adaptCreditedAiResponse({
      ok: false,
      reason: "upstream_credit_exhausted",
    });
    expect(out.ok).toBe(false);
    if (out.ok === false) {
      expect(out.reason).toBe("upstream_credit_exhausted");
      expect(out.credit).toBeUndefined();
    }
  });

  it("upstream_credit_exhausted is NOT coerced to credit_denied or invalid", () => {
    const out = adaptCreditedAiResponse({
      ok: false,
      reason: "upstream_credit_exhausted",
    });
    if (out.ok === false) {
      expect(out.reason).not.toBe("credit_denied");
      expect(out.reason).not.toBe("invalid");
    }
  });

  it("unknown reason falls back to 'invalid'", () => {
    const out = adaptCreditedAiResponse({ ok: false, reason: "gibberish" });
    if (out.ok === false) expect(out.reason).toBe("invalid");
  });

  it("preserves credit on upstream_credit_exhausted when server included one", () => {
    const credit = { ok: false, status: "denied", scope: "per_month" };
    const out = adaptCreditedAiResponse({
      ok: false,
      reason: "upstream_credit_exhausted",
      credit,
    });
    if (out.ok === false) {
      expect(out.reason).toBe("upstream_credit_exhausted");
      expect(out.credit).toEqual(credit);
    }
  });

  it("type allow-list includes upstream_credit_exhausted", () => {
    const accepted: AiCreditedFailureReason[] = [
      "config",
      "http",
      "timeout",
      "parse",
      "empty",
      "invalid",
      "shape",
      "credit_denied",
      "upstream_credit_exhausted",
    ];
    // Compile-time assertion; runtime sanity:
    expect(accepted.length).toBe(9);
  });
});

describe("Coach client — credit transport wiring", () => {
  const src = read("src/pages/Coach.tsx");

  it("uses the shared adapter (no Coach-specific denial parser)", () => {
    expect(src).toMatch(
      /import\s+\{\s*adaptCreditedAiResponse\s*\}\s+from\s+["']@\/lib\/aiCreditedResponseAdapter["']/,
    );
    expect(src).not.toMatch(/parseAiCoachCreditDenial/);
    expect(src).not.toMatch(/aiCoachCreditDenialAdapter/);
  });

  it("treats invoke `error` as a generic transport failure (no body parsing)", () => {
    const ask = src.split(/async\s+function\s+ask\(/)[1] ?? "";
    expect(ask).toMatch(/if\s*\(\s*error\s*\)\s*\{[\s\S]{0,200}throw\s+error\s*;\s*\}/);
  });

  it("credit_denied path sets denial state and short-circuits", () => {
    expect(src).toMatch(
      /outcome\.reason\s*===\s*"credit_denied"[\s\S]{0,200}setCreditDenial\(/,
    );
  });

  it("upstream_credit_exhausted sets a degraded state (no paywall)", () => {
    expect(src).toMatch(
      /outcome\.reason\s*===\s*"upstream_credit_exhausted"[\s\S]{0,200}setUpstreamCreditExhausted\(\s*true\s*\)/,
    );
    // Render block exists and is not the paywall/credit-limit notice.
    expect(src).toMatch(
      /data-testid=["']coach-upstream-credit-exhausted-notice["']/,
    );
  });

  it("upstream_credit_exhausted render does not mount AiCreditLimitNotice", () => {
    const block =
      src
        .split('data-testid="coach-upstream-credit-exhausted-notice"')[1]
        ?.split("</div>")[0] ?? "";
    expect(block).not.toMatch(/AiCreditLimitNotice/);
    // No upsell/CTA language inside the degraded notice.
    expect(block).not.toMatch(/upgrade|add credits|buy|subscribe/i);
  });
});
