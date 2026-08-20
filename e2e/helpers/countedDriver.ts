/**
 * Counted Playwright driver — Tranche B+ PR-B0a.
 *
 * Every deliberate interaction a measurement scenario performs goes through
 * this wrapper, so the recorded counts are deterministic by construction
 * rather than inferred from browser-synthesized event storms (a `fill()`
 * fires no keydowns; `pressSequentially` fires many — neither is a reliable
 * proxy for "what the grower did").
 *
 * Counting rules are fixed in docs/one-tent-loop-efficiency-baseline.md §1.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import type { InteractionCounter } from "./interactionCounter";

export interface CountedDriver {
  /** One deliberate tap/click on a control that advances the flow. */
  click(locator: Locator): Promise<void>;
  /** One required free-text entry. */
  fill(locator: Locator, value: string): Promise<void>;
  /** One deliberate key activation (keyboard-only journeys). */
  press(locator: Locator, key: string): Promise<void>;
  /** A grow/tent/plant selection the app already had context for. */
  reselectTarget(open: Locator, option: Locator): Promise<void>;
  /**
   * Begin counting REAL main-frame route changes. Call once, after the
   * scenario's setup navigation has settled — setup is not an interaction the
   * grower performs, so it must not appear in the receipt.
   */
  beginRouteObservation(): void;
  /**
   * Assert the app landed where the scenario expects. Counts NOTHING: route
   * transitions are observed, not asserted (see the note on this file's
   * observer). Calling this is a correctness check, not a measurement.
   */
  expectRoute(pathFragment: string): Promise<void>;
}

/**
 * Route transitions are OBSERVED, never asserted.
 *
 * The first version counted one transition per `expectRoute()` call, which
 * measured the spec's own assertions rather than the app's behavior: an
 * intermediate redirect still counted one (the assertion only ever sees the
 * final URL), and a scenario that never called the helper reported zero even
 * if the app had started auto-navigating. Both preserve an authoritative
 * receipt number across exactly the regression it exists to catch.
 *
 * So the main frame is watched directly. Same-path re-navigations (a
 * `replace` that keeps the pathname) are not transitions and are skipped;
 * every genuine pathname change counts, including each hop of a redirect
 * chain — a hop the grower waits through is a transition they paid for.
 *
 * `gotoCounted` was removed rather than adapted: with a live observer it
 * would have double-counted its own navigation, and no scenario used it.
 * Setup navigation stays a plain `page.goto()` performed before observation
 * is armed.
 */
export function createCountedDriver(page: Page, counter: InteractionCounter): CountedDriver {
  let observing = false;
  let lastPath: string | null = null;

  page.on("framenavigated", (frame) => {
    if (!observing || frame !== page.mainFrame()) return;
    const path = safePathname(frame.url());
    if (path === null || path === lastPath) return;
    lastPath = path;
    counter.recordRouteTransition();
  });

  return {
    async click(locator: Locator) {
      await locator.click();
      counter.recordClick();
    },
    async fill(locator: Locator, value: string) {
      await locator.fill(value);
      counter.recordFill();
    },
    async press(locator: Locator, key: string) {
      await locator.press(key);
      counter.recordKeypress();
    },
    async reselectTarget(open: Locator, option: Locator) {
      // A Select is two deliberate interactions: open, then choose.
      await open.click();
      counter.recordClick();
      await option.click();
      counter.recordClick();
      counter.recordReselection();
    },
    beginRouteObservation() {
      lastPath = safePathname(page.url());
      observing = true;
    },
    async expectRoute(pathFragment: string) {
      await expect(page).toHaveURL(new RegExp(escapeForRegExp(pathFragment)));
    },
  };
}

function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    // about:blank and friends are not app routes.
    return null;
  }
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
