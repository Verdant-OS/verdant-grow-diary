import { test, expect, type Request } from "@playwright/test";

/**
 * One-Tent Loop Proof — never-healthy browser regression.
 *
 * SAFETY POSTURE
 *  - Read-only. No writes. No auth bypass. No credentials.
 *  - Runs in the `chromium-mocked` project (no logged-in state).
 *  - The `/one-tent-loop-proof` route is grower-facing and gated by auth,
 *    so an unauthenticated navigation will be redirected to `/auth`.
 *    That is EXPECTED. The spec still enforces:
 *      1. No write-capable network calls are triggered.
 *      2. Nothing rendered along the redirect path leaks unsafe
 *         "healthy / OK / success / verified" wording.
 *  - Route-level rendering with fixture telemetry is proven at the
 *    Vitest layer:
 *        src/test/one-tent-loop-proof-rules.test.ts
 *        src/test/one-tent-loop-proof-telemetry-fuzz.test.ts
 *        src/test/one-tent-loop-live-proof-presenter.test.tsx
 *    Those tests render the real presenter through the pure rules and
 *    view-model with malformed stale / invalid / demo / unknown
 *    telemetry and assert no unsafe wording.
 *
 * What this spec adds on top of Vitest: a browser-level check that the
 * production bundle serving `/one-tent-loop-proof` cannot slip unsafe
 * health copy or a write-capable request into a real browser load.
 */

const FORBIDDEN_PATH_FRAGMENTS: ReadonlyArray<RegExp> = [
  /\/functions\/v1\//i,
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
  /\/auth\/v1\/(token|user|session|logout)/i,
];

function isForbidden(req: Request): boolean {
  const method = req.method().toUpperCase();
  const url = req.url();
  if (FORBIDDEN_PATH_FRAGMENTS.some((re) => re.test(url))) return true;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (SAFE_NON_GET_HOSTS.some((re) => re.test(url))) return false;
  if (/\/rest\/v1\//i.test(url)) return true;
  if (/\/rpc\//i.test(url)) return true;
  return false;
}

// Matches the never-healthy helper used in Vitest, but at the DOM
// text-content level. Honest negations are stripped before scanning.
function hasUnsafeHealthyClaim(raw: string): boolean {
  let scrubbed = raw.toLowerCase();
  const allowed = [
    /not healthy/g,
    /never shown as healthy/g,
    /never healthy/g,
    /excluded from healthy(?: status)?/g,
    /manual reading/g,
  ];
  for (const re of allowed) scrubbed = scrubbed.replace(re, "");
  return /\bhealthy\b|\bok\b|\bnormal\b|\bverified\b|\bsuccess\b|all good|no issues detected/.test(
    scrubbed,
  );
}

test.describe("/one-tent-loop-proof — never-healthy browser regression", () => {
  test("triggers no write-capable network calls and shows no unsafe healthy wording", async ({
    page,
  }) => {
    const writeViolations: Array<{ method: string; url: string }> = [];
    const consoleErrors: string[] = [];
    const failedRequests: Array<{ url: string; failure: string | null }> = [];

    page.on("request", (req) => {
      if (isForbidden(req)) {
        writeViolations.push({ method: req.method(), url: req.url() });
      }
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), failure: req.failure()?.errorText ?? null });
    });

    await page.goto("/one-tent-loop-proof", { waitUntil: "domcontentloaded" });
    // Let any deferred fetches / redirects settle.
    await page.waitForTimeout(1500);

    // Whether we landed on the proof page or were bounced to /auth, the
    // rendered document must never contain unsafe healthy wording.
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(
      hasUnsafeHealthyClaim(bodyText),
      `Unsafe healthy wording found in rendered document:\n${bodyText.slice(0, 800)}`,
    ).toBe(false);

    // No write-capable network calls on this route.
    expect(
      writeViolations,
      `Write-capable requests observed: ${JSON.stringify(writeViolations)}`,
    ).toEqual([]);

    // No unexpected failed requests (allow benign ad-blocker / analytics).
    const seriousFailures = failedRequests.filter(
      (f) => !/analytics|beacon|posthog|sentry/i.test(f.url),
    );
    expect(seriousFailures, JSON.stringify(seriousFailures)).toEqual([]);

    // No console errors — grower-facing safety surface must load clean.
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);

    // Presenter must not render write controls. On /auth we DO expect a
    // login form, so this assertion is only meaningful when we actually
    // reached the proof surface.
    const url = new URL(page.url());
    if (url.pathname === "/one-tent-loop-proof") {
      const writeControlCount = await page
        .locator("button, form, input, select, textarea")
        .count();
      expect(
        writeControlCount,
        "Proof presenter must render zero write controls",
      ).toBe(0);

      // Exact deterministic label assertions for the safe rendered
      // states. Any step card that renders one of these statuses MUST
      // expose the matching data-status attribute and MUST NOT be
      // labelled as passed/direct. Each check is soft-guarded on
      // whether the state is present in the current app snapshot; we
      // don't fabricate telemetry from the browser, so only assert
      // when the DOM shows the state.
      const SAFE_STATES = ["stale", "invalid", "demo_only", "missing", "needs_review"] as const;
      for (const state of SAFE_STATES) {
        const cards = page.locator(`[data-testid^="loop-live-proof-step-"][data-status="${state}"]`);
        const count = await cards.count();
        for (let i = 0; i < count; i++) {
          const card = cards.nth(i);
          // Must not simultaneously advertise "passed" / "direct".
          await expect(card).toHaveAttribute("data-status", state);
          const provenance = await card.getAttribute("data-provenance");
          expect(
            provenance === "direct" && state !== "passed",
            `A ${state} step must not have provenance=direct`,
          ).toBe(false);
          const cardText = (await card.innerText()).toLowerCase();
          // Card copy must not include unsafe healthy wording.
          expect(
            hasUnsafeHealthyClaim(cardText),
            `Card for ${state} contained unsafe wording:\n${cardText.slice(0, 400)}`,
          ).toBe(false);
        }
      }

      // If a copyable text report block is present, assert the same
      // wording rules apply to its plaintext.
      const report = page.getByTestId("loop-live-proof-text-report");
      if ((await report.count()) > 0) {
        const reportText = (await report.innerText()).toLowerCase();
        expect(
          hasUnsafeHealthyClaim(reportText),
          `Text report contained unsafe wording:\n${reportText.slice(0, 800)}`,
        ).toBe(false);
      }
    } else {
      // Route-level render was blocked by auth — documented and expected.
      // Vitest fuzz + presenter tests cover the rendered-proof invariants.
      test.info().annotations.push({
        type: "note",
        description:
          "Route-level proof rendering blocked by auth; see Vitest fuzz + presenter tests for rendered-proof coverage.",
      });
    }
  });
});
