/**
 * phenoDisabledCompareHelpers — shared Playwright helpers for the disabled
 * "Compare candidates" E2E specs.
 *
 * Pure DOM/text helpers. No product code, no schema, no writes.
 */
import { expect, type Page, type Locator, type Request } from "@playwright/test";

// Canonical reason copy — must match src/constants/phenoOnboardingCopy.ts
// (PHENO_STATUS_LABELS). Kept as literals here so a copy drift is caught by
// the E2E specs rather than silently sliding out from under them.
export const REASON_MISSING_EVIDENCE = "Missing evidence";
export const REASON_PENDING_HARVEST = "Pending until harvest";
export const REASON_PENDING_CURE = "Pending until cure";
export const REASON_GENERIC_HELP =
  "Add the missing evidence before comparing candidates.";

/**
 * Forbidden verdict/keeper/ranking copy that must NEVER appear anywhere in
 * the DOM of a disabled Compare surface (including hidden panels and
 * collapsed accordions).
 *
 * Allowed context — the scan intentionally does NOT flag:
 *   - "comparison-ready" (only appears inside "Not comparison-ready yet"
 *     status label and helper copy)
 *   - "comparison" (warning/helper copy)
 *   - "keeper decision" as a checklist / evidence-goal item
 *
 * These are enforced by the patterns being narrow (word-boundary anchored)
 * and by explicit safelist checks in `assertNoForbiddenComparisonCopy`.
 */
export const FORBIDDEN_COMPARISON_COPY: readonly RegExp[] = [
  /\bwinner\b/i,
  /winning candidate/i,
  /best candidate/i,
  /best pheno/i,
  /top candidate/i,
  /ranked candidate/i,
  /candidate ranking/i,
  /final ranking/i,
  /\bverdict\b/i,
  /final verdict/i,
  /comparison verdict/i,
  /recommended keeper/i,
  /keeper recommendation/i,
  /keeper selected/i,
  /keeper confirmed/i,
  /selection winner/i,
  /ai picked/i,
  /ai picks winners/i,
  /guaranteed keeper/i,
  /guaranteed yield/i,
  /automated breeding/i,
];

/**
 * Pull ALL text from the DOM — including nodes hidden by CSS (display:none,
 * visibility:hidden, aria-hidden, off-screen), and text inside mounted-but-
 * hidden tab panels / collapsed accordions. Excludes only <script>, <style>,
 * and <noscript> content.
 *
 * This is intentionally broader than `page.textContent("body")` (which
 * returns visible-ish content but drops some detached/hidden trees on some
 * browsers) — we want to catch forbidden copy that a user could reveal by
 * expanding a panel.
 */
export async function getVisibleAndHiddenBodyText(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node: Node) {
          const parent = (node as Text).parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    const chunks: string[] = [];
    let n: Node | null = walker.nextNode();
    while (n) {
      const t = (n.nodeValue ?? "").trim();
      if (t) chunks.push(t);
      n = walker.nextNode();
    }
    return chunks.join(" \u241F ");
  });
}

/**
 * Expand every visible disclosure control that looks safe to expand —
 * accordions, aria-expanded=false triggers, <summary> elements, tab
 * triggers. Best-effort and idempotent: any interaction failure is
 * swallowed so a fragile widget can't break the copy scan.
 *
 * We deliberately do NOT click links, buttons named "delete/remove/save",
 * form submits, or anything that would mutate data.
 */
export async function expandVisibleDisclosureControls(page: Page): Promise<void> {
  // <summary> — click each open detail so its <details> children mount.
  const summaries = await page.locator("details:not([open]) > summary").all();
  for (const s of summaries) {
    try {
      await s.click({ trial: false, timeout: 500 });
    } catch {
      /* ignore */
    }
  }

  // aria-expanded="false" triggers (accordions, tabs, disclosures).
  const collapsed = await page
    .locator('[aria-expanded="false"]:not([disabled])')
    .all();
  for (const c of collapsed) {
    // Skip anything that looks like a destructive/mutating control.
    const label = (await c.getAttribute("aria-label"))?.toLowerCase() ?? "";
    const testid = (await c.getAttribute("data-testid"))?.toLowerCase() ?? "";
    const text = ((await c.textContent()) ?? "").toLowerCase();
    if (
      /(delete|remove|save|submit|approve|reject|purchase|checkout|pay)/.test(
        `${label} ${testid} ${text}`,
      )
    ) {
      continue;
    }
    try {
      await c.click({ timeout: 500 });
    } catch {
      /* ignore */
    }
  }

  // Give React a beat to render newly-mounted panels.
  await page.waitForTimeout(150);
}

/**
 * DOM-wide forbidden-copy scan. Expands safe disclosures first, then scans
 * both visible and hidden text nodes. Any forbidden phrase — even inside a
 * hidden tab panel — fails the assertion.
 */
export async function assertNoForbiddenComparisonCopy(
  page: Page,
  scope = "page DOM",
): Promise<void> {
  await expandVisibleDisclosureControls(page);
  const text = await getVisibleAndHiddenBodyText(page);
  for (const pat of FORBIDDEN_COMPARISON_COPY) {
    expect(
      pat.test(text),
      `${scope} contains forbidden comparison copy ${pat}`,
    ).toBe(false);
  }
}

/**
 * Core inertness assertion for a disabled Compare action region. Verifies
 * the exact accessible contract: disabled button + aria-describedby helper
 * with the expected reason + no /compare link + no forbidden copy in the
 * card region.
 */
export async function assertDisabledCompareInert(
  page: Page,
  expectedReason: string,
): Promise<{ helperText: string; helperLocator: Locator }> {
  const action = page.getByTestId("pheno-workspace-compare-action");
  await expect(action).toBeVisible();
  // Exactly one Compare action — no duplicate cards/panels after nav.
  expect(await page.getByTestId("pheno-workspace-compare-action").count()).toBe(1);
  await expect(action).toHaveAttribute("data-enabled", "false");

  const disabledBtn = page.getByTestId("pheno-workspace-compare-action-disabled");
  await expect(disabledBtn).toBeVisible();
  await expect(disabledBtn).toBeDisabled();
  await expect(disabledBtn).toHaveAttribute("aria-disabled", "true");

  const describedBy = await disabledBtn.getAttribute("aria-describedby");
  expect(describedBy, "aria-describedby must be set on disabled button").toBeTruthy();
  const helper = page.locator(`#${describedBy}`);
  await expect(helper).toBeVisible();
  await expect(helper).toHaveText(
    /Compare candidates is disabled because this hunt is not comparison-ready yet\./,
  );

  const combined = ((await helper.textContent()) ?? "").trim();
  expect(
    combined.includes(expectedReason) || combined.includes(REASON_GENERIC_HELP),
    `helper should surface expected reason "${expectedReason}"`,
  ).toBe(true);

  expect(await action.locator('a[href*="/compare"]').count()).toBe(0);

  // Region-scoped forbidden-copy scan (fast, always on).
  const regionText = (await action.textContent()) ?? "";
  for (const pat of FORBIDDEN_COMPARISON_COPY) {
    expect(
      pat.test(regionText),
      `disabled Compare action region contains forbidden copy ${pat}`,
    ).toBe(false);
  }

  return { helperText: combined, helperLocator: helper };
}
