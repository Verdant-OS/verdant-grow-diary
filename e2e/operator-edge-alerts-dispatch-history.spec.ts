/**
 * operator-edge-alerts-dispatch-history — hermetic browser proof for the
 * operator dispatch history surface on /operator/edge-alerts.
 *
 * Covers:
 *  1. Drilldown contract — the breach drilldown opens from a specific webhook
 *     attempt row, renders the retry timeline newest-first regardless of the
 *     order rows arrive from PostgREST, and closes cleanly with no leftover
 *     state (reopening from a different row shows only that pair's data).
 *  2. Unmapped codes — an attempt whose outcome/metric codes are not in the
 *     client's mapping tables still renders its row and drilldown using the
 *     raw (fn, metric) dedupe-pair identifiers and request id, without ever
 *     borrowing one of the known friendly labels and without crashing.
 *  3. Loading + truly-empty states — the dispatch/attempt loading copy shows
 *     while queries are in flight; a truly empty history renders the
 *     "recorded yet" empty states (not the filtered variants) with the
 *     Refresh / Dry-run CTAs still available; a filtered-empty state renders
 *     the "match the current filters" copy with a working Clear CTA.
 *  4. Mobile — at 390px the panel stays inside the viewport, the mobile
 *     filter toggle and pagination controls keep >=44px thumb targets, and
 *     the drilldown opens and closes from a tap on an attempt row.
 *
 * SAFETY (mocked / non-destructive):
 *  - A clearly fake session is written to sessionStorage.
 *  - Every Supabase auth, REST, storage, and Edge request is intercepted via
 *    page.route(); nothing reaches a real project.
 *  - The spec asserts zero REST mutations and no Edge calls beyond the
 *    read-only edge-metrics-alert-check GET the page legitimately performs.
 */
import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { denyAnalyticsConsent } from "./utils/analyticsConsent";

const MOCKED_PROJECT = "chromium-mocked";
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const USER_ID = "99999999-9999-4999-8999-999999999999";

const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "edge-alerts-dispatch-history-e2e@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email" },
  user_metadata: { email_verified: true },
  created_at: "2026-01-01T00:00:00.000Z",
};

const CURRENT_AGREEMENTS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

const COOLDOWN_MINUTES = 60;

// Timestamps are computed relative to spec start so cooldown math
// (last_fired_at + cooldown_minutes vs now) stays deterministic.
const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

/** (fn, metric) pairs — the dedupe identity of each dispatch row. */
const PAIR_A = { fn: "ai-coach", metric: "rpc_error_count" };
const PAIR_B = { fn: "quick-log-save", metric: "rpc_error_rate" };
const PAIR_C = { fn: "sensor-ingest-webhook", metric: "startup_import_failed" };
/** Deliberately unmapped metric code — must render as the raw identifier. */
const PAIR_D = { fn: "edge-canary", metric: "queue_backlog_depth" };

/** Deliberately unmapped refusal/outcome code for PAIR_D's attempt. */
const UNMAPPED_OUTCOME = "queued_upstream_reject";
const KNOWN_METRIC_LABELS = ["RPC error count", "RPC error rate", "Startup import failed"];

const DISPATCH_ROWS = [
  {
    ...PAIR_A,
    last_fired_at: iso(5 * MIN),
    last_value: 9,
    last_threshold: 5,
    last_requests_in_window: 42,
    fire_count: 4,
    updated_at: iso(5 * MIN),
  },
  {
    ...PAIR_B,
    last_fired_at: iso(3 * 60 * MIN),
    last_value: 0.5,
    last_threshold: 0.2,
    last_requests_in_window: 80,
    fire_count: 2,
    updated_at: iso(3 * 60 * MIN),
  },
  {
    ...PAIR_C,
    last_fired_at: iso(2 * 24 * 60 * MIN),
    last_value: 1,
    last_threshold: 1,
    last_requests_in_window: 10,
    fire_count: 1,
    updated_at: iso(2 * 24 * 60 * MIN),
  },
  {
    ...PAIR_D,
    last_fired_at: iso(26 * 60 * MIN),
    last_value: 17,
    last_threshold: 10,
    last_requests_in_window: 33,
    fire_count: 1,
    updated_at: iso(26 * 60 * MIN),
  },
];

