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
  /** Navigate and verify the landing path; counts one route transition. */
  gotoCounted(path: string): Promise<void>;
  /** Verify an in-app navigation already happened; counts one transition. */
  expectRoute(pathFragment: string): Promise<void>;
}

export function createCountedDriver(page: Page, counter: InteractionCounter): CountedDriver {
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
    async gotoCounted(path: string) {
      await page.goto(path);
      counter.recordRouteTransition();
    },
    async expectRoute(pathFragment: string) {
      await expect(page).toHaveURL(new RegExp(escapeForRegExp(pathFragment)));
      counter.recordRouteTransition();
    },
  };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
