import { expect, test } from "@playwright/test";

const ROUTES = [
  "/guides/cannabis-leaf-symptoms",
  "/guides/cannabis-leaves-turning-yellow",
  "/guides/cannabis-leaf-spots-lesions",
  "/guides/cannabis-burnt-crispy-leaf-tips",
] as const;

const HUB_ROUTE = ROUTES[0];

const VIEWPORTS = [
  { name: "small-phone", width: 320, height: 720 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

test.describe("public symptom guides — responsive burden", () => {
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${viewport.name}: ${route}`, async ({ page }) => {
        const writeRequests: string[] = [];
        page.on("request", (request) => {
          if (
            request.method() !== "GET" &&
            /\/(?:rest\/v1|storage\/v1|functions\/v1|rpc)\//.test(request.url())
          ) {
            writeRequests.push(`${request.method()} ${request.url()}`);
          }
        });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("guide-page")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByTestId("symptom-reference-table")).toBeVisible();
        for (const column of [
          "Visible pattern",
          "Evidence to compare",
          "What to log next",
          "What not to assume",
        ]) {
          await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
        }
        await expect(
          page.getByRole("region", { name: "Scrollable symptom evidence table" }),
        ).toHaveAttribute("tabindex", "0");
        const evidenceHubLink = page.getByRole("link", {
          name: "Open the symptom evidence hub",
          exact: true,
        });
        if (route === HUB_ROUTE) {
          await expect(evidenceHubLink).toHaveCount(0);
        } else {
          await expect(evidenceHubLink).toBeVisible();
          await expect(evidenceHubLink).toHaveAttribute("href", HUB_ROUTE);
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
        expect(writeRequests).toEqual([]);
      });
    }
  }

  test("guide hub exposes the symptom entry point", async ({ page }) => {
    await page.goto("/guides", { waitUntil: "domcontentloaded" });
    const link = page.getByRole("link", { name: "Open the cannabis symptom hub" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/guides\/cannabis-leaf-symptoms$/);
    await expect(page.getByTestId("symptom-reference-table")).toBeVisible();
  });

  test("focused guide CTA opens the symptom evidence hub", async ({ page }) => {
    await page.goto("/guides/cannabis-leaves-turning-yellow", {
      waitUntil: "domcontentloaded",
    });
    const link = page.getByRole("link", {
      name: "Open the symptom evidence hub",
      exact: true,
    });
    await expect(link).toHaveAttribute("href", HUB_ROUTE);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${HUB_ROUTE}$`));
    await expect(page.getByTestId("symptom-reference-table")).toBeVisible();
  });
});
