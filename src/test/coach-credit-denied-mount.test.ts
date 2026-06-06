/**
 * Coach page — credit_denied UX wiring (S3.2).
 *
 * Behavior is asserted at the source-level (same convention as
 * coach-ai-doctor-session-id-threading.test.tsx) because Coach has a deep
 * dependency tree (sensors, diary, sufficiency, storage upload). The
 * wiring is pure data-threading, so source invariants are the right
 * regression surface.
 *
 * Hard invariants asserted here:
 *  - The Coach surface imports the shared `AiCreditLimitNotice` and the
 *    Coach-specific `parseAiCoachCreditDenial` adapter.
 *  - On invoke error the adapter is consulted *before* the generic toast.
 *  - When the adapter returns a denial, the toast is suppressed (return).
 *  - The notice mounts with `surface="coach"` and a stable test id.
 *  - No new edge functions, schema, RLS, or Action Queue writes are
 *    introduced. No new Supabase reads. No PaywallCta changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const ADAPTER = readFileSync(
  resolve(ROOT, "src/lib/aiCoachCreditDenialAdapter.ts"),
  "utf8",
);

describe("Coach — credit_denied mount wiring (S3.2)", () => {
  it("imports shared notice + Coach adapter + AiCreditDenial type", () => {
    expect(COACH).toMatch(
      /import\s+AiCreditLimitNotice\s+from\s+["']@\/components\/AiCreditLimitNotice["']/,
    );
    expect(COACH).toMatch(
      /import\s+\{\s*parseAiCoachCreditDenial\s*\}\s+from\s+["']@\/lib\/aiCoachCreditDenialAdapter["']/,
    );
    expect(COACH).toMatch(
      /import\s+type\s+\{\s*AiCreditDenial\s*\}\s+from\s+["']@\/lib\/aiCreditLimitNoticeViewModel["']/,
    );
  });

  it("declares creditDenial state and clears it on every new ask()", () => {
    expect(COACH).toMatch(
      /const\s+\[creditDenial,\s*setCreditDenial\]\s*=\s*useState<AiCreditDenial\s*\|\s*null>\(null\)/,
    );
    const askBlock = COACH.split(/async\s+function\s+ask\(/)[1] ?? "";
    expect(askBlock).toMatch(/setCreditDenial\(null\)/);
    // Reset must happen before the edge call (no stale denial flash).
    const idxReset = askBlock.indexOf("setCreditDenial(null)");
    const idxInvoke = askBlock.indexOf("functions.invoke");
    expect(idxReset).toBeGreaterThan(-1);
    expect(idxInvoke).toBeGreaterThan(idxReset);
  });

  it("parses denial inside the invoke-error branch BEFORE re-throwing to the generic toast", () => {
    const askBlock = COACH.split(/async\s+function\s+ask\(/)[1] ?? "";
    // Error guard must call the adapter, set state, and return early
    // before any throw / generic toast path.
    expect(askBlock).toMatch(
      /if\s*\(\s*error\s*\)\s*\{[\s\S]*?parseAiCoachCreditDenial\(\s*error\s*\)[\s\S]*?if\s*\(\s*denial\s*\)\s*\{[\s\S]*?setCreditDenial\(\s*denial\.credit\s*\)[\s\S]*?return\s*;[\s\S]*?\}[\s\S]*?throw\s+error\s*;[\s\S]*?\}/,
    );
  });

  it("mounts <AiCreditLimitNotice surface='coach' /> only when creditDenial is set", () => {
    expect(COACH).toMatch(
      /\{\s*creditDenial\s*&&\s*\([\s\S]{0,400}<AiCreditLimitNotice[\s\S]{0,400}surface=["']coach["'][\s\S]{0,200}data-testid=["']coach-credit-limit-notice["']/,
    );
  });

  it("does not pass user_id, plan, or remaining as a prop (server is source of truth)", () => {
    const noticeMount =
      COACH.split("<AiCreditLimitNotice")[1]?.split("</")[0] ?? "";
    expect(noticeMount).not.toMatch(/\buser_id\b/);
    expect(noticeMount).not.toMatch(/\bremaining\b/);
    expect(noticeMount).not.toMatch(/\bplan_id\b/);
  });

  it("does not introduce a new Supabase read for credit balance", () => {
    // Only writes & invoke that already existed. No `.from("ai_credit_*")`
    // and no `.rpc("ai_credit_*")` reads on the client.
    expect(COACH).not.toMatch(/from\(["']ai_credit/);
    expect(COACH).not.toMatch(/\.rpc\(\s*["']ai_credit/);
  });

  it("does not introduce new functions.invoke calls", () => {
    const invokeCount = (COACH.match(/functions\.invoke\(/g) ?? []).length;
    expect(invokeCount).toBe(1);
  });

  it("does not introduce new action_queue write surfaces", () => {
    const aqInserts =
      COACH.match(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/g) ?? [];
    expect(aqInserts.length).toBe(2);
  });

  it("Coach denial adapter is pure (no React/Supabase/Date.now/fetch)", () => {
    expect(ADAPTER).not.toMatch(/from\s+["']react["']/);
    expect(ADAPTER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(ADAPTER).not.toMatch(/\bDate\.now\b/);
    expect(ADAPTER).not.toMatch(/\bfetch\(/);
  });

  it("Coach denial adapter does not import any payment provider SDK", () => {
    for (const sdk of [
      "stripe",
      "@stripe",
      "paddle",
      "@paddle",
      "lemonsqueezy",
      "@polar-sh",
    ]) {
      expect(ADAPTER.toLowerCase()).not.toContain(sdk);
    }
  });
});
