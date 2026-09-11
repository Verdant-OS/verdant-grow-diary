// Browser proof for the Plant Detail Quick Log watering READ PATH.
//
// Loads /plants/:id with a mocked Quick Log watering diary row and asserts
// the four surfaces the identity resolver feeds stay in agreement:
//   1. recap item label     — "Watering" (never the generic "Note")
//   2. panel row badge      — "Watering · 500 ml"
//   3. payload rendering    — only the stored volume; no invented pH/EC
//   4. effective event type — data attributes agree ("watering")
//
// SAFETY:
// - Uses a clearly fake session (same convention as dashboard-mobile-overflow).
// - Intercepts every Supabase auth, REST, and edge-function request.
// - Performs no real writes, AI calls, ingest, alerts, Action Queue changes,
//   or device control.
import { expect, test, type Page } from "@playwright/test";
import { CURRENT_AGREEMENT_LIST } from "../src/constants/agreements";

// AgreementReconsentGate renders inside the authenticated shell and queries
// user_agreement_acceptances on mount. Without this fixture the catch-all below
// answers `[]`, computeAgreementGaps reports both agreements missing, and the
// modal opens over the page — intercepting clicks non-deterministically
// depending on whether the query resolves before or after the interaction.
// Derived from the product registry so an agreement bump cannot silently turn
// this read-only browser proof back into a flake.
const CURRENT_AGREEMENT_ROWS = CURRENT_AGREEMENT_LIST.map((agreement) => ({
  agreement_type: agreement.type,
  version: agreement.version,
}));

