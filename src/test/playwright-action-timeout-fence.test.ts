/**
 * Config fence: every Playwright action must be time-bounded.
 *
 * Playwright's default `actionTimeout` is 0 (unlimited), so a single wedged
 * action consumes the entire test budget and reports only "Test timeout
 * exceeded" — no call log, no indication of which action died. That is
 * precisely how the authenticated browser census burned 900s retrying one
 * click that an overlay was intercepting, ~926 times, in silence.
 *
 * This asserts the bound exists and stays finite; the exact value is free to
 * change as runners get slower or faster.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG_SOURCE = readFileSync(resolve(process.cwd(), "playwright.config.ts"), "utf8");

describe("playwright action timeout fence", () => {
  it("declares a finite actionTimeout in the shared `use` block", () => {
    const match = CONFIG_SOURCE.match(/actionTimeout:\s*([0-9_]+)/);
    expect(match, "playwright.config.ts must declare actionTimeout").not.toBeNull();

    const value = Number(match![1].replace(/_/g, ""));
    expect(Number.isFinite(value)).toBe(true);
    // 0 is Playwright's "unlimited" sentinel — the exact failure mode this
    // fence exists to prevent.
    expect(value).toBeGreaterThan(0);
    // Sanity ceiling: an action bound at or above the per-test budget would
    // reintroduce the silent-wedge behaviour.
    expect(value).toBeLessThan(60_000);
  });
});
