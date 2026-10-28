import { expect, test, type Page } from "@playwright/test";

// Exercise the real public route without credentials or backend access.
for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test.describe(`public VPD chart (${viewport.name})`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.name === "mobile",
      hasTouch: viewport.name === "mobile",
    });
    const backendRequests = new WeakMap<Page, string[]>();

    test.beforeEach(async ({ page, baseURL }) => {
      const hits: string[] = [];
      backendRequests.set(page, hits);
      const origin = new URL(baseURL!).origin;
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (/\/(auth|rest|functions|storage)\/v1\//.test(url.pathname)) {
          hits.push(url.pathname);
          await route.abort();
        } else if (url.origin !== origin) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
      await page.goto("/vpd-chart", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-vpd-chart-page")).toHaveAttribute(
        "data-hydrated",
        "true",
        { timeout: 30_000 },
      );
      await expect(
        page.getByRole("heading", { name: "VPD Chart and Calculator for Every Growth Stage" }),
      ).toBeVisible();
    });

    test.afterEach(async ({ page }) => {
      expect(backendRequests.get(page), "The public chart must not request backend data").toEqual(
        [],
      );
    });

    test("renders signed-out, preserves idle Celsius inputs, and contains the heatmap on mobile", async ({
      page,
    }) => {
      await expect(page).toHaveURL(/\/vpd-chart$/);
      await expect(
        page.getByText("This is not a live sensor reading.", { exact: false }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Stage-aware VPD calculator" })).toHaveAttribute(
        "href",
        "/tools/vpd-calculator",
      );
      const celsius = page.getByRole("button", { name: "°C", exact: true });
      if (viewport.name === "mobile") await celsius.tap();
      else await celsius.click();
      for (const label of [/Air temperature/, /Relative humidity/, /Leaf temperature offset/]) {
        await page.getByLabel(label).focus();
        await page.keyboard.press("Tab");
      }
      await expect(page.getByLabel(/Air temperature/)).toHaveValue("25");
      await expect(page.getByLabel(/Relative humidity/)).toHaveValue("60");
      await expect(page.getByLabel(/Leaf temperature offset/)).toHaveValue("-1.1");
      await expect(page.getByRole("region", { name: "Calculated VPD" })).toContainText("1.06 kPa");
      await expect(page.getByRole("region", { name: "Calculated VPD" })).toContainText(
        "No verified target status",
      );
      await expect(page.getByRole("region", { name: "Calculated VPD" })).not.toContainText(
        /Within your|Above your|Below your/,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        "The heatmap must scroll within its container instead of widening the page",
      ).toBe(true);
    });

    test("commits a draft before unit conversion and restores blank or clamps committed inputs", async ({
      page,
    }) => {
      const air = page.getByLabel(/Air temperature/);
      const humidity = page.getByLabel(/Relative humidity/);
      const offset = page.getByLabel(/Leaf temperature offset/);
      await air.fill("85");
      const celsius = page.getByRole("button", { name: "°C", exact: true });
      if (viewport.name === "mobile") await celsius.tap();
      else await celsius.click();
      await expect(air).toHaveValue("29.4");
      await humidity.fill("");
      await humidity.press("Tab");
      await expect(humidity).toHaveValue("60");
      await humidity.fill("101");
      await humidity.press("Enter");
      await expect(humidity).toHaveValue("100");
      await offset.fill("");
      await offset.press("Tab");
      await expect(offset).toHaveValue("-1.1");
      await air.fill("0");
      await air.press("Enter");
      await expect(air).toHaveValue("10");
      await air.fill("38");
      await air.press("Enter");
      await expect(air).toHaveValue("37.8");
    });

    test("moves through the heatmap with the keyboard and selects entered values", async ({
      page,
    }) => {
      const current = page.getByRole("button", { name: /^76 °F, 60% RH: VPD/ });
      const next = page.getByRole("button", { name: /^76 °F, 65% RH: VPD/ });
      await current.focus();
      await page.keyboard.press("ArrowRight");
      await expect(next).toBeFocused();
      await page.keyboard.press("Space");
      await expect(page.getByLabel(/Air temperature/)).toHaveValue("76");
      await expect(page.getByLabel(/Relative humidity/)).toHaveValue("65");
      await expect(next).toHaveAttribute("aria-label", /nearest current input/);
      await page.getByLabel(/Growth stage target/).selectOption("late_flower");
      await expect(page.getByRole("heading", { name: "Late Flower (1.2–1.6 kPa)" })).toBeVisible();
    });
  });
}
