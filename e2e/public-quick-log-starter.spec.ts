import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * /quick-log public Quick Log Starter — anonymous browser smoke
 * (chromium-mocked project: no auth, no storageState, no credentials).
 *
 * Verifies the surface's hard lines in a real browser:
 *  - renders signed-out with no app chrome and no sign-in wall,
 *  - the whole draft lifecycle (save → reload → persists → delete) happens
 *    with ZERO write requests (POST/PUT/PATCH/DELETE) to any Supabase /
 *    AI / device data-plane host and no unexpected external writes,
 *  - the signup CTA carries the pinned attribution shape,
 *  - no uncaught page errors.
 *
 * Read-only posture: the only "write" this spec performs is to the
 * browser's OWN localStorage — that is the product's design.
 */

// External data-plane hosts/paths this public surface must never touch.
const FORBIDDEN_REQUEST_RE =
  /(?:supabase\.(?:co|in|net)|\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\/|openai\.com|anthropic\.com|api\.groq|shelly\.cloud|ecowitt\.net)/i;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_ANALYTICS_WRITE_ORIGINS = new Set([
  "https://www.google-analytics.com",
  "https://www.google.com",
]);

function isLocalhost(url: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(url);
}

function isAllowedAnalyticsCollection(method: string, url: string): boolean {
  if (method !== "POST") return false;
  try {
    const parsed = new URL(url);
    return ALLOWED_ANALYTICS_WRITE_ORIGINS.has(parsed.origin) && parsed.pathname === "/g/collect";
  } catch {
    return false;
  }
}

function decodeAnalyticsTranscript(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function watchTraffic(page: Page) {
  const forbidden: string[] = [];
  const unexpectedWrites: string[] = [];
  const analyticsWrites: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("request", (req: Request) => {
    const url = req.url();
    if (!isLocalhost(url) && FORBIDDEN_REQUEST_RE.test(url)) {
      forbidden.push(`${req.method()} ${url}`);
    }
    if (WRITE_METHODS.has(req.method()) && !isLocalhost(url)) {
      if (isAllowedAnalyticsCollection(req.method(), url)) {
        analyticsWrites.push(`${req.method()} ${url} ${req.postData() ?? ""}`);
      } else {
        unexpectedWrites.push(`${req.method()} ${url}`);
      }
    }
  });
  return { forbidden, unexpectedWrites, analyticsWrites, pageErrors };
}

test.describe("Public Quick Log Starter (anonymous, zero writes)", () => {
  test("draft lifecycle stays on-device with the pinned signup handoff", async ({ page }) => {
    const traffic = watchTraffic(page);

    await page.goto("/quick-log?utm_source=organic_guide&utm_medium=owned");
    const root = page.getByTestId("public-quick-log-starter");
    await expect(root).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/30 seconds/i);
    // No app chrome, no sign-in wall.
    await expect(page.getByTestId("app-shell")).toHaveCount(0);
    await expect(page.getByLabel(/^password$/i)).toHaveCount(0);

    // Fill and save the minimal draft.
    await page.getByTestId("starter-plant-nickname").fill("Blue Dream #1");
    await page.getByTestId("starter-note").fill("First true leaves look healthy.");
    await page.getByTestId("starter-save-draft").click();
    await expect(page.getByTestId("starter-saved-draft")).toBeVisible();
    await expect(page.getByTestId("starter-saved-nickname")).toContainText("Blue Dream #1");

    // The honest persistence copy is visible with the saved draft.
    await expect(page.getByTestId("starter-truth-line")).toContainText(
      /lives only in this browser/i,
    );

    // Signup CTA: pinned shape + inbound UTM attribution.
    await expect(page.getByTestId("starter-signup-cta")).toHaveAttribute(
      "href",
      "/auth?mode=signup&redirectTo=%2Fonboarding&utm_source=organic_guide&utm_medium=owned",
    );

    // Reload: the draft survives in this browser (localStorage).
    await page.reload();
    await expect(page.getByTestId("starter-saved-draft")).toBeVisible();
    await expect(page.getByTestId("starter-saved-nickname")).toContainText("Blue Dream #1");

    // Delete: consume-once clear works and the empty state returns.
    await page.getByTestId("starter-clear-draft").click();
    await expect(page.getByTestId("starter-saved-draft")).toHaveCount(0);

    // Hard lines: GA may collect generic page events, but grower-entered
    // content never leaves the browser and no other external write occurs.
    expect(traffic.unexpectedWrites, "unexpected external write requests").toEqual([]);
    const analyticsTranscript = decodeAnalyticsTranscript(traffic.analyticsWrites.join("\n"));
    expect(analyticsTranscript).not.toContain("Blue Dream #1");
    expect(analyticsTranscript).not.toContain("First true leaves look healthy.");
    expect(traffic.forbidden, "forbidden data-plane requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });

  test("watering flow requires a volume and never leaves the device", async ({ page }) => {
    const traffic = watchTraffic(page);

    await page.goto("/quick-log");
    await page.getByTestId("starter-plant-nickname").fill("Blue Dream #1");
    await page.getByTestId("starter-log-type-watering").click();
    await page.getByTestId("starter-save-draft").click();
    // Volume required: inline error, no saved card.
    await expect(page.getByTestId("starter-saved-draft")).toHaveCount(0);
    await page.getByTestId("starter-watering-volume").fill("731.29");
    await page.getByTestId("starter-save-draft").click();
    await expect(page.getByTestId("starter-saved-draft")).toBeVisible();
    await expect(page.getByTestId("starter-saved-volume")).toContainText("731.29 ml");

    expect(traffic.unexpectedWrites, "unexpected external write requests").toEqual([]);
    const analyticsTranscript = decodeAnalyticsTranscript(traffic.analyticsWrites.join("\n"));
    expect(analyticsTranscript).not.toContain("Blue Dream #1");
    expect(analyticsTranscript).not.toContain("731.29");
    expect(traffic.forbidden, "forbidden data-plane requests").toEqual([]);
    expect(traffic.pageErrors, "uncaught page errors").toEqual([]);
  });
});
