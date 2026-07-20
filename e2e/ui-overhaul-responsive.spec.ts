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
const LONG_PLANT_NAME = "Responsive Proof Plant With A Deliberately Long Cultivar Selection Name";

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
  name: LONG_PLANT_NAME,
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
  source: "ai_doctor",
  action_type: "observation_followup",
  target_metric: null,
  target_device: null,
  suggested_change: "Recheck canopy conditions before making any adjustment",
  reason: `[session:${SESSION_ID}] Mocked AI Doctor follow-up with no sensor snapshot.`,
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

const REDESIGNED_PRODUCTION_PAGES = {
  actionDetail: "src/pages/ActionDetail.tsx",
  actionQueue: "src/pages/ActionQueue.tsx",
  aiDoctorConfidenceAudit: "src/pages/AiDoctorConfidenceAudit.tsx",
  aiDoctorSessionDetail: "src/pages/AiDoctorSessionDetail.tsx",
  aiDoctorSessionsIndex: "src/pages/AiDoctorSessionsIndex.tsx",
  breedingProgramDetail: "src/pages/BreedingProgramDetail.tsx",
  breedingProgramNew: "src/pages/BreedingProgramNew.tsx",
  breedingProgramsIndex: "src/pages/BreedingProgramsIndex.tsx",
  ecowittIngestAudit: "src/pages/EcowittIngestAudit.tsx",
  ecowittLiveBringup: "src/pages/EcowittLiveBringup.tsx",
  growDetail: "src/pages/GrowDetail.tsx",
  growerInvite: "src/pages/GrowerInvite.tsx",
  grows: "src/pages/Grows.tsx",
  healthCheck: "src/pages/HealthCheck.tsx",
  operatorAiDoctorPhase1: "src/pages/OperatorAiDoctorPhase1.tsx",
  operatorBillingEntitlementResolutionAudit:
    "src/pages/OperatorBillingEntitlementResolutionAudit.tsx",
  operatorBillingSubscriptionUpdateAudit:
    "src/pages/OperatorBillingSubscriptionUpdateAudit.tsx",
  operatorEcowittTentPreview: "src/pages/OperatorEcowittTentPreview.tsx",
  operatorPaddleProcessingAudit: "src/pages/OperatorPaddleProcessingAudit.tsx",
  operatorSubscriberGrowth: "src/pages/OperatorSubscriberGrowth.tsx",
  phenoHuntNew: "src/pages/PhenoHuntNew.tsx",
  phenoHuntsIndex: "src/pages/PhenoHuntsIndex.tsx",
  phenoHuntWorkspace: "src/pages/PhenoHuntWorkspace.tsx",
  phenoKeepers: "src/pages/PhenoKeepersPage.tsx",
  timeline: "src/pages/Timeline.tsx",
} as const;

type BrowserRoute = {
  sourcePage: string;
  path: string;
  heading: string;
  criticalOperatingLoop?: boolean;
  mainSelector?: string;
  allowedHorizontalScrollTestIds?: readonly string[];
  mobileTouchTargetSelectors?: readonly string[];
};

