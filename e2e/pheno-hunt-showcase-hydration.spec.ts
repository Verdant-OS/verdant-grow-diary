// Browser regression for a public route whose SSR tree can be delayed behind
// a resolved signed-out session. Every Supabase boundary is fulfilled locally;
// no real account, REST row, or Edge Function is contacted.
import { expect, test, type Page } from "@playwright/test";

const MOCKED_PROJECT = "chromium-mocked";
const SHOWCASE_PATH = "/pheno-hunts/55555555-5555-4555-8555-555555555555/showcase";

async function mockSignedOutSupabase(page: Page) {
  await page.route(/\/auth\/v1\//, async (route, request) => {
    if (/\/user/i.test(request.url()) && request.method() === "GET") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "unauthorized" }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route(/\/rest\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(/\/functions\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
}

test.describe("Pheno Hunt showcase hydration", () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== MOCKED_PROJECT,
      `public hydration proof runs only under ${MOCKED_PROJECT}`,
    );
  });

  test("keeps the signed-out SSR loading tree through the first showcase hydration render", async ({
    page,
    baseURL,
  }) => {
    expect(baseURL, "the mocked proof requires Playwright's local Vite base URL").toBeTruthy();
    const pageErrors: string[] = [];
    const consoleDiagnostics: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error && error.message ? error.message : error));
    });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleDiagnostics.push(message.text());
      }
    });

    await mockSignedOutSupabase(page);

    // First settle the signed-out browser session. The next request gets SSR
    // markup with no server session while the client already knows it is
    // signed out — the race that previously regenerated this public route.
    await page.goto("/welcome", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);

    await page.goto(SHOWCASE_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pheno-hunt-showcase-source")).toContainText(
      /Demo — Sunset Runtz F2 — pack hunt/i,
    );

    const hydrationErrors = [...pageErrors, ...consoleDiagnostics].filter((message) =>
      /hydrat/i.test(message),
    );
    expect(hydrationErrors, "public showcase hydration must not regenerate SSR markup").toEqual([]);
  });
});
