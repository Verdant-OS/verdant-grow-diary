/**
 * Contract test for playwright.config.ts retry + artifact-capture policy.
 *
 * Guards the three properties the Quick Log smoke depends on to pinpoint
 * failures in CI:
 *   1. CI defaults to at least one retry per test so a flake produces both
 *      an original-attempt and a retry artifact set.
 *   2. Ordinary runs retain failure media; proof runs suppress it across setup
 *      and specs and guard the report upload boundary.
 *   3. Real-auth runs (E2E_TEST_EMAIL set) MUST have `trace: "off"` — trace
 *      zips would bake the disposable test account's Supabase bearer token
 *      into a public CI artifact.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "js-yaml";
import { assertNoPlaywrightFailureMedia } from "../../scripts/check-playwright-failure-media.mjs";

const CI_KEYS = [
  "CI",
  "E2E_TEST_EMAIL",
  "PLAYWRIGHT_RETRIES",
  "E2E_BASE_URL",
  "TESTDINO_TOKEN",
  "E2E_MEASURE_SIGNED_IN_PERFORMANCE",
  "E2E_DISABLE_FAILURE_MEDIA",
] as const;

async function loadConfig() {
  vi.resetModules();
  const mod = await import("../../playwright.config");
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
  }, 30_000);

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

  it.each(["E2E_MEASURE_SIGNED_IN_PERFORMANCE", "E2E_DISABLE_FAILURE_MEDIA"] as const)(
    "disables all failure media for the entire run when %s is true",
    async (key) => {
      process.env.CI = "true";
      process.env[key] = "true";
      const cfg = await loadConfig();
      expect(cfg.use).toMatchObject({ trace: "off", video: "off", screenshot: "off" });
    },
  );

  it.each(["false", "", "TRUE"])("does not enable the media opt-out for %j", async (value) => {
    process.env.E2E_MEASURE_SIGNED_IN_PERFORMANCE = value;
    process.env.E2E_DISABLE_FAILURE_MEDIA = value;
    const cfg = await loadConfig();
    expect(cfg.use).toMatchObject({
      trace: "on-first-retry",
      video: "retain-on-failure",
      screenshot: "only-on-failure",
    });
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

describe("Quick Log workflow media boundary", () => {
  const workflow = load(readFileSync(".github/workflows/quicklog-smoke.yml", "utf8")) as {
    jobs: Record<
      string,
      {
        env: Record<string, string>;
        steps: { id?: string; if?: string; run?: string; with?: { path?: string } }[];
      }
    >;
  };
  const job = workflow.jobs["quicklog-smoke"];

  it("disables media for setup, fixture verification and smoke while retaining JSON evidence", async () => {
    expect(job.env.E2E_DISABLE_FAILURE_MEDIA).toBe("true");
    process.env.E2E_DISABLE_FAILURE_MEDIA = job.env.E2E_DISABLE_FAILURE_MEDIA;
    const cfg = await loadConfig();
    expect(cfg.use).toMatchObject({ trace: "off", video: "off", screenshot: "off" });
    expect(job.steps.find((step) => step.id === "upload_smoke_report_json")!.with!.path).toBe(
      "e2e/results/quicklog-smoke-report.json",
    );
  });

  it.each(["upload_playwright_media", "upload_playwright_traces", "upload_per_test_artifacts"])(
    "refuses unrestricted attachment upload through %s in the no-media run",
    (id) => {
      expect(job.steps.find((step) => step.id === id)!.if).toContain(
        "env.E2E_DISABLE_FAILURE_MEDIA != 'true'",
      );
    },
  );

  it.each(["upload_playwright_report", "upload_smoke_bundle"])(
    "requires a successful media boundary before publishing the report through %s",
    (id) => {
      expect(job.steps.find((step) => step.id === "media_boundary")!.run).toBe(
        "node scripts/check-playwright-failure-media.mjs",
      );
      expect(job.steps.find((step) => step.id === id)!.if).toContain(
        "steps.media_boundary.outcome == 'success'",
      );
    },
  );
});

describe("failure media scan", () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "verdant-media-boundary-"));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("accepts missing output and nested text/JSON evidence without changing it", () => {
    const nested = join(directory, "attachments");
    mkdirSync(nested);
    const receipt = join(nested, "quicklog-performance.json");
    writeFileSync(receipt, '{"status":"BLOCKED","elapsedMs":null}');
    expect(() =>
      assertNoPlaywrightFailureMedia([directory, join(directory, "missing")]),
    ).not.toThrow();
    expect(readFileSync(receipt, "utf8")).toBe('{"status":"BLOCKED","elapsedMs":null}');
  });

  it.each(["PNG", "jpg", "jpeg", "gif", "webm", "mp4", "zip"])(
    "blocks a nested %s artifact without exposing its filename or content",
    (extension) => {
      const nested = join(directory, "attachments");
      mkdirSync(nested);
      writeFileSync(join(nested, "private-grower." + extension), "private-screen");
      expect(() => assertNoPlaywrightFailureMedia([directory])).toThrow(
        /^unexpected_playwright_failure_media$/,
      );
    },
  );
});