const BROWSER_ROUTES: readonly BrowserRoute[] = [
  {
    sourcePage: "src/pages/Dashboard.tsx",
    path: "/dashboard",
    heading: "Dashboard",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: "src/pages/DailyCheck.tsx",
    path: `/daily-check?plantId=${PLANT_ID}&growId=${GROW_ID}`,
    heading: "Quick Log",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: "src/pages/PlantDetail.tsx",
    path: `/plants/${PLANT_ID}`,
    heading: LONG_PLANT_NAME,
    criticalOperatingLoop: true,
  },
  {
    sourcePage: "src/pages/QuickLogStarter.tsx",
    path: "/quick-log",
    heading: "Log your first grow note in 30 seconds",
    criticalOperatingLoop: true,
    mainSelector: 'main[data-testid="public-quick-log-starter"]',
  },
  {
    sourcePage: "src/pages/Tents.tsx",
    path: "/tents",
    heading: "Tents",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: "src/pages/TentDetail.tsx",
    path: `/tents/${TENT_ID}`,
    heading: "Responsive Proof Tent",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.grows,
    path: "/grows",
    heading: "My Grows",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.growDetail,
    path: `/grows/${GROW_ID}`,
    heading: "Responsive Proof Grow",
    criticalOperatingLoop: true,
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.timeline,
    path: `/timeline?growId=${GROW_ID}`,
    heading: "Responsive Proof Grow",
    criticalOperatingLoop: true,
    allowedHorizontalScrollTestIds: ["timeline-stage-progression-scroll"],
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.actionQueue,
    path: "/actions",
    heading: "Action Queue",
    criticalOperatingLoop: true,
    mobileTouchTargetSelectors: [
      '[aria-label="Status filter"]',
      '[aria-label="Risk filter"]',
      '[aria-label="Source filter"]',
      '[aria-label="Trace filter"]',
      '[aria-label="Sort order"]',
      '[aria-label="Search actions"]',
      '[aria-label="Page size"]',
      '[aria-label="Previous page"]',
      '[aria-label="Next page"]',
    ],
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.actionDetail,
    path: `/actions/${ACTION_ID}`,
    heading: "Recheck canopy conditions before making any adjustment",
    criticalOperatingLoop: true,
    mobileTouchTargetSelectors: ['[data-testid="action-detail-evidence-review-link"]'],
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.aiDoctorSessionsIndex,
    path: "/doctor/sessions",
    heading: "AI Doctor Sessions",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.aiDoctorSessionDetail,
    path: `/doctor/sessions/${SESSION_ID}`,
    heading: "Historical AI Doctor Session",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.phenoHuntsIndex,
    path: "/pheno-hunts",
    heading: "Pheno Hunts",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.phenoHuntNew,
    path: `/pheno-hunts/new?growId=${GROW_ID}`,
    heading: "Start Pheno Hunt",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.breedingProgramsIndex,
    path: "/breeding",
    heading: "Breeding programs",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.breedingProgramNew,
    path: "/breeding/new",
    heading: "New breeding program",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.growerInvite,
    path: "/invite",
    heading: "Invite a grower",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.healthCheck,
    path: "/health",
    heading: "Health check",
  },
];

const DOCUMENTED_EXCLUDED_ROUTES = [
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.aiDoctorConfidenceAudit,
    routePattern: "/internal/ai-doctor-confidence-audit",
    reason: "Operator-only route; the authenticated browser fixture intentionally has no operator role.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.breedingProgramDetail,
    routePattern: "/breeding/:programId",
    reason: "Dynamic detail requires a breeding-program record that is absent from the read-only fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.ecowittIngestAudit,
    routePattern: "/sensors/ecowitt-audit",
    reason: "Operator-only sensor audit; the fixture must not self-grant operator access.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.ecowittLiveBringup,
    routePattern: "/operator/ecowitt-live-bringup",
    reason: "Operator-only live bring-up surface is intentionally inaccessible to the standard fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorAiDoctorPhase1,
    routePattern: "/operator/ai-doctor-phase1",
    reason: "Operator-only AI audit; browser proof remains read-only and non-operator.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorBillingEntitlementResolutionAudit,
    routePattern: "/operator/billing-entitlement-resolution",
    reason: "Operator-only billing audit is outside the standard authenticated fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorBillingSubscriptionUpdateAudit,
    routePattern: "/operator/billing-subscription-updates",
    reason: "Operator-only billing audit is outside the standard authenticated fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorEcowittTentPreview,
    routePattern: "/operator/ecowitt-tent-preview",
    reason: "Operator-only sensor preview is intentionally inaccessible to the standard fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorPaddleProcessingAudit,
    routePattern: "/operator/paddle-processing-audit",
    reason: "Operator-only billing processing audit is outside the standard authenticated fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.operatorSubscriberGrowth,
    routePattern: "/operator/subscriber-growth",
    reason: "Operator-only growth audit is outside the standard authenticated fixture.",
    staticProof: "ui-overhaul-route-contract: AppShell landmark coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.phenoHuntWorkspace,
    routePattern: "/pheno-hunts/:id/workspace",
    reason: "Dynamic workspace requires a pheno-hunt record that is absent from the read-only fixture.",
    staticProof: "ui-overhaul-route-contract: named-section coverage",
  },
  {
    sourcePage: REDESIGNED_PRODUCTION_PAGES.phenoKeepers,
    routePattern: "/pheno-hunts/:id/keepers",
    reason: "Dynamic keepers view requires a pheno-hunt record that is absent from the read-only fixture.",
    staticProof: "ui-overhaul-route-contract: named-section coverage",
  },
] as const;

