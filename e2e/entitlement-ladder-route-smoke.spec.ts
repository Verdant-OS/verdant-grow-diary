/**
 * entitlement-ladder-route-smoke — hermetic browser proof for the highest
 * value paid-route entry gate across every sellable Verdant plan.
 *
 * This is deliberately a MOCKED browser contract, not an authenticated
 * production proof:
 *   - A synthetic session is written to sessionStorage.
 *   - Every Supabase auth, REST, storage, and Edge request is intercepted.
 *   - No real billing row, plant data, checkout, or write can leave the page.
 *
 * It proves the client presentation path only. The database/Edge entitlement
 * tests remain the authoritative server-side fence.
 *
 * Matrix under proof:
 *   Free                    -> Pheno Tracker upgrade gate, no wizard-scoped reads
 *   Pro monthly / annual    -> guided Pheno Hunt onboarding
 *   Craft monthly / annual  -> guided Pheno Hunt onboarding
 *   Founder Lifetime        -> guided Pheno Hunt onboarding
 */
import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { denyAnalyticsConsent } from "./utils/analyticsConsent";

const MOCKED_PROJECT = "chromium-mocked";
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const GROW_ID = "22222222-2222-4222-8222-222222222222";
const TENT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_USER = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "entitlement-ladder-e2e@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

const GROW = {
  id: GROW_ID,
  user_id: USER_ID,
  name: "Entitlement ladder fixture grow",
  status: "active",
};

const TENT = {
  id: TENT_ID,
  user_id: USER_ID,
  grow_id: GROW_ID,
  name: "Entitlement ladder fixture tent",
};

const PLANTS = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    user_id: USER_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    name: "Fixture Candidate A",
    strain: "Fixture cultivar",
    is_archived: false,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    user_id: USER_ID,
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    name: "Fixture Candidate B",
    strain: "Fixture cultivar",
    is_archived: false,
  },
];

const CURRENT_AGREEMENTS = [
  { agreement_type: "terms", version: "2026-07-13" },
  { agreement_type: "privacy", version: "2026-07-13" },
];

type PaidPlanId =
  "pro_monthly" | "pro_annual" | "craft_monthly" | "craft_annual" | "founder_lifetime";

type TierLane = {
  planId: "free" | PaidPlanId;
  label: string;
  expectedAccess: "gate" | "onboarding";
};

const TIER_LANES: readonly TierLane[] = [
  { planId: "free", label: "Free", expectedAccess: "gate" },
  { planId: "pro_monthly", label: "Pro monthly", expectedAccess: "onboarding" },
  { planId: "pro_annual", label: "Pro annual", expectedAccess: "onboarding" },
  { planId: "craft_monthly", label: "Craft monthly", expectedAccess: "onboarding" },
  { planId: "craft_annual", label: "Craft annual", expectedAccess: "onboarding" },
  { planId: "founder_lifetime", label: "Founder Lifetime", expectedAccess: "onboarding" },
];

type NetworkAudit = {
  subscriptionReads: number;
  wizardGrowReads: number;
  wizardTentReads: number;
  wizardPlantReads: number;
  consentWrites: number;
  restMutations: string[];
  functionRequests: string[];
};

function paidSubscription(planId: PaidPlanId) {
  const lifetime = planId === "founder_lifetime";
  return {
    user_id: USER_ID,
    paddle_subscription_id: lifetime ? "lifetime_entitlement_ladder" : `sub_${planId}`,
    paddle_customer_id: "customer_entitlement_ladder",
    product_id: lifetime ? "founder_lifetime" : "verdant_pro",
    price_id: planId,
    status: "active",
    current_period_start: "2026-01-01T00:00:00.000Z",
    current_period_end: lifetime ? null : "2099-01-01T00:00:00.000Z",
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

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

/**
 * Match PostgREST's object media type for .single() / .maybeSingle() callers
 * and its normal list response for all other reads.
 */
async function fulfillRows(route: Route, request: Request, rows: readonly unknown[]) {
  const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
  await route.fulfill({
    status: 200,
    contentType: wantsObject ? "application/vnd.pgrst.object+json" : "application/json",
    body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
  });
}

async function mockEntitlementRoute(page: Page, lane: TierLane): Promise<NetworkAudit> {
  const audit: NetworkAudit = {
    subscriptionReads: 0,
    wizardGrowReads: 0,
    wizardTentReads: 0,
    wizardPlantReads: 0,
    consentWrites: 0,
    restMutations: [],
    functionRequests: [],
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
    const isConsentAcceptance =
      table === "user_agreement_acceptances" && request.method() === "POST";
    const isReadOnlyRpc = rpcName === "has_role" && request.method() === "POST";

    // `has_role` is a stable SECURITY DEFINER read RPC; PostgREST transports
    // it with POST even though it cannot mutate. Re-consent, if a fixture is
    // deliberately behind the current agreement version, is the one explicit
    // grower action this test permits before checking the protected route.
    if (isConsentAcceptance) audit.consentWrites += 1;
    else if (!["GET", "HEAD"].includes(request.method()) && !isReadOnlyRpc) {
      audit.restMutations.push(`${request.method()} ${url.pathname}`);
    }

    if (rpcName === "has_role") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "false" });
      return;
    }

    let rows: readonly unknown[] = [];

    switch (table) {
      case "subscriptions":
        audit.subscriptionReads += 1;
        rows = lane.planId === "free" ? [] : [paidSubscription(lane.planId)];
        break;
      case "user_roles":
        rows = [];
        break;
      case "user_agreement_acceptances":
        rows = CURRENT_AGREEMENTS;
        break;
      case "grows":
        if (url.searchParams.get("id") === `eq.${GROW_ID}`) audit.wizardGrowReads += 1;
        rows = [GROW];
        break;
      case "tents":
        if (url.searchParams.get("grow_id") === `eq.${GROW_ID}`) audit.wizardTentReads += 1;
        rows = [TENT];
        break;
      case "plants":
        if ((url.searchParams.get("or") ?? "").includes(GROW_ID)) audit.wizardPlantReads += 1;
        rows = PLANTS;
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
    audit.functionRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.route(/\/storage\/v1\//, (route) => route.abort("blockedbyclient"));
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) =>
    route.abort("blockedbyclient"),
  );

  return audit;
}

