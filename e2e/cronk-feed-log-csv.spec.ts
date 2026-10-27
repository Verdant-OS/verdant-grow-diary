import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("cronk feed log export downloads a csv file", async ({ page }) => {
  await page.goto("/guides/cronk-nutrients-grow-diary", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByLabel("Week 1, Product 1, actual").fill("2.5");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^cronk-feed-log-\d{4}-\d{2}-\d{2}\.csv$/);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const csv = await readFile(filePath!, "utf8");
  expect(csv).toContain("2.5");
  await expect(page.getByRole("status")).toHaveText(
    "CSV downloaded. Nothing is saved in your browser.",
  );
});