const CRITICAL_OPERATING_LOOP_ROUTES = BROWSER_ROUTES.filter(
  (route) => route.criticalOperatingLoop,
);

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

async function assertViewportFit(page: Page, route: Pick<BrowserRoute, "path" | "mainSelector" | "allowedHorizontalScrollTestIds">) {
  const mainSelector = route.mainSelector ?? "main#main-content";
  const snapshot = await page.evaluate(
    ({ selector, allowedHorizontalScrollTestIds }) => {
      const main = document.querySelector<HTMLElement>(selector);
      if (!main) return null;

      const viewportWidth = document.documentElement.clientWidth;
      const mainBounds = main.getBoundingClientRect();
      const visibleBoundsViolations = Array.from(
        main.querySelectorAll<HTMLElement>(
          [
            "h1",
            "h2",
            "h3",
            "h4",
            "button",
            "a[href]",
            "input",
            "select",
            "textarea",
            "img",
            "video",
            "table",
            '[role="button"]',
            '[role="link"]',
            '[role="heading"]',
            '[role="tab"]',
            '[role="combobox"]',
          ].join(","),
        ),
      ).flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const isHidden =
          bounds.width === 0 ||
          bounds.height === 0 ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          element.closest('[hidden], [aria-hidden="true"]') !== null;
        const isInsideAllowedScroller = allowedHorizontalScrollTestIds.some((testId) => {
          const scroller = element.closest<HTMLElement>(`[data-testid="${testId}"]`);
          return scroller !== null && scroller !== element;
        });

        if (isHidden || isInsideAllowedScroller) return [];
        if (bounds.left >= -0.5 && bounds.right <= viewportWidth + 0.5) return [];

        return [
          {
            tag: element.tagName.toLowerCase(),
            testId: element.dataset.testid ?? null,
            ariaLabel: element.getAttribute("aria-label"),
            left: bounds.left,
            right: bounds.right,
          },
        ];
      });
      const layoutBoundsViolations = Array.from(
        main.querySelectorAll<HTMLElement>("div, section, article, header, footer, ul, ol, li, form"),
      ).flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const isHidden =
          bounds.width === 0 ||
          bounds.height === 0 ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          element.closest('[hidden], [aria-hidden="true"]') !== null;
        const isInsideAllowedScroller = allowedHorizontalScrollTestIds.some((testId) => {
          const scroller = element.closest<HTMLElement>(`[data-testid="${testId}"]`);
          return scroller !== null && scroller !== element;
        });
        if (isHidden || isInsideAllowedScroller) return [];
        if (bounds.left >= -0.5 && bounds.right <= viewportWidth + 0.5) return [];
        return [
          {
            tag: element.tagName.toLowerCase(),
            testId: element.dataset.testid ?? null,
            className: element.className,
            text: element.textContent?.trim().slice(0, 80) ?? "",
            left: bounds.left,
            right: bounds.right,
          },
        ];
      });
      const intrinsicWidthViolations = Array.from(main.querySelectorAll<HTMLElement>("*")).flatMap(
        (element) => {
          const style = getComputedStyle(element);
          const allowedScroller = allowedHorizontalScrollTestIds.some((testId) =>
            element.closest(`[data-testid="${testId}"]`),
          );
          const concealedOverflow = element.scrollWidth - element.clientWidth;
          if (
            allowedScroller ||
            concealedOverflow <= 1 ||
            ["auto", "scroll", "hidden", "clip"].includes(style.overflowX)
          ) {
            return [];
          }
          const bounds = element.getBoundingClientRect();
          return [
            {
              tag: element.tagName.toLowerCase(),
              testId: (element as HTMLElement).dataset?.testid ?? null,
              className: typeof element.className === "string" ? element.className : null,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              left: bounds.left,
              right: bounds.right,
            },
          ];
        },
      );

      return {
        viewportWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        mainClientWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        mainLeft: mainBounds.left,
        mainRight: mainBounds.right,
        visibleBoundsViolations,
        layoutBoundsViolations,
        intrinsicWidthViolations,
      };
    },
    {
      selector: mainSelector,
      allowedHorizontalScrollTestIds: [...(route.allowedHorizontalScrollTestIds ?? [])],
    },
  );

  expect(snapshot, `${route.path} must render ${mainSelector}`).not.toBeNull();
  if (!snapshot) return;

  expect(
    snapshot.documentScrollWidth - snapshot.documentClientWidth,
    `${route.path} must not create document-level horizontal overflow; main=${snapshot.mainScrollWidth}/${snapshot.mainClientWidth}; visible offenders: ${JSON.stringify(snapshot.visibleBoundsViolations)}; layout offenders: ${JSON.stringify(snapshot.layoutBoundsViolations)}; intrinsic offenders: ${JSON.stringify(snapshot.intrinsicWidthViolations)}`,
  ).toBe(0);
  expect(
    snapshot.mainScrollWidth - snapshot.mainClientWidth,
    `${route.path} main content must not have concealed horizontal overflow`,
  ).toBe(0);
  expect(snapshot.mainLeft, `${route.path} main content must stay inside the left edge`).toBeGreaterThanOrEqual(
    -0.5,
  );
  expect(snapshot.mainRight, `${route.path} main content must stay inside the right edge`).toBeLessThanOrEqual(
    snapshot.viewportWidth + 0.5,
  );
  expect(
    snapshot.visibleBoundsViolations,
    `${route.path} visible content and controls must stay inside the viewport`,
  ).toEqual([]);
}

