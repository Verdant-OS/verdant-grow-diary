import { expect, test, type Page } from "@playwright/test";

const TOOLKIT_PATH = "/tools/grow-help-toolkit";

async function blockExternalNetwork(page: Page): Promise<{
  blockedExternalRequests: string[];
  dataOrAnalyticsRequests: string[];
}> {
  const blockedExternalRequests: string[] = [];
  const dataOrAnalyticsRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    blockedExternalRequests.push(url.href);
    if (
      /google-analytics|googletagmanager|supabase|\/auth\/v1|\/rest\/v1|\/functions\/v1/i.test(
        url.href,
      )
    ) {
      dataOrAnalyticsRequests.push(url.href);
    }
    await route.abort("blockedbyclient");
  });
  return { blockedExternalRequests, dataOrAnalyticsRequests };
}

async function expectNoHorizontalOverflow(page: Page, testId: string): Promise<void> {
  const surface = await page.getByTestId(testId).evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(surface.scrollWidth, `${testId} should not clip or overflow`).toBeLessThanOrEqual(
    surface.clientWidth,
  );

  const documentWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(documentWidth.scrollWidth, "document should not overflow").toBeLessThanOrEqual(
    documentWidth.clientWidth,
  );
}

test.describe("Grow Help Toolkit local-only public flow", () => {
  test.setTimeout(60_000);
  for (const viewport of [
    { name: "mobile-320", width: 320, height: 720 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "desktop", width: 960, height: 900 },
  ]) {
    test(`${viewport.name} works with external network blocked and does not overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const network = await blockExternalNetwork(page);

      await page.goto(TOOLKIT_PATH, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("grow-help-toolkit-page")).toHaveAttribute(
        "data-hydrated",
        "true",
        { timeout: 30_000 },
      );
      await expect(page.getByText("No account · no analytics · no upload")).toBeVisible();

      await page.getByLabel("Working reservoir volume").fill("20");
      await page.getByLabel("Label dose").fill("2.5");
      await expect(page.getByTestId("nutrient-primary-result")).toContainText("50 mL");
      await expect(page.getByTestId("nutrient-primary-result")).toContainText(
        "amount = label dose × actual working reservoir volume",
      );
      await expectNoHorizontalOverflow(page, "nutrient-calculator-tab");

      await page.getByRole("tab", { name: "Light" }).click();
      await expect(page.getByTestId("light-calculator-tab")).toBeVisible();
      await expectNoHorizontalOverflow(page, "light-calculator-tab");
      await page.getByRole("tab", { name: "Expense" }).click();
      await expect(page.getByTestId("expense-calculator-tab")).toBeVisible();
      await expectNoHorizontalOverflow(page, "expense-calculator-tab");
      expect(network.dataOrAnalyticsRequests).toEqual([]);
      expect(
        network.blockedExternalRequests.every((url) =>
          ["fonts.googleapis.com", "fonts.gstatic.com"].includes(new URL(url).hostname),
        ),
      ).toBe(true);
    });
  }

  test("persists the last inputs locally without an account or remote request", async ({
    page,
  }) => {
    const network = await blockExternalNetwork(page);
    await page.goto(TOOLKIT_PATH, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("grow-help-toolkit-page")).toHaveAttribute(
      "data-hydrated",
      "true",
      { timeout: 30_000 },
    );
    await page.getByLabel("Working reservoir volume").fill("7.5");
    await page.getByLabel("Label dose").fill("3");
    await expect(page.getByTestId("nutrient-primary-result")).toContainText("22.5 mL");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("grow-help-toolkit-page")).toHaveAttribute(
      "data-hydrated",
      "true",
      { timeout: 30_000 },
    );
    await expect(page.getByLabel("Working reservoir volume")).toHaveValue("7.5");
    await expect(page.getByLabel("Label dose")).toHaveValue("3");
    expect(network.dataOrAnalyticsRequests).toEqual([]);
  });
});