function decodeReturnTo(href: string | null): string | null {
  if (!href) return null;
  return new URL(href, "https://verdant.invalid").searchParams.get("returnTo");
}

async function acceptAgreementGateIfPresent(page: Page): Promise<boolean> {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return false;

  await gate.getByRole("checkbox", { name: /i have read and agree/i }).check();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await expect(gate).toHaveCount(0);
  return true;
}

test.describe("Entitlement ladder route smoke (mocked, non-destructive)", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `entitlement ladder proof runs only under ${MOCKED_PROJECT}`,
    );
  });

  test("covers every sellable plan exactly once", () => {
    expect(TIER_LANES.map((lane) => lane.planId)).toEqual([
      "free",
      "pro_monthly",
      "pro_annual",
      "craft_monthly",
      "craft_annual",
      "founder_lifetime",
    ]);
  });

  for (const lane of TIER_LANES) {
    test(`${lane.label}: /pheno-hunts/new resolves to the expected client access surface`, async ({
      page,
    }) => {
      await denyAnalyticsConsent(page);
      await seedSyntheticSession(page);
      const audit = await mockEntitlementRoute(page, lane);

      await page.goto(`/pheno-hunts/new?growId=${GROW_ID}`);
      await acceptAgreementGateIfPresent(page);
      await expect(page).not.toHaveURL(/\/auth(?:\/|\?|$)/);

      if (lane.expectedAccess === "gate") {
        const gate = page.getByTestId("pheno-tracker-upgrade-gate");
        await expect(gate).toBeVisible();
        await expect(page.getByTestId("pheno-hunt-onboarding")).toHaveCount(0);

        const upgradeHref = await page
          .getByTestId("pheno-tracker-upgrade-gate-upgrade-link")
          .getAttribute("href");
        expect(decodeReturnTo(upgradeHref)).toBe(`/pheno-hunts/new?growId=${GROW_ID}`);
        // The authenticated app shell's GrowsProvider legitimately preloads
        // the grow list. These assertions distinguish that shared read from
        // the wizard's grow-id / grow-scoped candidates requests.
        expect(audit.wizardGrowReads, "Free route must not mount the wizard data reads").toBe(0);
        expect(audit.wizardTentReads, "Free route must not mount the wizard data reads").toBe(0);
        expect(audit.wizardPlantReads, "Free route must not mount the wizard data reads").toBe(0);
      } else {
        await expect(page.getByTestId("pheno-hunt-onboarding")).toBeVisible();
        await expect(page.getByTestId("pheno-tracker-upgrade-gate")).toHaveCount(0);
        await expect(page.getByTestId("pheno-step-basics")).toBeVisible();
        expect(
          audit.wizardGrowReads,
          `${lane.label} route must load its target grow`,
        ).toBeGreaterThan(0);
        expect(
          audit.wizardTentReads,
          `${lane.label} route must load grow-scoped tents`,
        ).toBeGreaterThan(0);
        expect(
          audit.wizardPlantReads,
          `${lane.label} route must load grow-scoped candidates`,
        ).toBeGreaterThan(0);
      }

      expect(
        audit.subscriptionReads,
        "Each lane must resolve subscription evidence",
      ).toBeGreaterThan(0);
      expect(
        audit.consentWrites,
        "Only the explicit, synthetic agreement acceptance may write before route entry",
      ).toBeLessThanOrEqual(1);
      expect(audit.restMutations, "Route entry must not write any REST row").toEqual([]);
      expect(audit.functionRequests, "Route entry must not invoke an Edge function").toEqual([]);
    });
  }
});