async function assertRouteFitsViewport(page: Page, route: BrowserRoute) {
  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

  const mainSelector = route.mainSelector ?? "main#main-content";
  await expect(page.locator(mainSelector)).toHaveCount(1);
  if (mainSelector === "main#main-content") {
    await expect(page.locator("main main")).toHaveCount(0);
  }

  await assertViewportFit(page, route);

  const viewport = page.viewportSize();
  if (viewport && viewport.width < 640) {
    for (const selector of route.mobileTouchTargetSelectors ?? []) {
      const control = page.locator(selector).first();
      await expect(control, `${route.path} must render ${selector}`).toBeVisible();
      const bounds = await control.boundingBox();
      expect(bounds, `${route.path} ${selector} must have a box`).not.toBeNull();
      expect(
        bounds!.height,
        `${route.path} ${selector} must be at least 44px on mobile`,
      ).toBeGreaterThanOrEqual(44);
    }
  }
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

  test("accounts for every redesigned production page in browser or documented exclusions", () => {
    const redesignedPages = Object.values(REDESIGNED_PRODUCTION_PAGES).sort();
    const redesignedPageSet = new Set(redesignedPages);
    const accountedPages = [
      ...BROWSER_ROUTES.map((route) => route.sourcePage),
      ...DOCUMENTED_EXCLUDED_ROUTES.map((route) => route.sourcePage),
    ].filter((sourcePage) => redesignedPageSet.has(sourcePage as (typeof redesignedPages)[number]));

    expect([...accountedPages].sort()).toEqual(redesignedPages);
    expect(new Set(accountedPages).size, "redesigned pages must not be double-counted").toBe(
      accountedPages.length,
    );
    for (const exclusion of DOCUMENTED_EXCLUDED_ROUTES) {
      expect(exclusion.routePattern).toBeTruthy();
      expect(exclusion.reason.length).toBeGreaterThan(24);
      expect(exclusion.staticProof).toBeTruthy();
    }
  });

  test("rejects a clipped oversized descendant that document scrollWidth alone misses", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.setContent(`
      <style>html, body { margin: 0; width: 100%; } </style>
      <div id="clipped-oversized-proof" style="width: 100vw; overflow-x: clip;">
        <main id="main-content" style="width: 100%;">
          <button style="width: 640px; max-width: none;">Oversized control</button>
        </main>
      </div>
    `);

    const documentWidths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(documentWidths.scroll).toBe(documentWidths.client);
    await expect(
      assertViewportFit(page, { path: "clipped-oversized-proof" }),
    ).rejects.toThrow(/main content must not have concealed horizontal overflow/i);
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

      for (const route of BROWSER_ROUTES) {
        await assertRouteFitsViewport(page, route);
      }

      expect(pageErrors, "redesigned routes must not throw browser errors").toEqual([]);
    });
  }

  for (const width of [360, 390, 768] as const) {
    test(`keeps the critical operating loop inside ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      for (const route of CRITICAL_OPERATING_LOOP_ROUTES) {
        await assertRouteFitsViewport(page, route);
      }

      expect(pageErrors, "critical operating-loop routes must not throw browser errors").toEqual(
        [],
      );
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
      await expect(page.getByRole("heading", { level: 1, name: LONG_PLANT_NAME })).toBeVisible();

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
      await assertViewportFit(page, {
        path: `/plants/${PLANT_ID} (expanded disclosures at ${width}px)`,
        allowedHorizontalScrollTestIds: [
          "timeline-stage-progression-scroll",
          "relative-timeline-filters",
        ],
      });
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

  test("keeps Daily Check target-first, touch-safe, and overflow-free", async ({ page }) => {
    test.setTimeout(120_000);
    const unexpectedMutations: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const isRestMutation =
        /\/rest\/v1\//i.test(url) &&
        !/\/rest\/v1\/rpc\/has_role(?:\?|$)/i.test(url) &&
        !["GET", "HEAD"].includes(request.method());
      if (isRestMutation || /\/functions\/v1\//i.test(url)) {
        unexpectedMutations.push(`${request.method()} ${url}`);
      }
    });

    for (const width of [320, 375, 390, 768, 1440] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(`/daily-check?plantId=${PLANT_ID}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { level: 1, name: "Quick Log" })).toBeVisible();

      const selector = page.getByTestId("daily-grow-check-target-selector");
      const activities = page.getByTestId("daily-check-all-activities");
      const choose = page.getByTestId("daily-grow-check-choose");
      const guided = page.getByTestId("daily-grow-check-guided-heading");
      await expect(selector).toBeVisible();
      await expect(page.getByTestId("daily-grow-check-plant-select")).toContainText(
        LONG_PLANT_NAME,
      );

      const order = await page.evaluate(() => {
        const ids = [
          "daily-grow-check-target-selector",
          "daily-check-all-activities",
          "daily-grow-check-choose",
          "daily-grow-check-guided-heading",
        ];
        const elements = ids.map((id) =>
          document.querySelector<HTMLElement>(`[data-testid="${id}"]`),
        );
        return elements.every(Boolean)
          ? elements
              .slice(0, -1)
              .every((element, index) =>
                Boolean(
                  element!.compareDocumentPosition(elements[index + 1]!) &
                  Node.DOCUMENT_POSITION_FOLLOWING,
                ),
              )
          : false;
      });
      expect(order, `${width}px Daily Check must keep the target-first order`).toBe(true);
      await expect(activities).toBeVisible();
      await expect(choose).toBeVisible();
      await expect(guided).toBeVisible();

      for (const testId of [
        "daily-grow-check-plant-select",
        "daily-grow-check-tent-select",
        "daily-grow-check-choose-quicklog",
        "daily-grow-check-choose-snapshot",
        "daily-grow-check-start",
      ]) {
        const control = page.getByTestId(testId);
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box, `${width}px ${testId} must have a box`).not.toBeNull();
        expect(box!.height, `${width}px ${testId} must be at least 44px`).toBeGreaterThanOrEqual(
          44,
        );
      }

      const layout = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        layout.scrollWidth - layout.clientWidth,
        `${width}px Daily Check must not create document-level horizontal overflow`,
      ).toBe(0);
    }

    expect(unexpectedMutations, "responsive proof must remain read-only").toEqual([]);
  });
});
