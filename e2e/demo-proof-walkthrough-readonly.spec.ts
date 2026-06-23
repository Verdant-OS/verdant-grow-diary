import { test, expect, type Request } from "@playwright/test";

/**
 * Demo Proof Walkthrough — no-write E2E guard.
 *
 * Loads /internal/demo-proof-walkthrough and asserts that the page does
 * NOT issue any write-capable network calls during render. The
 * walkthrough is a read-only presenter: it must not submit Quick Logs,
 * invoke Edge Functions, call AI providers, create alerts, approve
 * actions, or perform any Supabase mutation.
 */

const FORBIDDEN_PATH_FRAGMENTS: ReadonlyArray<RegExp> = [
  /\/functions\/v1\//i, // any edge function invocation
  /\/rpc\/quicklog_save/i,
  /\/rpc\/.*alert/i,
  /\/rpc\/.*action/i,
  /\/rpc\/.*ai/i,
  /\/rest\/v1\/grow_events/i,
  /\/rest\/v1\/diary_entries/i,
  /\/rest\/v1\/action_queue/i,
  /\/rest\/v1\/alerts/i,
  /\/rest\/v1\/ai_/i,
  /openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /ai\.gateway\.lovable\.dev/i,
];

const SAFE_NON_GET_HOSTS: ReadonlyArray<RegExp> = [
  /\/auth\/v1\/(token|user|session|logout)/i, // session refresh only
];

function isForbidden(req: Request): boolean {
  const method = req.method().toUpperCase();
  const url = req.url();
  if (FORBIDDEN_PATH_FRAGMENTS.some((re) => re.test(url))) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }
  if (SAFE_NON_GET_HOSTS.some((re) => re.test(url))) return false;
  // Any other non-GET to a Supabase REST/RPC surface is forbidden.
  if (/\/rest\/v1\//i.test(url)) return true;
  if (/\/rpc\//i.test(url)) return true;
  return false;
}

test("Demo Proof Walkthrough triggers no write-capable network calls on load", async ({
  page,
}) => {
  const violations: Array<{ method: string; url: string }> = [];

  page.on("request", (req) => {
    if (isForbidden(req)) {
      violations.push({ method: req.method(), url: req.url() });
    }
  });

  await page.goto("/internal/demo-proof-walkthrough", {
    waitUntil: "domcontentloaded",
  });

  // Wait long enough that any deferred fetches would have fired.
  await page.waitForTimeout(1500);

  // Walkthrough surface is present and read-only.
  await expect(
    page.getByTestId("demo-proof-walkthrough-page"),
  ).toBeVisible();
  await expect(
    page.getByTestId("demo-proof-walkthrough-readonly-banner"),
  ).toBeVisible();
  // Navigation links exist (don't click them — that would leave the page).
  const stepLinks = page.locator(
    '[data-testid^="demo-proof-walkthrough-step-"][data-testid$="-link"]',
  );
  expect(await stepLinks.count()).toBeGreaterThan(0);

  expect(
    violations,
    `Demo Proof Walkthrough must not trigger write-capable calls. Got: ${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
});
