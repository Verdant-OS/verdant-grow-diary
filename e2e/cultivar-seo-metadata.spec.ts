import { expect, test, type Page } from "@playwright/test";

import { VERDANT_CULTIVARS } from "../src/constants/verdantCultivars";

const ORIGIN = "https://verdantgrowdiary.com";
const FILTER_VARIANTS = [
  "?q=oreoz",
  "?difficulty=Intermediate",
  "?q=cookies&difficulty=Beginner-friendly",
  "?difficulty=Advanced&q=gas",
] as const;

async function meta(page: Page, selector: string) {
  return page.locator(selector).getAttribute("content");
}

test("cultivars hub emits one canonical and complete social metadata", async ({ page }) => {
  await page.goto("/cultivars", { waitUntil: "domcontentloaded" });
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute("href", `${ORIGIN}/cultivars`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    `${ORIGIN}/cultivars`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${ORIGIN}/og/cultivars/index.png`,
  );
});

for (const search of FILTER_VARIANTS) {
  test(`filtered hub ${search} cannot become a duplicate index`, async ({ page }) => {
    await page.goto(`/cultivars${search}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}/cultivars`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${ORIGIN}/cultivars`,
    );
  });
}

for (const cultivar of VERDANT_CULTIVARS) {
  test(`${cultivar.slug} emits its own canonical and OpenGraph card`, async ({ page }) => {
    const path = `/cultivars/${cultivar.slug}`;
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${ORIGIN}${path}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      new RegExp(cultivar.name),
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${ORIGIN}/og/cultivars/${cultivar.slug}.png`,
    );
    expect(await meta(page, 'meta[name="twitter:image"]')).toBe(
      `${ORIGIN}/og/cultivars/${cultivar.slug}.png`,
    );
  });
}

for (const path of ["/strains", "/strains/oreoz"] as const) {
  test(`${path} resolves to one non-conflicting cultivar target`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const target = path === "/strains" ? "/cultivars" : "/cultivars/oreoz";
    await page.waitForURL(`**${target}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${ORIGIN}${target}`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${ORIGIN}${target}`,
    );
  });
}