function attempt(
  id: string,
  pair: { fn: string; metric: string },
  fields: Partial<{
    attempt: number;
    outcome: string;
    status_code: number | null;
    ok: boolean;
    transient: boolean;
    error: string | null;
    attempted_at: string;
    request_id: string | null;
  }>,
) {
  return {
    id,
    dispatch_id: `disp-${pair.fn}`,
    fn: pair.fn,
    metric: pair.metric,
    attempt: 1,
    outcome: "delivered",
    status_code: 200,
    ok: true,
    transient: false,
    error: null,
    delay_before_ms: 0,
    duration_ms: 120,
    value: 9,
    threshold: 5,
    requests_in_window: 42,
    request_id: null,
    attempted_at: iso(5 * MIN),
    ...fields,
  };
}

// PAIR_A retry chain: two transient failures, then delivered. Returned
// deliberately OUT of order below so the drilldown's newest-first sort is
// what the timeline assertion proves, not the fetch order.
const ATTEMPT_A1 = attempt("att-a1", PAIR_A, {
  attempt: 1,
  outcome: "transient_failure",
  status_code: 503,
  ok: false,
  transient: true,
  error: "gateway hiccup 503",
  attempted_at: iso(5 * MIN + 10_000),
  request_id: "req_ai_coach_1",
});
const ATTEMPT_A2 = attempt("att-a2", PAIR_A, {
  attempt: 2,
  outcome: "transient_failure",
  status_code: 502,
  ok: false,
  transient: true,
  error: "gateway hiccup 502",
  attempted_at: iso(5 * MIN + 5_000),
  request_id: "req_ai_coach_2",
});
const ATTEMPT_A3 = attempt("att-a3", PAIR_A, {
  attempt: 3,
  outcome: "delivered",
  status_code: 200,
  attempted_at: iso(5 * MIN),
  request_id: "req_ai_coach_3",
});
const ATTEMPT_B1 = attempt("att-b1", PAIR_B, {
  attempt: 1,
  outcome: "permanent_failure",
  status_code: 401,
  ok: false,
  error: "webhook auth rejected",
  attempted_at: iso(3 * 60 * MIN),
  request_id: "req_quick_log_save_1",
});
const ATTEMPT_D1 = attempt("att-d1", PAIR_D, {
  attempt: 1,
  outcome: UNMAPPED_OUTCOME,
  status_code: 429,
  ok: false,
  error: "upstream queue refused the dispatch",
  attempted_at: iso(26 * 60 * MIN),
  request_id: "req_edge_canary_1",
});

// Scrambled on purpose — see the ATTEMPT_A* comment above.
const ATTEMPT_ROWS = [ATTEMPT_A2, ATTEMPT_D1, ATTEMPT_A3, ATTEMPT_B1, ATTEMPT_A1];

const LIVE_RESPONSE = {
  ok: true,
  window_minutes: 60,
  sampled_events: 120,
  thresholds: {
    windowMinutes: 60,
    rpcErrorCount: 5,
    rpcErrorRate: 0.2,
    startupFailureCount: 1,
    minRequests: 20,
    cooldownMinutes: COOLDOWN_MINUTES,
  },
  breaches: [],
  fired: [],
  suppressed: [],
  webhook: { posted: false },
  invoked_via: "operator_ui_e2e_mock",
};

type NetworkAudit = {
  restMutations: string[];
  consentWrites: number;
  functionRequests: string[];
  dispatchReads: number;
  attemptReads: number;
};

type MockOptions = {
  dispatches?: readonly unknown[];
  attempts?: readonly unknown[];
  /**
   * When set, the FIRST dispatches/attempts reads stall until this promise
   * resolves — the loading-state test releases it only after observing the
   * loading copy, so the assertion has no timing race.
   */
  firstHistoryReadGate?: Promise<void>;
};

async function seedSyntheticSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 3_600,
          expires_at: Math.floor(Date.now() / 1000) + 3_600,
          user,
        }),
      );
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

