import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * /pheno-comparison visual-style regression (screenshot + DOM) — selection-grade
 * surface.
 *
 * Purpose:
 *  Prevent risky selection evidence (thin / partial / stale / invalid / demo /
 *  unknown / incomplete) from rendering with green/OK/success visual styling.
 *  Scans not only the risky candidate cards but every risky SUBCOMPONENT inside
 *  the screenshot region — the selection-strength chip, evidence-gap caveat
 *  rows, "Not recorded" phenotype rows, timepoint/replication warnings, the
 *  post-cure "not cured" state, and the demoted environment-context section
 *  (source chip + stale/invalid badges + missing-metric flags).
 *
 * Primary pass/fail is deterministic DOM/class/data-attribute assertions.
 * Screenshots are captured for human review only — no pixel equality asserted.
 *
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

// Demo candidates with risky (partial / thin) selection evidence.
const RISKY_CANDIDATES = [
  "pheno-comparison-candidate-cand-2",
  "pheno-comparison-candidate-cand-3",
  "pheno-comparison-candidate-cand-4",
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

for (const vp of VIEWPORTS) {
  // FIXME: never-green on this branch — this spec was authored on the side
  // branch that built the Pheno Comparison surface (e7e4e72d / be8ac1f7) and
  // pins testids (pheno-comparison-readonly-badge, pheno-comparability-verdict,
  // per-candidate strength chips, …) that the page version imported to trunk
  // never rendered. The trunk page has since become the product truth (the
  // Pheno Hunt foundation evolved the shared libs), so re-enabling requires
  // reconciling the imported surface with the evolved libs. Tracked follow-up:
  // "Reconcile imported Pheno Comparison v0 surface".
  test.fixme(`/pheno-comparison risky-state visual-style stays non-success @ ${vp.name}`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
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

    // Disclaimer + legend + comparability verdict + a missing-photo flag.
    await expect(page.getByTestId("pheno-comparison-readonly-badge")).toBeVisible();
    await expect(page.getByTestId("pheno-comparison-demo-banner")).toContainText(
      /not real telemetry/i,
    );
    await expect(page.getByTestId("pheno-comparison-source-legend")).toBeVisible();
    await expect(page.getByTestId("pheno-comparability-verdict")).toHaveAttribute(
      "data-verdict",
      "not_comparable",
    );
    await expect(page.getByTestId("pheno-photo-missing-cand-3")).toBeVisible();

    // (1) Region-wide: no success STATUS ATTRIBUTES anywhere (safe globally).
    for (const { attr, value } of FORBIDDEN_STATUS_ATTRS) {
      expect(
        await region.locator(`[${attr}="${value}"]`).count(),
        `forbidden ${attr}="${value}" attribute present on pheno-comparison`,
      ).toBe(0);
    }

    // (2) Each risky candidate card: deep descendant scan.
    for (const candTestId of RISKY_CANDIDATES) {
      const card = page.getByTestId(candTestId);
      await expect(card).toBeVisible();
      // The selection-strength chip must be risky-toned, never neutral/green.
      const chip = card.getByTestId(
        `pheno-selection-strength-${candTestId.replace("pheno-comparison-candidate-", "")}`,
      );
      const tone = await chip.getAttribute("data-tone");
      expect(["caution", "danger"], `${candTestId} strength tone`).toContain(tone);
      expectScopeClean(`risky card ${candTestId}`, await scanScope(card));
    }

    // (3) Risky SUBCOMPONENTS across the region, scanned individually:
    const untrustedBadges = region.locator("[data-testid^='pheno-source-badge-'][data-source]");
    const badgeCount = await untrustedBadges.count();
    let scannedUntrusted = 0;
    for (let i = 0; i < badgeCount; i++) {
      const badge = untrustedBadges.nth(i);
      const source = (await badge.getAttribute("data-source")) ?? "";
      if (!UNTRUSTED_SOURCES.includes(source)) continue; // trusted (live/manual/csv)
      scannedUntrusted++;
      expectScopeClean(`untrusted source chip [${source}]`, await scanScope(badge));
    }

    const envFlagCount = await scanEach(
      region,
      "[data-testid*='-envflag-']",
      "environment missing-metric flag",
    );
    const caveatCount = await scanEach(
      region,
      "[data-testid^='pheno-caveat-']",
      "selection-evidence caveat row",
    );
    const staleCount = await scanEach(
      region,
      "[data-testid^='pheno-envcontext-stale-']",
      "stale telemetry badge",
    );
    const invalidCount = await scanEach(
      region,
      "[data-testid^='pheno-envcontext-invalid-']",
      "invalid telemetry badge",
    );
    const noPhotoCount = await scanEach(
      region,
      "[data-testid^='pheno-photo-missing-']",
      "no-photo empty state",
    );

    // Sanity: the demo dataset must actually exercise these risky
    // subcomponents so the scans above are not vacuously empty.
    expect(scannedUntrusted, "expected >=1 untrusted source chip").toBeGreaterThan(0);
    expect(staleCount + invalidCount, "expected stale + invalid badges").toBeGreaterThan(0);
    expect(
      caveatCount + noPhotoCount,
      "expected >=1 caveat / no-photo subcomponent",
    ).toBeGreaterThan(0);
    // envFlagCount may legitimately be 0 for this fixture set; reference it so
    // lint does not flag an unused value.
    void envFlagCount;

    await region.screenshot({
      path: `e2e/screenshots/pheno-comparison-visual-style-${vp.name}.png`,
    });
  });
}
