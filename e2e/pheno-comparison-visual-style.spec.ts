import { test, expect, type Locator } from "@playwright/test";

/**
 * /pheno-comparison visual-style regression (screenshot + DOM).
 *
 * Purpose:
 *  Prevent risky telemetry (stale / invalid / demo / unknown / incomplete)
 *  from accidentally rendering with green/OK/success visual styling on
 *  the read-only preview surface.
 *
 * Primary pass/fail is deterministic DOM/class/data-attribute assertions.
 * Screenshots are captured for human visual review; snapshot equality is
 * NOT asserted (Playwright's `toHaveScreenshot` is intentionally not used
 * here — pixel diffs are too brittle across CI font/rendering variance).
 *
 * Safety:
 *  - Read-only route mounted outside AppShell (fixture-only).
 *  - No auth, no Supabase, no writes, no clicks.
 */

const RISKY_UNTRUSTED_CANDIDATES = [
  "pheno-candidate-demo-cand-bravo",
  "pheno-candidate-demo-cand-charlie",
];

const FORBIDDEN_STATUS_ATTRS: ReadonlyArray<{ attr: string; value: string }> = [
  { attr: "data-status", value: "ok" },
  { attr: "data-status", value: "healthy" },
  { attr: "data-tone", value: "success" },
  { attr: "data-variant", value: "success" },
];

const FORBIDDEN_CLASS_TOKENS = [
  "bg-green-",
  "bg-emerald-",
  "text-green-",
  "text-emerald-",
  "border-green-",
  "border-emerald-",
  "badge-success",
  "status-ok",
  "is-healthy",
];

const FORBIDDEN_TEXT_TOKENS = [
  /\bhealthy\b/i,
  /\bpassed\b/i,
  /\ball good\b/i,
  /\bno issues detected\b/i,
  /✓|✅|🟢/,
];

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
];

async function collectClassNames(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const out: string[] = [];
    root
      .querySelectorAll<HTMLElement>("*")
      .forEach((el) => {
        if (el.className && typeof el.className === "string") {
          out.push(el.className);
        }
      });
    return out;
  });
}

for (const vp of VIEWPORTS) {
  test(`/pheno-comparison risky-state visual-style stays non-success @ ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Disable animations to stabilize screenshots.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }`,
    });
    await page.goto("/pheno-comparison", { waitUntil: "domcontentloaded" });

    const region = page.getByTestId("pheno-comparison-page");
    await expect(region).toBeVisible();

    // Disclaimer + legend + missing-data flags visible.
    await expect(
      page.getByTestId("pheno-comparison-read-only-badge"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-comparison-demo-banner"),
    ).toContainText(/not live/i);
    await expect(
      page.getByTestId("pheno-comparison-source-legend"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pheno-candidate-demo-cand-bravo-no-photo"),
    ).toBeVisible();

    // DOM/data-attr assertions on the whole region (primary pass/fail).
    for (const { attr, value } of FORBIDDEN_STATUS_ATTRS) {
      const hit = region.locator(`[${attr}="${value}"]`);
      expect(
        await hit.count(),
        `forbidden ${attr}="${value}" attribute present on pheno-comparison`,
      ).toBe(0);
    }

    // Risky candidates must not carry any forbidden success class token.
    for (const candTestId of RISKY_UNTRUSTED_CANDIDATES) {
      const card = page.getByTestId(candTestId);
      await expect(card).toBeVisible();
      const classNames = await collectClassNames(card);
      for (const token of FORBIDDEN_CLASS_TOKENS) {
        const offender = classNames.find((c) => c.includes(token));
        expect(
          offender,
          `risky card ${candTestId} contains forbidden class token "${token}" (className="${offender ?? ""}")`,
        ).toBeUndefined();
      }
      const text = (await card.textContent()) ?? "";
      for (const re of FORBIDDEN_TEXT_TOKENS) {
        expect(
          re.test(text),
          `risky card ${candTestId} contains forbidden text ${re}`,
        ).toBe(false);
      }
    }

    // Capture a stable screenshot of the region for human review. This is
    // an artifact only — the test does NOT assert pixel equality.
    await region.screenshot({
      path: `e2e/screenshots/pheno-comparison-visual-style-${vp.name}.png`,
    });
  });
}
