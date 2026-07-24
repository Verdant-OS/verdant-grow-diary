/**
 * Contract test for playwright.config.ts retry + artifact-capture policy.
 *
 * Guards the three properties the Quick Log smoke depends on to pinpoint
 * failures in CI:
 *   1. CI defaults to at least one retry per test so a flake produces both
 *      an original-attempt and a retry artifact set.
 *   2. Video/screenshot are retained on failure (they contain no tokens and
 *      always upload).
 *   3. Real-auth runs (E2E_TEST_EMAIL set) MUST have `trace: "off"` — trace
 *      zips would bake the disposable test account's Supabase bearer token
 *      into a public CI artifact.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CI_KEYS = ["CI", "E2E_TEST_EMAIL", "PLAYWRIGHT_RETRIES", "E2E_BASE_URL"] as const;

async function loadConfig() {
  // Bust the module cache so env changes in each test are honored.
  const url = new URL(`../../playwright.config.ts?t=${Date.now()}${Math.random()}`, import.meta.url).href;
  const mod = await import(/* @vite-ignore */ url);
  return mod.default as {
    retries: number;
    use: { trace: string; video: string; screenshot: string };
  };
}

let saved: Partial<Record<(typeof CI_KEYS)[number], string | undefined>> = {};
beforeEach(() => {
  saved = {};
  for (const k of CI_KEYS) saved[k] = process.env[k];
  for (const k of CI_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of CI_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("playwright.config retry + artifact policy", () => {
  it("retries 0 times locally when CI is unset", async () => {
    const cfg = await loadConfig();
    expect(cfg.retries).toBe(0);
  });

  it("retries at least once in CI so flakes produce a retry artifact set", async () => {
    process.env.CI = "true";
    const cfg = await loadConfig();
    expect(cfg.retries).toBeGreaterThanOrEqual(1);
  });

  it("honors PLAYWRIGHT_RETRIES override for deeper flake triage", async () => {
    process.env.CI = "true";
    process.env.PLAYWRIGHT_RETRIES = "3";
    const cfg = await loadConfig();
    expect(cfg.retries).toBe(3);
  });

  it("ignores a garbage PLAYWRIGHT_RETRIES value and falls back to the CI default", async () => {
    process.env.CI = "true";
    process.env.PLAYWRIGHT_RETRIES = "not-a-number";
    const cfg = await loadConfig();
    expect(cfg.retries).toBeGreaterThanOrEqual(1);
  });

  it("keeps video + screenshot retained on failure so CI always uploads them", async () => {
    process.env.CI = "true";
    const cfg = await loadConfig();
    expect(cfg.use.video).toBe("retain-on-failure");
    expect(cfg.use.screenshot).toBe("only-on-failure");
  });

  it("captures a trace on the retried attempt when no real-auth secrets are present", async () => {
    process.env.CI = "true";
    const cfg = await loadConfig();
    expect(cfg.use.trace).toBe("on-first-retry");
  });

  it("forces trace OFF when E2E_TEST_EMAIL is set (token-safety carve-out)", async () => {
    process.env.CI = "true";
    process.env.E2E_TEST_EMAIL = "disposable@example.com";
    const cfg = await loadConfig();
    expect(cfg.use.trace).toBe("off");
  });
});