const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`;
const MOCKED_PROJECT = "chromium-mocked";

const FAKE_USER = {
  id: "quicklog-readpath-browser-user",
  aud: "authenticated",
  email: "quicklog-readpath@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00.000Z",
  confirmed_at: "2020-01-01T00:00:00.000Z",
  user_metadata: { email_verified: true },
};

const FAKE_GROW_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_TENT_ID = "22222222-2222-4222-8222-222222222222";
const FAKE_PLANT_ID = "33333333-3333-4333-8333-333333333333";

const FAKE_GROW = {
  id: FAKE_GROW_ID,
  name: "Readpath Proof Grow",
  stage: "veg",
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};

const FAKE_TENT = {
  id: FAKE_TENT_ID,
  grow_id: FAKE_GROW_ID,
  name: "Readpath Proof Tent",
  brand: "",
  size: "2x2",
  stage: "veg",
  light_on: true,
  light_schedule: "18/6",
  light_wattage: 100,
  is_archived: false,
  created_at: "2020-01-01T00:00:00.000Z",
};

const FAKE_PLANT = {
  id: FAKE_PLANT_ID,
  grow_id: FAKE_GROW_ID,
  tent_id: FAKE_TENT_ID,
  name: "Readpath Proof Plant",
  strain: "Browser fixture",
  stage: "veg",
  started_at: "2020-01-01T00:00:00.000Z",
  health: "healthy",
  plant_type: "unknown",
  photo_url: null,
  last_note: null,
  is_archived: false,
  medium: "soil",
  pot_size: "3 gal",
};

// Quick Log watering mirror row exactly as `quicklog_save_manual` persists
// it: `quick_log` envelope with the true action + payload inside details.
// Recent timestamp so the no-recent-log recovery prompt never replaces the
// recap list.
const WATERING_ENTRY_ID = "44444444-4444-4444-8444-444444444444";
function buildWateringEntry() {
  return {
    id: WATERING_ENTRY_ID,
    plant_id: FAKE_PLANT_ID,
    tent_id: FAKE_TENT_ID,
    grow_id: FAKE_GROW_ID,
    event_type: "quick_log",
    note: "",
    photo_url: null,
    entry_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    details: { event_type: "watering", watering_amount_ml: 500 },
  };
}

async function seedFakeSession(page: Page) {
  await page.addInitScript(
    ({ key, user }) => {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          access_token: "FAKE-ACCESS-TOKEN-NOT-REAL",
          refresh_token: "FAKE-REFRESH-TOKEN-NOT-REAL",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
    },
    { key: SESSION_KEY, user: FAKE_USER },
  );
}

/**
 * Fulfill a PostgREST read honestly for both list and `.single()` /
 * `.maybeSingle()` callers: object-accept requests get the first row as a
 * bare object, everything else gets the array.
 */
function fulfillRows(
  route: Parameters<Parameters<Page["route"]>[1]>[0],
  request: Parameters<Parameters<Page["route"]>[1]>[1],
  rows: unknown[],
) {
  const accept = request.headers()["accept"] ?? "";
  const wantsObject = accept.includes("vnd.pgrst.object");
  const body = wantsObject ? JSON.stringify(rows[0] ?? null) : JSON.stringify(rows);
  const contentType = wantsObject ? "application/vnd.pgrst.object+json" : "application/json";
  return route.fulfill({ status: 200, contentType, body });
}

async function mockSignedInSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user/i.test(request.url())) {
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
    const pathname = new URL(request.url()).pathname;
    const rows = pathname.endsWith("/rest/v1/user_agreement_acceptances")
      ? CURRENT_AGREEMENT_ROWS
      : pathname.endsWith("/rest/v1/plants")
        ? [FAKE_PLANT]
        : pathname.endsWith("/rest/v1/tents")
          ? [FAKE_TENT]
          : pathname.endsWith("/rest/v1/grows")
            ? [FAKE_GROW]
            : pathname.endsWith("/rest/v1/diary_entries")
              ? [buildWateringEntry()]
              : [];
    await fulfillRows(route, request, rows);
  });
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(/google-analytics\.com|googletagmanager\.com/, (route) => route.abort());
}

async function acceptReconsentGateIfShown(page: Page) {
  const gate = page.getByTestId("agreement-reconsent-gate");
  const shown = await gate
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await gate.locator("#reconsent-accept").click();
  await gate.getByRole("button", { name: /accept and continue/i }).click();
  await gate.waitFor({ state: "hidden", timeout: 15_000 });
}

test.describe("Plant Detail Quick Log watering read path", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `mocked read-path proof runs once, under the ${MOCKED_PROJECT} project`,
    );
  });

  test("recap label, panel label, payload, and effective event type all agree on Watering", async ({
    page,
  }) => {
    await seedFakeSession(page);
    await mockSignedInSupabase(page);

    await page.goto(`/plants/${FAKE_PLANT_ID}`);
    await acceptReconsentGateIfShown(page);

    // ---- 1. Recap item: Watering, never Note --------------------------
    const recapItem = page.getByTestId("plant-detail-recent-activity-recap-item").first();
    await expect(recapItem).toBeVisible();
    await expect(recapItem).toHaveAttribute("data-category", "watering");
    const recapText = (await recapItem.innerText()).trim();
    expect(recapText).toMatch(/watering/i);
    expect(recapText).toContain("500 ml");
    expect(recapText).not.toMatch(/\bnote\b/i);

    // ---- 2 + 4. Panel row: label + effective event type ---------------
    // The Recent Plant Activity panel lives inside the collapsed "History"
    // disclosure on the live Plant Detail layout — open it first.
    const historyTrigger = page.getByTestId("plant-detail-disclosure-history-trigger");
    await expect(historyTrigger).toBeVisible();
    await historyTrigger.click();

    // PlantDetail can mount the panel at more than one site; assert on the
    // instance that is actually visible after the disclosure opens.
    const panelRow = page
      .locator(`[data-testid="plant-recent-activity-row"][data-entry-id="${WATERING_ENTRY_ID}"]`)
      .filter({ visible: true })
      .first();
    await expect(panelRow).toBeVisible();
    await expect(panelRow).toHaveAttribute("data-effective-event-type", "watering");
    const badge = panelRow.getByTestId("plant-recent-activity-event-type");
    const badgeText = (await badge.innerText()).trim();
    expect(badgeText).toMatch(/watering/i);
    expect(badgeText).toContain("500 ml");
    expect(badgeText).not.toMatch(/\bnote\b/i);

    // ---- 3. Payload honesty: only the stored volume -------------------
    // The fixture row stores ONLY watering_amount_ml. Nothing on the row
    // may invent a pH or EC reading.
    const rowText = (await panelRow.innerText()).trim();
    expect(rowText).not.toMatch(/\bpH\b\s*\d/i);
    expect(rowText).not.toMatch(/\bEC\b\s*\d/i);
    expect(rowText).not.toMatch(/undefined|NaN/);
  });
});
