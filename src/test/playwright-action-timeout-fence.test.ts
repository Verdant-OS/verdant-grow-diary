/**
 * Contract test: every Playwright action must be time-bounded.
 *
 * Playwright's default `actionTimeout` is 0 (unlimited), so a single wedged
 * action consumes the entire test budget and reports only "Test timeout
 * exceeded" — no call log, no indication of which action died. That is
 * precisely how the authenticated browser census burned 900s retrying one
 * click that an overlay was intercepting, ~926 times, in silence.
 *
 * Asserts against the RESOLVED config (same approach as
 * playwright-config-retry-policy.test.ts, which guards this same file) rather
 * than the source text. A source regex cannot tell the difference between a
 * live setting, one commented out, and one moved into a single project's
 * `use` — all three read the same to a text match while only the first
 * actually bounds anything.
 */
import { describe, expect, it, vi } from "vitest";

type ResolvedConfig = {
  timeout?: number;
  use?: { actionTimeout?: number };
  projects?: Array<{ name?: string; use?: { actionTimeout?: number } }>;
};

async function loadConfig(): Promise<ResolvedConfig> {
  vi.resetModules();
  const mod = await import("../../playwright.config");
  return mod.default as ResolvedConfig;
}

describe("playwright action timeout fence", () => {
  it("bounds actions globally via the shared `use` block", async () => {
    const config = await loadConfig();
    const actionTimeout = config.use?.actionTimeout;

    expect(actionTimeout, "playwright.config.ts must set use.actionTimeout").toBeTypeOf("number");
    expect(Number.isFinite(actionTimeout)).toBe(true);
    // 0 is Playwright's "unlimited" sentinel — the exact failure mode this
    // fence exists to prevent.
    expect(actionTimeout as number).toBeGreaterThan(0);
  });

  it("keeps the action bound strictly under the per-test budget", async () => {
    const config = await loadConfig();
    const actionTimeout = config.use?.actionTimeout as number;
    // An action allowed to run as long as the test itself reintroduces the
    // silent-wedge behaviour: the action never errors, the test just dies.
    if (typeof config.timeout === "number" && config.timeout > 0) {
      expect(actionTimeout).toBeLessThan(config.timeout);
    }
    expect(actionTimeout).toBeLessThan(60_000);
  });

  it("lets no project silently opt back into unlimited actions", async () => {
    const config = await loadConfig();
    for (const project of config.projects ?? []) {
      const override = project.use?.actionTimeout;
      if (override === undefined) continue; // inherits the bounded global
      expect(
        override,
        `project "${project.name ?? "(unnamed)"}" must not disable the action bound`,
      ).toBeGreaterThan(0);
      expect(Number.isFinite(override)).toBe(true);
    }
  });
});
