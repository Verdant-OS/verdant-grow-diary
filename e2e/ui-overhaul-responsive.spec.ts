// Browser regression proof for the Verdant UI-overhaul route family.
//
// SAFETY:
// - Uses a clearly fake authenticated session.
// - Intercepts every Supabase auth, REST, storage, and edge-function request.
// - Makes no real writes, AI calls, sensor-ingest calls, Action Queue changes,
//   or device-control requests.
import { expect, test, type Page } from "@playwright/test";

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";
const USER_ID = "ui-overhaul-browser-user";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const ACTION_ID = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";

const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "ui-overhaul@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  identities: [],
  user_metadata: { email_verified: true },
};

const GROW = {
  id: GROW_ID,
  user_id: USER_ID,
  name: "Responsive Proof Grow",
  grow_type: "tent",
  stage: "veg",
  notes: "Mocked browser fixture — not live cultivation data.",
  started_at: "2026-07-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
  is_archived: false,
};

const TENT = {
  id: TENT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  name: "Responsive Proof Tent",
  brand: null,
  size: "4x4",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 480,
  is_archived: false,
  created_at: "2026-07-01T00:00:00.000Z",
};

const PLANT = {
  id: PLANT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  name: "Responsive Proof Plant",
  strain: "Browser fixture",
  stage: "flower",
  started_at: "2026-07-01T00:00:00.000Z",
  health: "healthy",
  photo_url: null,
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
};

const PLANT_PHOTO_ENTRY = {
  id: "66666666-6666-4666-8666-666666666666",
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  entry_type: "photo",
  entry_at: "2026-07-18T13:00:00.000Z",
  notes: "Mocked visual observation for responsive disclosure proof.",
  photo_url: "/placeholder.svg",
  details: { event_type: "photo" },
  created_at: "2026-07-18T13:00:00.000Z",
};

const ACTION = {
  id: ACTION_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: PLANT_ID,
  source: "manual",
  action_type: "observation_followup",
  target_metric: null,
  target_device: null,
  suggested_change: "Recheck canopy conditions before making any adjustment",
  reason: "Mocked grower-authored follow-up for responsive UI proof.",
  risk_level: "low",
  status: "pending",
  approved_at: null,
  rejected_at: null,
  completed_at: null,
  originating_timeline_events: [],
  created_at: "2026-07-18T12:00:00.000Z",
  updated_at: "2026-07-18T12:00:00.000Z",
};

const AI_SESSION = {
  id: SESSION_ID,
  created_at: "2026-07-18T12:00:00.000Z",
  plant_id: PLANT_ID,
  tent_id: TENT_ID,
  grow_id: GROW_ID,
  question: "What should I verify next?",
  diagnosis: {
    summary: "Verify environmental context before changing the crop plan.",
    likelyIssue: "Not enough evidence for a diagnosis",
    confidence: "low",
    evidence: ["Grower observation only"],
    missingInformation: ["Calibrated canopy temperature", "Verified relative humidity"],
    possibleCauses: ["Normal short-term variation"],
    immediateAction: "Collect another calibrated observation.",
    whatNotToDo: "Do not change irrigation or nutrients from this single observation.",
    followUp24h: "Compare a second observation at the same point in the light cycle.",
    recoveryPlan3d: "Keep conditions stable while gathering evidence.",
    riskLevel: "low",
    actionQueueSuggestion: null,
  },
  raw_confidence: 0.35,
  displayed_confidence: 0.35,
  context_confidence_ceiling: "low",
  suggested_actions: [],
};

const AGREEMENT_ACCEPTANCES = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

const RESPONSIVE_ROUTES = [
  { path: "/dashboard", heading: "Dashboard" },
  { path: "/grows", heading: "My Grows" },
  { path: `/grows/${GROW_ID}`, heading: "Responsive Proof Grow" },
  { path: "/timeline", heading: "Responsive Proof Grow" },
  { path: "/actions", heading: "Action Queue" },
  {
    path: `/actions/${ACTION_ID}`,
    heading: "Recheck canopy conditions before making any adjustment",
  },
  { path: "/doctor/sessions", heading: "AI Doctor Sessions" },
  { path: `/doctor/sessions/${SESSION_ID}`, heading: "Historical AI Doctor Session" },
  { path: "/pheno-hunts", heading: "Pheno Hunts" },
  { path: `/pheno-hunts/new?growId=${GROW_ID}`, heading: "Start Pheno Hunt" },
  { path: "/breeding", heading: "Breeding programs" },
  { path: "/breeding/new", heading: "New breeding program" },
] as const;

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 21_600,
          expires_at: Math.floor(Date.now() / 1000) + 21_600,
          user,
        }),
      );
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

function rowsForTable(table: string): unknown[] {
  switch (table) {
    case "grows":
      return [GROW];
    case "tents":
      return [TENT];
    case "plants":
      return [PLANT];
    case "diary_entries":
      return [PLANT_PHOTO_ENTRY];
    case "action_queue":
      return [ACTION];
    case "ai_doctor_sessions":
      return [AI_SESSION];
    case "user_agreement_acceptances":
      return AGREEMENT_ACCEPTANCES;
    case "subscriptions":
      // Return one valid Founder fixture for each possible client environment.
      // The app's pure adapter rejects the row from the non-matching lane.
      return ["live", "sandbox"].map((environment) => ({
        user_id: USER_ID,
        paddle_subscription_id: `lifetime_ui_proof_${environment}`,
        paddle_customer_id: `customer_ui_proof_${environment}`,
        product_id: "founder_lifetime",
        price_id: "founder_lifetime",
        status: "active",
        current_period_start: "2026-07-01T00:00:00.000Z",
        current_period_end: null,
        cancel_at_period_end: false,
        environment,
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      }));
    default:
      return [];
  }
}