async function fulfillRows(route: Route, request: Request, rows: readonly unknown[]) {
  const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
  await route.fulfill({
    status: 200,
    contentType: wantsObject ? "application/vnd.pgrst.object+json" : "application/json",
    body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
  });
}

async function mockOperatorEdgeAlerts(
  page: Page,
  options: MockOptions = {},
): Promise<NetworkAudit> {
  const dispatches = options.dispatches ?? DISPATCH_ROWS;
  const attempts = options.attempts ?? ATTEMPT_ROWS;
  const audit: NetworkAudit = {
    restMutations: [],
    consentWrites: 0,
    functionRequests: [],
    dispatchReads: 0,
    attemptReads: 0,
  };

  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user(?:\?|$)/.test(new URL(request.url()).pathname)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_USER),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/rest\/v1\//, async (route, request) => {
    const url = new URL(request.url());
    const rpcName = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)/)?.[1] ?? "";
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/)?.[1] ?? "";

    // `has_role` is a read-only SECURITY DEFINER RPC that PostgREST
    // transports as POST; a re-consent acceptance is the one explicit grower
    // action tolerated before route entry. Everything else non-GET/HEAD is a
    // mutation the page must never perform — recorded for the audit
    // assertions, answered benignly so the render tree stays comparable.
    if (rpcName === "has_role") {
      const body = request.postDataJSON() as { _role?: string } | null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body?._role === "operator"),
      });
      return;
    }
    if (table === "user_agreement_acceptances" && request.method() === "POST") {
      audit.consentWrites += 1;
    } else if (!["GET", "HEAD"].includes(request.method())) {
      audit.restMutations.push(`${request.method()} ${url.pathname}`);
    }

    let rows: readonly unknown[] = [];
    switch (table) {
      case "edge_metrics_alert_dispatches":
        audit.dispatchReads += 1;
        if (audit.dispatchReads === 1 && options.firstHistoryReadGate) {
          await options.firstHistoryReadGate;
        }
        rows = dispatches;
        break;
      case "edge_metrics_webhook_attempts":
        audit.attemptReads += 1;
        if (audit.attemptReads === 1 && options.firstHistoryReadGate) {
          await options.firstHistoryReadGate;
        }
        rows = attempts;
        break;
      case "user_agreement_acceptances":
        rows = CURRENT_AGREEMENTS;
        break;
      default:
        rows = [];
        break;
    }

    if (request.method() === "HEAD") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
        },
      });
      return;
    }
    await fulfillRows(route, request, rows);
  });

  await page.route(/\/functions\/v1\//, async (route, request) => {
    const pathname = new URL(request.url()).pathname;
    audit.functionRequests.push(`${request.method()} ${pathname}`);
    if (pathname.endsWith("/edge-metrics-alert-check")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(LIVE_RESPONSE),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/storage\/v1\//, (route) => route.abort("blockedbyclient"));
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) =>
    route.abort("blockedbyclient"),
  );

  return audit;
}

async function acceptAgreementGateIfPresent(page: Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.getByRole("checkbox", { name: /i have read and agree/i }).check();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await expect(gate).toHaveCount(0);
}

async function openDispatchHistory(page: Page, options: MockOptions = {}): Promise<NetworkAudit> {
  await denyAnalyticsConsent(page);
  await seedSyntheticSession(page);
  const audit = await mockOperatorEdgeAlerts(page, options);
  await page.goto("/operator/edge-alerts");
  await acceptAgreementGateIfPresent(page);
  await expect(page.getByRole("heading", { name: "Edge alerts" })).toBeVisible();
  return audit;
}

/** Cooldown-state (dispatch history) table — the only table with a Fires column. */
function cooldownTable(page: Page) {
  return page.locator("table").filter({ has: page.locator("th", { hasText: "Fires" }) });
}

/**
 * Webhook attempts panel table — has both Function and Outcome columns,
 * which distinguishes it from the cooldown table (no Outcome) and from the
 * drilldown's retry table (no Function column).
 */
