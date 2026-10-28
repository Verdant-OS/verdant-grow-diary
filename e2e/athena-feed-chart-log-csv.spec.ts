import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

function fullChromiumExecutable(): string | undefined {
  const root = path.join(os.homedir(), ".cache/ms-playwright");
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return undefined;
  }
  const revision = entries.find((name) => /^chromium-\d+$/.test(name));
  if (!revision) return undefined;
  return path.join(root, revision, "chrome-linux64", "chrome");
}

const chrome = fullChromiumExecutable();
if (chrome) {
  // Headless shell does not emit Playwright's download event for this blob link.
  // The full Chromium build does.
  test.use({ launchOptions: { executablePath: chrome } });
}

test("athena feed log export downloads the entered csv", async ({ page }) => {
  await page.goto("/guides/athena-feed-chart-log", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByLabel("Week 1, Product 1, actual").fill("2.5");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^feed-log-\d{4}-\d{2}-\d{2}\.csv$/);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const text = await readFile(filePath as string, "utf8");
  expect(text).toContain("2.5");
  expect(text).toContain("pro_line");
});