async function mockSignedInSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user(?:\?|$)/i.test(request.url())) {
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
    const table = url.pathname.match(/\/rest\/v1\/([^/]+)/i)?.[1] ?? "";
    const rows = rowsForTable(table);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
      "Preference-Applied": "count=exact",
    };

    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers });
      return;
    }

    // No UI action in this proof performs a mutation. Block if that invariant
    // regresses instead of silently pretending the write succeeded.
    if (request.method() !== "GET") {
      await route.abort("blockedbyclient");
      return;
    }

    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(rows),
    });
  });

  await page.route(/\/storage\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/google-analytics\.com|googletagmanager\.com|doubleclick\.net/, (route) =>
    route.abort("blockedbyclient"),
  );
}

async function assertRouteFitsViewport(page: Page, route: (typeof RESPONSIVE_ROUTES)[number]) {
  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await expect(page.locator("main main")).toHaveCount(0);

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    layout.scrollWidth - layout.clientWidth,
    `${route.path} must not create document-level horizontal overflow`,
  ).toBe(0);
}

test.describe("Verdant UI-overhaul responsive routes", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `UI-overhaul proof runs once, under the ${MOCKED_PROJECT} project`,
    );
    await seedFakeSession(page);
    await mockSignedInSupabase(page);
  });

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1440, height: 900 },
  ] as const) {
    test(`keeps every redesigned route inside ${viewport.width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      for (const route of RESPONSIVE_ROUTES) {
        await assertRouteFitsViewport(page, route);
      }

      expect(pageErrors, "redesigned routes must not throw browser errors").toEqual([]);
    });
  }

  for (const width of [360, 390, 768] as const) {
    test(`keeps the multi-action shared header inside ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      await assertRouteFitsViewport(page, { path: "/dashboard", heading: "Dashboard" });
    });
  }

  test("keeps Plant Detail disclosures compact, reachable, and overflow-free", async ({ page }) => {
    test.setTimeout(120_000);
    const closedContentSideEffects: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const isRestMutation =
        /\/rest\/v1\//i.test(url) &&
        !/\/rest\/v1\/rpc\/has_role(?:\?|$)/i.test(url) &&
        !["GET", "HEAD"].includes(request.method());
      const isAiOrEdgeInvocation =
        /\/functions\/v1\/|openai|anthropic|generativelanguage|api\.gemini/i.test(url);
      if (isRestMutation || isAiOrEdgeInvocation) {
        closedContentSideEffects.push(`${request.method()} ${url}`);
      }
    });

    for (const width of [320, 375, 390, 768, 1440] as const) {
      await page.setViewportSize({
        width,
        height: width < 768 ? 844 : 900,
      });
      await page.goto(`/plants/${PLANT_ID}`, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { level: 1, name: "Responsive Proof Plant" }),
      ).toBeVisible();

      const triggers = ["history", "harvest", "ai"].map((group) =>
        page.getByTestId(`plant-detail-disclosure-${group}-trigger`),
      );
      const contents = ["history", "harvest", "ai"].map((group) =>
        page.getByTestId(`plant-detail-disclosure-${group}-content`),
      );

      for (const trigger of triggers) {
        await expect(trigger).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        const box = await trigger.boundingBox();
        expect(box, `${width}px disclosure trigger must have a box`).not.toBeNull();
        expect(
          box!.height,
          `${width}px disclosure trigger must be at least 44px`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box!.x,
          `${width}px disclosure trigger must stay inside the left edge`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          box!.x + box!.width,
          `${width}px disclosure trigger must stay inside the right edge`,
        ).toBeLessThanOrEqual(width);
      }

      for (const content of contents) {
        await expect(content).toHaveAttribute("hidden", "");
        expect(await content.evaluate((element) => element.offsetHeight)).toBe(0);
      }

      const closedLayout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      expect(closedLayout.scrollWidth - closedLayout.clientWidth).toBe(0);

      await triggers[1].click();
      await expect(contents[1]).toBeVisible();
      const relatedActivity = page.getByTestId("evidence-tile-supporting-records-link");
      await expect(relatedActivity).toBeVisible();
      await relatedActivity.click();
      await expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#plant-recent-activity")).toBeVisible();

      await triggers[2].click();
      await expect(contents[2]).toBeVisible();

      const expandedLayout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        duplicateIds: Array.from(document.querySelectorAll<HTMLElement>("[id]"))
          .map((element) => element.id)
          .filter((id, index, ids) => id && ids.indexOf(id) !== index),
      }));
      expect(expandedLayout.scrollWidth - expandedLayout.clientWidth).toBe(0);
      expect(expandedLayout.duplicateIds).toEqual([]);
      expect(
        closedLayout.scrollHeight,
        `${width}px closed page should be at least 25% shorter than all-expanded`,
      ).toBeLessThanOrEqual(expandedLayout.scrollHeight * 0.75);

      const desktopFab = page.locator('button.fixed[aria-label="Quick Log"]');
      if (width < 768) {
        await expect(desktopFab).toBeHidden();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const bottomClearance = await page.evaluate(() => {
          const content = document.querySelector<HTMLElement>(
            '[data-testid="plant-detail-disclosure-ai-content"]',
          );
          const nav = document.querySelector<HTMLElement>('nav[aria-label="Primary navigation"]');
          if (!content || !nav) return null;
          return nav.getBoundingClientRect().top - content.getBoundingClientRect().bottom;
        });
        expect(bottomClearance).not.toBeNull();
        expect(bottomClearance!).toBeGreaterThanOrEqual(0);
      } else {
        await expect(desktopFab).toBeVisible();
      }
      expect(
        closedContentSideEffects,
        "force-mounted disclosure content must not invoke AI, edge functions, or writes",
      ).toEqual([]);
    }
  });
});