function attemptsTable(page: Page) {
  return page
    .locator("table")
    .filter({ has: page.locator("th", { hasText: "Function" }) })
    .filter({ has: page.locator("th", { hasText: "Outcome" }) });
}

function drilldown(page: Page) {
  return page.getByRole("dialog");
}

test.describe("Operator edge-alerts dispatch history (mocked, non-destructive)", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `dispatch history proof runs only under ${MOCKED_PROJECT}`,
    );
  });

  test.describe("drilldown from an attempt row", () => {
    test("opens from a specific attempt row, orders the retry timeline newest-first, and closes with no leftover state", async ({
      page,
    }) => {
      const audit = await openDispatchHistory(page);
      await expect(attemptsTable(page)).toBeVisible();

      const functionCallsBeforeOpen = audit.functionRequests.length;

      // A SPECIFIC attempt row: PAIR_A's attempt 2 (the 502 transient retry).
      const attemptTwoRow = attemptsTable(page)
        .getByRole("button", { name: `View breach details for ${PAIR_A.fn} ${PAIR_A.metric}` })
        .filter({ hasText: "gateway hiccup 502" });
      await expect(attemptTwoRow).toHaveCount(1);
      await attemptTwoRow.click();

      const dialog = drilldown(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(PAIR_A.fn)).toBeVisible();
      await expect(dialog.getByText("RPC error count")).toBeVisible();
      await expect(dialog.getByText("Webhook retry history (3)")).toBeVisible();
      await expect(dialog.getByText("1 delivered")).toBeVisible();
      await expect(dialog.getByText("2 transient")).toBeVisible();

      // Ordered timeline: newest attempt first, regardless of the scrambled
      // order the REST mock returned the rows in.
      await expect(dialog.locator("tbody tr")).toHaveCount(3);
      await expect(dialog.locator("tbody tr td:nth-child(2)")).toHaveText(["3", "2", "1"]);

      // The drilldown is presentation-only: opening it must not have issued
      // any new Edge calls or REST mutations.
      expect(audit.functionRequests.length).toBe(functionCallsBeforeOpen);
      expect(audit.restMutations).toEqual([]);

      // Close cleanly (accessible Close button), then reopen from a DIFFERENT
      // attempt row — only the new pair's data may appear.
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(drilldown(page)).toHaveCount(0);

      const permanentFailureRow = attemptsTable(page)
        .getByRole("button", { name: `View breach details for ${PAIR_B.fn} ${PAIR_B.metric}` })
        .filter({ hasText: "webhook auth rejected" });
      await expect(permanentFailureRow).toHaveCount(1);
      await permanentFailureRow.click();

      const reopened = drilldown(page);
      await expect(reopened).toBeVisible();
      await expect(reopened.getByText(PAIR_B.fn)).toBeVisible();
      await expect(reopened.getByText("Webhook retry history (1)")).toBeVisible();
      await expect(reopened.locator("tbody tr")).toHaveCount(1);
      await expect(reopened.getByText("1 permanent")).toBeVisible();
      await expect(reopened.getByText(PAIR_A.fn)).toHaveCount(0);

      // Second close path: Escape.
      await page.keyboard.press("Escape");
      await expect(drilldown(page)).toHaveCount(0);
    });
  });

  test.describe("unmapped refusal codes", () => {
    test("renders unmapped outcome/metric codes as raw dedupe-pair identifiers without borrowing known labels", async ({
      page,
    }) => {
      await openDispatchHistory(page);

      // The attempt row with the unmapped refusal code still renders,
      // identified by its raw (fn, metric) dedupe pair.
      const unmappedRow = attemptsTable(page).getByRole("button", {
        name: `View breach details for ${PAIR_D.fn} ${PAIR_D.metric}`,
      });
      await expect(unmappedRow).toHaveCount(1);
      await expect(unmappedRow).toContainText(PAIR_D.fn);
      await expect(unmappedRow).toContainText(PAIR_D.metric);
      // Unmapped outcome renders as its raw code text (underscores spaced),
      // never as a mapped label.
      await expect(unmappedRow).toContainText(UNMAPPED_OUTCOME.replace(/_/g, " "));
      await expect(unmappedRow).toContainText("429");
      for (const knownLabel of KNOWN_METRIC_LABELS) {
        await expect(unmappedRow).not.toContainText(knownLabel);
      }
      await expect(unmappedRow).not.toContainText("delivered");

      // The stable request identifier is still surfaced (title metadata on
      // the timestamp cell), so an operator can trace the dispatch even when
      // the code itself is unknown to this client build.
      await expect(unmappedRow.locator("td").first()).toHaveAttribute(
        "title",
        /req req_edge_canary_1/,
      );

      // The cooldown/dispatch row for the same pair also shows the raw
      // metric identifier rather than a friendly label.
      const unmappedDispatchRow = cooldownTable(page).getByRole("button", {
        name: `View breach details for ${PAIR_D.fn} ${PAIR_D.metric}`,
      });
      await expect(unmappedDispatchRow).toHaveCount(1);
      await expect(unmappedDispatchRow).toContainText(PAIR_D.metric);

      // Drilldown still works for the unmapped pair — no crash, raw
      // identifiers in the header, the unmapped outcome in the timeline.
      await unmappedRow.click();
      const dialog = drilldown(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(PAIR_D.fn)).toBeVisible();
      await expect(dialog.getByText(PAIR_D.metric)).toBeVisible();
      await expect(dialog.getByText("Webhook retry history (1)")).toBeVisible();
      await expect(dialog.getByText(UNMAPPED_OUTCOME.replace(/_/g, " "))).toBeVisible();
      for (const knownLabel of KNOWN_METRIC_LABELS) {
        await expect(dialog.getByText(knownLabel)).toHaveCount(0);
      }
      await page.keyboard.press("Escape");
      await expect(drilldown(page)).toHaveCount(0);

      // Mapped rows keep their friendly labels — the fallthrough is scoped
      // to unmapped codes only.
      const deliveredRow = attemptsTable(page)
        .getByRole("button", { name: `View breach details for ${PAIR_A.fn} ${PAIR_A.metric}` })
        .filter({ hasText: "delivered" });
      await expect(deliveredRow).toHaveCount(1);
      await expect(deliveredRow).toContainText("RPC error count");
    });
  });

  test.describe("loading and empty states", () => {
    test("shows the dispatch/attempt loading copy while history queries are in flight", async ({
      page,
    }) => {
      // Deliberately NOT using openDispatchHistory: the history reads are
      // held open by a gate this test controls, so the loading state is
      // observed deterministically rather than raced against a delay.
      let releaseHistoryReads!: () => void;
      const firstHistoryReadGate = new Promise<void>((resolve) => {
        releaseHistoryReads = resolve;
      });
      await denyAnalyticsConsent(page);
      await seedSyntheticSession(page);
      await mockOperatorEdgeAlerts(page, { firstHistoryReadGate });
      await page.goto("/operator/edge-alerts");

      await expect(page.getByText("Loading dispatch history…")).toBeVisible();
      await expect(page.getByText("Loading attempt history…")).toBeVisible();
      releaseHistoryReads();

      // Data lands after the injected delay and replaces the loading copy.
      await expect(cooldownTable(page)).toBeVisible();
      await expect(attemptsTable(page)).toBeVisible();
      await expect(page.getByText("Loading dispatch history…")).toHaveCount(0);
      await expect(page.getByText("Loading attempt history…")).toHaveCount(0);
    });

    test("renders the truly-empty states with Refresh and Dry-run CTAs when no history exists", async ({
      page,
    }) => {
      const audit = await openDispatchHistory(page, { dispatches: [], attempts: [] });

      await expect(page.getByText("No dispatches recorded yet.")).toBeVisible();
      await expect(page.getByText("No webhook attempts recorded yet.")).toBeVisible();

      // Truly-empty must NOT present as filtered-empty.
      await expect(page.getByText("No dispatch rows match the current filters.")).toHaveCount(0);
      await expect(page.getByText("No attempts match the current filters.")).toHaveCount(0);

      // CTAs stay available so the operator can act from the empty state.
      await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Dry-run evaluate" })).toBeEnabled();

      expect(audit.restMutations).toEqual([]);
    });

    test("distinguishes filtered-empty from truly-empty and recovers via the Clear CTA", async ({
      page,
    }) => {
      await openDispatchHistory(page);
      await expect(cooldownTable(page)).toBeVisible();

      await page.locator("#edge-alerts-search").fill("no-such-function");

      await expect(page.getByText("No dispatch rows match the current filters.")).toBeVisible();
      await expect(page.getByText("No attempts match the current filters.")).toBeVisible();
      await expect(page.getByText("No dispatches recorded yet.")).toHaveCount(0);
      await expect(page.getByText("No webhook attempts recorded yet.")).toHaveCount(0);

      const clearCta = page.getByRole("button", { name: "Clear" });
      await expect(clearCta).toBeVisible();
      await clearCta.click();

      await expect(page.locator("#edge-alerts-search")).toHaveValue("");
      await expect(
        cooldownTable(page).getByRole("button", {
          name: `View breach details for ${PAIR_A.fn} ${PAIR_A.metric}`,
        }),
      ).toBeVisible();
    });
  });

  test.describe("mobile viewport", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("keeps the dispatch history panel readable and thumb-friendly at 390px", async ({
      page,
    }) => {
      await openDispatchHistory(page);
      await expect(cooldownTable(page)).toBeVisible();

      // The page never overflows horizontally; wide tables scroll inside
      // their own containers instead.
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      // Mobile filter affordances: dedicated search input + a >=44px toggle.
      await expect(page.locator("#edge-alerts-search-mobile")).toBeVisible();
      const filterToggle = page.getByRole("button", { name: "Show filters" });
      await expect(filterToggle).toBeVisible();
      const toggleBox = await filterToggle.boundingBox();
      expect(toggleBox, "filter toggle must be tappable").not.toBeNull();
      expect(toggleBox!.width).toBeGreaterThanOrEqual(44);
      expect(toggleBox!.height).toBeGreaterThanOrEqual(44);

      await filterToggle.tap();
      await expect(page.getByRole("button", { name: "Hide filters" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      // Pagination controls keep >=44px thumb targets on mobile.
      const nextButton = page.getByRole("button", { name: "Next" }).first();
      await nextButton.scrollIntoViewIfNeeded();
      const nextBox = await nextButton.boundingBox();
      expect(nextBox, "pagination Next must be tappable").not.toBeNull();
      expect(nextBox!.height).toBeGreaterThanOrEqual(44);
      const firstPageButton = page.getByRole("button", { name: "First page" }).first();
      const firstPageBox = await firstPageButton.boundingBox();
      expect(firstPageBox, "pagination First page must be tappable").not.toBeNull();
      expect(firstPageBox!.width).toBeGreaterThanOrEqual(44);
      expect(firstPageBox!.height).toBeGreaterThanOrEqual(44);
    });

    test("opens and closes the drilldown from an attempt-row tap on mobile", async ({ page }) => {
      await openDispatchHistory(page);
      await expect(attemptsTable(page)).toBeVisible();

      const attemptRow = attemptsTable(page)
        .getByRole("button", { name: `View breach details for ${PAIR_A.fn} ${PAIR_A.metric}` })
        .filter({ hasText: "gateway hiccup 502" });
      await attemptRow.scrollIntoViewIfNeeded();
      await attemptRow.tap();

      const dialog = drilldown(page);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Webhook retry history (3)")).toBeVisible();

      // The drawer content stays inside the mobile viewport width.
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox, "drilldown must lay out on mobile").not.toBeNull();
      expect(dialogBox!.width).toBeLessThanOrEqual(390);

      await dialog.getByRole("button", { name: "Close" }).tap();
      await expect(drilldown(page)).toHaveCount(0);

      // No leftover overlay state: the page underneath is interactive again.
      await attemptRow.scrollIntoViewIfNeeded();
      await attemptRow.tap();
      await expect(drilldown(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drilldown(page)).toHaveCount(0);
    });
  });
});
