/**
 * Test-only selector helpers for asserting absence (or presence) of the
 * paywall / upsell CTA surface across AI surfaces (AI Doctor, AI Coach).
 *
 * These centralize the markup/copy contract so individual regression tests
 * don't drift if PaywallCta testids, link targets, or upsell copy change.
 *
 * Pure DOM queries. No React, no fetching.
 */
import { screen, within } from "@testing-library/react";

/** Stable testid substrings that indicate a paywall surface is mounted. */
export const PAYWALL_TESTID_SUBSTRINGS = ["paywall"] as const;

/** href substrings that indicate an upsell link target. */
export const PAYWALL_HREF_SUBSTRINGS = ["/pricing"] as const;

/** Copy patterns that indicate upsell/paywall language. */
export const PAYWALL_COPY_PATTERNS: readonly RegExp[] = [
  /see plans/i,
  /upgrade/i,
  /go pro/i,
];

/** data-kind values on AiCreditLimitNotice that indicate an upsell branch. */
export const PAYWALL_DATA_KINDS = ["upsell"] as const;

export interface PaywallCtaQueryRoot {
  /** Default: document.body via @testing-library/react `screen`. */
  container?: HTMLElement;
}

function root(opts?: PaywallCtaQueryRoot): HTMLElement {
  return opts?.container ?? document.body;
}

/** Returns all elements with a paywall-shaped testid. */
export function queryAllPaywallTestidElements(
  opts?: PaywallCtaQueryRoot,
): HTMLElement[] {
  const selector = PAYWALL_TESTID_SUBSTRINGS
    .map((s) => `[data-testid*="${s}"]`)
    .join(",");
  return Array.from(root(opts).querySelectorAll<HTMLElement>(selector));
}

/** Returns all elements tagged as the upsell notice branch. */
export function queryAllUpsellKindElements(
  opts?: PaywallCtaQueryRoot,
): HTMLElement[] {
  const selector = PAYWALL_DATA_KINDS
    .map((k) => `[data-kind="${k}"]`)
    .join(",");
  return Array.from(root(opts).querySelectorAll<HTMLElement>(selector));
}

/** Returns all anchors whose href points at a known upsell target. */
export function queryAllPaywallLinks(
  opts?: PaywallCtaQueryRoot,
): HTMLAnchorElement[] {
  return Array.from(root(opts).querySelectorAll("a")).filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return PAYWALL_HREF_SUBSTRINGS.some((s) => href.includes(s));
  });
}

/** Returns any text nodes matching upsell copy patterns within `root`. */
export function queryAllPaywallCopyMatches(
  opts?: PaywallCtaQueryRoot,
): HTMLElement[] {
  const scope = opts?.container ? within(opts.container) : screen;
  const found: HTMLElement[] = [];
  for (const pattern of PAYWALL_COPY_PATTERNS) {
    found.push(...scope.queryAllByText(pattern));
  }
  return found;
}

/**
 * Aggregate assertion: fails when ANY paywall signal is present.
 * Use in regression tests that must prove a surface stays plan-neutral.
 */
export function expectNoPaywallCta(opts?: PaywallCtaQueryRoot): void {
  const testids = queryAllPaywallTestidElements(opts);
  const upsells = queryAllUpsellKindElements(opts);
  const links = queryAllPaywallLinks(opts);
  const copy = queryAllPaywallCopyMatches(opts);

  if (testids.length || upsells.length || links.length || copy.length) {
    const detail = {
      paywallTestids: testids.map((el) => el.getAttribute("data-testid")),
      upsellKinds: upsells.map((el) => el.getAttribute("data-testid")),
      pricingHrefs: links.map((el) => el.getAttribute("href")),
      copyMatches: copy.map((el) => el.textContent),
    };
    throw new Error(
      `Expected no paywall CTA, but found: ${JSON.stringify(detail)}`,
    );
  }
}
