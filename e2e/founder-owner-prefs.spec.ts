import { expect, test } from "@playwright/test";

test.describe("/founder owner prefs", () => {
  test("redirects to pricing instead of a Founder purchase page", async ({ page }) => {
    await page.goto("/founder");
    await expect(page).toHaveURL(/\/pricing\/?$/);
  });
});
