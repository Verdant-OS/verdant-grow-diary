import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * /pheno-comparison visual-style regression — selection-grade surface.
 *
 * Purpose:
 *  Prevent risky selection evidence (thin / partial / stale / invalid / demo /
 *  unknown / incomplete) from rendering with green/OK/success visual styling.
 *  Scans candidates with declared missing context plus untrusted sensor
 *  snapshots and missing-photo states.
 *
 * Primary pass/fail is deterministic DOM/class/data-attribute assertions.
 * SCOPING NOTE (important):
 *  The source legend renders a green/emerald "Live" swatch on every load
 *  (live IS a trusted source), so green-class / checkmark / healthy-text scans
 *  are scoped to risky candidate cards + untrusted subtrees — never the whole
 *  page region. Only the success *data-attribute* scan runs region-wide.
 *
 * Safety: read-only route mounted outside AppShell (fixture-only). No auth, no
 * Supabase, no writes, no clicks.
 */

const FORBIDDEN_STATUS_ATTRS: ReadonlyArray<{ attr: string; value: string }> = [
  { attr: "data-status", value: "ok" },
  { attr: "data-status", value: "healthy" },
  { attr: "data-tone", value: "success" },
  { attr: "data-variant", value: "success" },
];

// Passed as strings so they can be reconstructed inside page.evaluate().
const FORBIDDEN_CLASS_RE_SRC = "\\b(?:bg|text|border|ring)-(?:green|emerald)-\\d";
const FORBIDDEN_BADGE_RE_SRC = "badge-success|status-ok|is-healthy";
const CHECKMARK_CLASS_RE_SRC =
  "lucide-(?:check|badge-check|circle-check)|check-circle|checkmark|badge-check";
const CHECKMARK_TEXT_RE_SRC = "✓|✔|✅|🟢";
// Affirmative healthy/OK/success language only. Honest negations
// ("not healthy", "never shown as healthy", "excluded from healthy status")
// are intentionally NOT matched.
const HEALTHY_AFFIRMATIVE_SRC: readonly string[] = [
  "\\bis healthy\\b",
  "\\blooks healthy\\b",
  "\\bhealthy plant\\b",
  "\\ball good\\b",
  "\\bno issues (?:detected|found)\\b",
  "\\bverified\\b",
  "\\bpassed\\b",
  "\\bnormal\\b",
  "\\bstatus:\\s*ok\\b",
  "\\bstatus:\\s*success\\b",
];

const UNTRUSTED_SOURCES = ["demo", "stale", "invalid", "unknown"];

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 900 },
];

interface ScanResult {
  classOffenders: string[];
  attrOffenders: string[];
  checkmarkOffenders: string[];
  healthyOffenders: string[];
}

interface ScanCfg {
  classRe: string;
  badgeRe: string;
  checkClassRe: string;
  checkTextRe: string;
  attrs: ReadonlyArray<{ attr: string; value: string }>;
  healthy: readonly string[];
}

const SCAN_CFG: ScanCfg = {
  classRe: FORBIDDEN_CLASS_RE_SRC,
  badgeRe: FORBIDDEN_BADGE_RE_SRC,
  checkClassRe: CHECKMARK_CLASS_RE_SRC,
  checkTextRe: CHECKMARK_TEXT_RE_SRC,
  attrs: FORBIDDEN_STATUS_ATTRS,
  healthy: HEALTHY_AFFIRMATIVE_SRC,
};

