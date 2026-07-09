/**
 * Legal SEO metadata smoke: /privacy, /terms, /refund.
 *
 * Runtime assertion that LegalPageShell + usePageSeo emit the expected
 * per-route canonical, OpenGraph, Twitter, and WebPage JSON-LD payload
 * against the actual browser DOM (not just jsdom).
 *
 * SAFETY: public routes only, no auth, no network writes, no secrets.
 */
import { expect, test } from "@playwright/test";

const ORIGIN = "https://verdantgrowdiary.com";

const ROUTES = [
  { path: "/privacy", name: "Privacy Policy" },
  { path: "/terms", name: "Terms of Service" },
  { path: "/refund", name: "Refund Policy" },
] as const;

for (const r of ROUTES) {
  test(`legal SEO metadata: ${r.path}`, async ({ page }) => {
    const url = `${ORIGIN}${r.path}`;
    await page.goto(r.path, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (sel) => document.head.querySelectorAll(sel).length === 1,
      'link[rel="canonical"]',
    );

    const canonicals = await page.$$eval(
      'link[rel="canonical"]',
      (els) => els.map((e) => e.getAttribute("href")),
    );
    expect(canonicals).toEqual([url]);

    const attr = async (sel: string, name: string) =>
      page.$eval(sel, (el, n) => el.getAttribute(n), name).catch(() => null);

    expect(await attr('meta[name="description"]', "content")).toBeTruthy();
    expect(await attr('meta[property="og:title"]', "content")).toContain(r.name);
    expect(await attr('meta[property="og:description"]', "content")).toBeTruthy();
    expect(await attr('meta[property="og:url"]', "content")).toBe(url);
    expect(await attr('meta[property="og:type"]', "content")).toBeTruthy();
    expect(await attr('meta[property="og:image"]', "content")).toMatch(/^https?:\/\//);
    expect(await attr('meta[property="og:site_name"]', "content")).toBeTruthy();
    expect(await attr('meta[name="twitter:title"]', "content")).toContain(r.name);
    expect(await attr('meta[name="twitter:description"]', "content")).toBeTruthy();
    expect(await attr('meta[name="twitter:card"]', "content")).toBeTruthy();
    expect(await attr('meta[name="twitter:image"]', "content")).toMatch(/^https?:\/\//);

    const jsonLdText = await page
      .locator('script[data-testid="legal-page-json-ld"]')
      .first()
      .textContent();
    expect(jsonLdText).toBeTruthy();
    const parsed = JSON.parse(jsonLdText ?? "");
    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("WebPage");
    expect(parsed.url).toBe(url);
    expect(parsed["@id"]).toBe(`${url}#webpage`);
    expect(parsed.name).toBe(r.name);
    expect(parsed.publisher?.name).toBe("Verdant");
  });
}
