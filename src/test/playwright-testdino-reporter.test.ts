/**
 * Contract test: TestDino live-stream reporter is optional and env-gated.
 *
 * Asserts the RESOLVED playwright.config reporter array (not source text):
 *   1. list + html + json stay attached whether or not TESTDINO_TOKEN is set.
 *   2. `@testdino/playwright` is added only when TESTDINO_TOKEN is non-empty.
 *   3. The reporter option token is the env value, never a hardcoded secret.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "TESTDINO_TOKEN",
  "CI",
  "E2E_TEST_EMAIL",
  "PLAYWRIGHT_RETRIES",
  "E2E_BASE_URL",
] as const;

type ReporterTuple = [string, { token?: string }?];

type ResolvedConfig = {
  reporter?: unknown;
};

async function loadConfig(): Promise<ResolvedConfig> {
  vi.resetModules();
  const mod = await import("../../playwright.config");
  return mod.default as ResolvedConfig;
}

function reporterList(config: ResolvedConfig): ReporterTuple[] {
  const reporter = config.reporter;
  if (!Array.isArray(reporter)) return [];
  const entries = reporter as unknown[];
  if (entries.length > 0 && typeof entries[0] === "string") {
    return [[entries[0] as string, entries[1] as { token?: string } | undefined]];
  }
  return entries.filter(
    (entry): entry is ReporterTuple => Array.isArray(entry) && typeof entry[0] === "string",
  );
}

function reporterName(entry: ReporterTuple): string {
  return entry[0];
}

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("playwright TestDino reporter", () => {
  it("keeps list, html, and json reporters when TESTDINO_TOKEN is unset", async () => {
    const cfg = await loadConfig();
    const names = reporterList(cfg).map(reporterName);
    expect(names).toEqual(["list", "html", "json"]);
  });

  it("does not attach TestDino for a whitespace-only TESTDINO_TOKEN", async () => {
    process.env.TESTDINO_TOKEN = "   ";
    const cfg = await loadConfig();
    const names = reporterList(cfg).map(reporterName);
    expect(names).toEqual(["list", "html", "json"]);
    expect(names).not.toContain("@testdino/playwright");
  });

  it("adds @testdino/playwright with the env token when TESTDINO_TOKEN is set", async () => {
    const fixtureToken = "td_test_fixture_not_a_secret";
    process.env.TESTDINO_TOKEN = fixtureToken;
    const cfg = await loadConfig();
    const reporters = reporterList(cfg);
    expect(reporters.map(reporterName)).toEqual(["list", "html", "json", "@testdino/playwright"]);
    const testdino = reporters[3];
    expect(testdino[1]?.token).toBe(fixtureToken);
  });
});