/** Walk a scope element + all descendants and report success/healthy styling. */
async function scanScope(scope: Locator): Promise<ScanResult> {
  return scope.evaluate((root: Element, cfg: ScanCfg): ScanResult => {
    const classRe = new RegExp(cfg.classRe);
    const badgeRe = new RegExp(cfg.badgeRe);
    const checkClassRe = new RegExp(cfg.checkClassRe, "i");
    const checkTextRe = new RegExp(cfg.checkTextRe);
    const affirm = cfg.healthy.map((s) => new RegExp(s, "i"));
    const impliesHealthy = (t: string) => affirm.some((r) => r.test(t));
    const id = (el: Element) => el.getAttribute("data-testid") || el.tagName.toLowerCase();

    const classOffenders: string[] = [];
    const attrOffenders: string[] = [];
    const checkmarkOffenders: string[] = [];
    const healthyOffenders: string[] = [];

    const nodes: Element[] = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const el of nodes) {
      const cn =
        typeof (el as HTMLElement).className === "string"
          ? (el as HTMLElement).className
          : el.getAttribute("class") || "";
      if (classRe.test(cn) || badgeRe.test(cn)) {
        classOffenders.push(`${id(el)} (class="${cn}")`);
      }
      for (const { attr, value } of cfg.attrs) {
        if (el.getAttribute(attr) === value) {
          attrOffenders.push(`${attr}="${value}" on ${id(el)}`);
        }
      }
      const iconAttrs = `${el.getAttribute("data-icon") || ""} ${el.getAttribute("data-lucide") || ""}`;
      if (checkClassRe.test(cn) || checkClassRe.test(iconAttrs)) {
        checkmarkOffenders.push(`icon ${id(el)}`);
      }
      const aria = [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")]
        .filter(Boolean)
        .join(" ");
      if (aria && impliesHealthy(aria)) {
        healthyOffenders.push(`aria "${aria.slice(0, 80)}" on ${id(el)}`);
      }
    }

    const text = root.textContent || "";
    if (checkTextRe.test(text)) checkmarkOffenders.push("checkmark char in text");
    if (impliesHealthy(text)) {
      healthyOffenders.push(`text "${text.replace(/\s+/g, " ").slice(0, 100)}"`);
    }
    return { classOffenders, attrOffenders, checkmarkOffenders, healthyOffenders };
  }, SCAN_CFG);
}

function expectScopeClean(label: string, r: ScanResult) {
  expect(r.classOffenders, `${label}: green/success class tokens`).toEqual([]);
  expect(r.attrOffenders, `${label}: success status attributes`).toEqual([]);
  expect(r.checkmarkOffenders, `${label}: checkmark/health icons`).toEqual([]);
  expect(r.healthyOffenders, `${label}: healthy/OK/success aria-label or visible text`).toEqual([]);
}

/** Scan every element matched by `selector` inside the region. */
async function scanEach(region: Locator, selector: string, label: string) {
  const loc = region.locator(selector);
  const count = await loc.count();
  for (let i = 0; i < count; i++) {
    expectScopeClean(`${label}[${i}] (${selector})`, await scanScope(loc.nth(i)));
  }
  return count;
}

/**
 * Current-product responsive visual-honesty fence. Every demo candidate with
 * missing context, and every untrusted snapshot subtree, must remain free of
 * success/healthy styling at mobile, tablet, and desktop widths.
 */
for (const vp of VIEWPORTS) {
  test(`/pheno-comparison missing-context evidence stays non-success @ ${vp.name}`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/pheno-comparison");

    const region = page.getByTestId("pheno-comparison-page");
    await expect(region).toBeVisible();

    for (const { attr, value } of FORBIDDEN_STATUS_ATTRS) {
      expect(
        await region.locator(`[${attr}="${value}"]`).count(),
        `forbidden ${attr}="${value}" attribute present on pheno-comparison`,
      ).toBe(0);
    }

    const cards = region.locator("section[data-testid^='pheno-candidate-']");
    await expect(cards.first()).toBeVisible();
    const cardCount = await cards.count();
    expect(cardCount, "demo candidate sections render").toBeGreaterThanOrEqual(2);

    let missingContextCards = 0;
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      if ((await card.locator("[data-testid$='-missing']").count()) === 0) continue;
      missingContextCards++;
      expectScopeClean(`missing-context candidate[${i}]`, await scanScope(card));
    }
    expect(
      missingContextCards,
      "at least one missing-context candidate in the demo fixtures",
    ).toBeGreaterThan(0);

    let untrustedSnapshots = 0;
    for (const source of UNTRUSTED_SOURCES) {
      untrustedSnapshots += await scanEach(
        region,
        `[data-testid^='snapshot-'][data-source='${source}']`,
        `${source} sensor snapshot`,
      );
    }
    expect(untrustedSnapshots, "expected untrusted sensor snapshots").toBeGreaterThan(0);

    const missingPhotoCount = await scanEach(
      region,
      "[data-testid$='-no-photo']",
      "missing-photo state",
    );
    expect(missingPhotoCount, "expected missing-photo states").toBeGreaterThan(0);
  });
}
